// @effect-diagnostics nodeBuiltinImport:off -- runs one restricted, tool-free Claude CLI inference per receipt.
import * as NodeChildProcess from "node:child_process";
import * as NodeFSP from "node:fs/promises";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as Schema from "effect/Schema";
import type { TaskAttempt, TaskBrief } from "@t3tools/contracts";
import { guardedBase, readGuardedFiles, writeGuardedCandidate } from "./guardedCandidate.ts";

type State = NonNullable<TaskAttempt["guarded"]>;
const outcome = Schema.Struct({
  decision: Schema.Literals([
    "propose",
    "contest",
    "uphold",
    "amend",
    "pass",
    "changes_requested",
    "blocked",
  ]),
  summary: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(4000)),
  path: Schema.String,
  edits: Schema.Array(
    Schema.Struct({ path: Schema.String, content: Schema.NullOr(Schema.String) }),
  ).check(Schema.isMaxLength(12)),
});
const decodeOutcome = Schema.decodeUnknownSync(outcome);
export const initialGuard = (root: string): State => {
  const base = guardedBase(root);
  return {
    base,
    candidate: base,
    round: 1,
    role: "builder",
    contest: "",
    testPath: "",
    history: [],
    stopped: false,
  };
};
export function guardedPrompt(
  root: string,
  task: TaskBrief,
  state: State,
  selectedDesign?: {
    task: string;
    attempt: number;
    summary: string;
    verification: string;
    reference: string;
  },
) {
  const scope = task.queueStep!.guarded!;
  return JSON.stringify({
    role: state.role,
    request: task.request,
    reference: task.reference,
    selectedDesign,
    step: task.queueStep!.next,
    criteria: task.queueStep!.verification,
    subtasks: task.attempts[0]?.steps.map((s) => s.title),
    instructions:
      state.role === "builder"
        ? "Propose full replacement contents for named source files, or contest one named test with a reason and no edits."
        : state.role === "reviewer"
          ? "Compare the original and candidate against the request, tests and every criterion. Return pass, changes_requested or blocked with evidence. Identify what was actually inspected. You cannot execute tests."
          : "Independently adjudicate the contested test against the requirement. Uphold it, or author your own amendment to that single test. Use null content only if removing it is justified.",
    format:
      "Return only a JSON object with decision, summary, path (empty unless contesting), edits (array of {path,content}, empty for findings). Builder decisions: propose, contest, blocked. Test maintainer decisions: uphold, amend, blocked.",
    source: scope.source,
    tests: scope.tests,
    original: readGuardedFiles(root, state.base, scope),
    candidate: readGuardedFiles(root, state.candidate, scope, true),
    history: state.history.map((h) => h.detail),
    contest: state.contest,
    testPath: state.testPath,
  });
}
export function applyGuardedAnswer(
  root: string,
  task: TaskBrief,
  state: State,
  raw: unknown,
  receipt: string,
) {
  const a = decodeOutcome(raw),
    scope = task.queueStep!.guarded!;
  let next: State = { ...state },
    detail = a.summary;
  const stop = (why: string) => {
    next = { ...next, stopped: true };
    detail = why;
  };
  if (a.decision === "blocked" && !a.edits.length) stop(a.summary);
  else if (state.role === "builder" && a.decision === "propose") {
    const candidate = writeGuardedCandidate(
      root,
      state.candidate,
      scope,
      "builder",
      a.edits,
      "",
      receipt,
    );
    next = { ...next, candidate, role: "reviewer" };
  } else if (
    state.role === "builder" &&
    a.decision === "contest" &&
    !a.edits.length &&
    scope.tests.includes(a.path) &&
    !state.contest
  ) {
    next = { ...next, role: "test-maintainer", contest: a.summary, testPath: a.path };
  } else if (
    state.role === "test-maintainer" &&
    (a.decision === "amend" || (a.decision === "uphold" && !a.edits.length))
  ) {
    if (a.decision === "amend")
      next = {
        ...next,
        candidate: writeGuardedCandidate(
          root,
          state.candidate,
          scope,
          "test-maintainer",
          a.edits,
          state.testPath,
          receipt,
        ),
      };
    next = { ...next, role: "builder" };
  } else if (state.role === "reviewer" && !a.edits.length && a.decision === "pass") {
    stop(
      "Candidate approved by reviewer. Run the independent checks on " +
        state.candidate +
        " before accepting. " +
        a.summary,
    );
  } else if (state.role === "reviewer" && !a.edits.length && a.decision === "changes_requested") {
    if (state.round >= scope.rounds) stop("Round limit reached. " + a.summary);
    else next = { ...next, role: "builder", round: state.round + 1 };
  } else throw Error("The response attempted an action outside the assigned role.");
  return {
    state: next,
    detail: detail.slice(0, 4000),
    approved: state.role === "reviewer" && a.decision === "pass",
  };
}
function invoke(args: string[], cwd: string, input?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = NodeChildProcess.execFile(
      "claude",
      args,
      {
        cwd,
        timeout: 120000,
        maxBuffer: 1024 * 1024,
        env: {
          PATH: process.env.PATH,
          HOME: process.env.HOME,
          USER: process.env.USER,
          LOGNAME: process.env.LOGNAME,
          LANG: process.env.LANG,
          TMPDIR: process.env.TMPDIR,
          ENABLE_CLAUDEAI_MCP_SERVERS: "false",
          CLAUDE_CODE_AUTO_CONNECT_IDE: "0",
        },
      },
      (err, out) =>
        err ? reject(Error("Restricted Claude invocation failed or timed out.")) : resolve(out),
    );
    proc.stdin?.on("error", () => {});
    proc.stdin?.end(input);
  });
}
export async function runGuardedTurn(
  prompt: string,
  model: string,
  maxUsd: number,
  expectedEmail: string,
) {
  const cwd = await NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "it3-turn-"));
  try {
    const auth = JSON.parse(await invoke(["auth", "status", "--json"], cwd));
    if (
      !expectedEmail ||
      !auth.loggedIn ||
      auth.apiProvider !== "firstParty" ||
      auth.email?.toLowerCase() !== expectedEmail.toLowerCase()
    )
      throw Error("The restricted Claude account must match the queue allowance account.");
    const raw = await invoke(
      [
        "-p",
        "--safe-mode",
        "--restricted",
        "--tools",
        "",
        "--strict-mcp-config",
        "--mcp-config",
        '{"mcpServers":{}}',
        "--no-session-persistence",
        "--disable-slash-commands",
        "--output-format",
        "json",
        "--model",
        model,
        "--max-budget-usd",
        String(maxUsd),
        "--system-prompt",
        "You are an independent iT3 project agent. Read the task data and reply as JSON. You have no tools.",
      ],
      cwd,
      prompt,
    );
    const envelope = JSON.parse(raw);
    if (envelope.is_error || typeof envelope.result !== "string" || !envelope.session_id)
      throw Error("The provider returned no usable turn receipt.");
    const u = envelope.usage;
    const tokens =
      u &&
      [
        u.input_tokens,
        u.output_tokens,
        u.cache_read_input_tokens ?? 0,
        u.cache_creation_input_tokens ?? 0,
      ].every((n) => Number.isSafeInteger(n) && n >= 0)
        ? u.input_tokens +
          u.output_tokens +
          (u.cache_read_input_tokens ?? 0) +
          (u.cache_creation_input_tokens ?? 0)
        : null;
    const usd =
      typeof envelope.total_cost_usd === "number" &&
      Number.isFinite(envelope.total_cost_usd) &&
      envelope.total_cost_usd >= 0
        ? envelope.total_cost_usd
        : null;
    let answer: unknown = null;
    try {
      answer = JSON.parse(
        envelope.result.trim().replace(/^\x60\x60\x60(?:json)?\s*|\s*\x60\x60\x60$/g, ""),
      );
    } catch {}
    return { answer, tokens, usd, session: String(envelope.session_id) };
  } finally {
    await NodeFSP.rm(cwd, { force: true, recursive: true });
  }
}

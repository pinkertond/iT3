// @effect-diagnostics nodeBuiltinImport:off -- Git plumbing writes a separate immutable candidate tree.
import * as NodeChildProcess from "node:child_process";
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import type { QueueStep } from "@t3tools/contracts";
type Scope = NonNullable<QueueStep["guarded"]>;
const id = /^[0-9a-f]{40}(?:[0-9a-f]{24})?$/;
const testLike =
  /(?:^|[./_-])(?:tests?|specs?|__tests__|__snapshots__|fixtures?|snapshots?|e2e|evals?|__mocks__|jest|vitest|playwright|cypress|conftest)(?:[./_-]|$)/i;
function git(root: string, args: string[], input?: string, index?: string) {
  return NodeChildProcess.execFileSync(
    "git",
    [
      "--no-replace-objects",
      "--literal-pathspecs",
      "-c",
      "core.hooksPath=/dev/null",
      "-c",
      "core.fsmonitor=false",
      "-C",
      root,
      ...args,
    ],
    {
      encoding: "utf8",
      timeout: 10000,
      maxBuffer: 256000,
      stdio: ["pipe", "pipe", "pipe"],
      input,
      env: {
        PATH: process.env.PATH,
        HOME: process.env.HOME,
        GIT_CONFIG_NOSYSTEM: "1",
        GIT_CONFIG_GLOBAL: "/dev/null",
        GIT_TERMINAL_PROMPT: "0",
        ...(index ? { GIT_INDEX_FILE: index } : {}),
        GIT_AUTHOR_NAME: "iT3",
        GIT_AUTHOR_EMAIL: "guarded@localhost",
        GIT_COMMITTER_NAME: "iT3",
        GIT_COMMITTER_EMAIL: "guarded@localhost",
      },
    },
  );
}
export function guardedBase(root: string) {
  const value = git(root, ["rev-parse", "--verify", "HEAD^{commit}"]).trim();
  if (!id.test(value)) throw Error("The project needs a committed Git baseline.");
  return value;
}
export function readGuardedFiles(
  root: string,
  commit: string,
  scope: Scope,
  allowMissingTests = false,
) {
  if (!id.test(commit)) throw Error("Invalid candidate commit.");
  const files: Record<string, string> = Object.create(null);
  for (const path of [...scope.source, ...scope.tests]) {
    if (
      !/^[\w./ -]{1,200}$/.test(path) ||
      path.split("/").some((p) => !p || p === "." || p.startsWith(".") || p.endsWith(" ")) ||
      Object.hasOwn(files, path)
    )
      throw Error("Use distinct, ordinary tracked project paths.");
    if (
      scope.source.includes(path) &&
      (testLike.test(path) ||
        /(?:Tests?|Specs?)(?:[A-Z]|\.)|(?:^|\/)(?:test|spec)[A-Z]/.test(path) ||
        !/\.(?:tsx?|jsx?|py|rs|go|swift|css|html|java|kt|rb|c|cpp|h)$/.test(path) ||
        /(?:^|\/)(?:setup|build|.*config)\./i.test(path))
    )
      throw Error(
        "Tests, fixtures, configuration and build scripts are outside Builder's write scope.",
      );
    const match = /^(100644|100755) blob ([a-f0-9]+)\t/.exec(
      git(root, ["ls-tree", "-z", commit, "--", path]),
    );
    if (
      !match &&
      allowMissingTests &&
      scope.tests.includes(path) &&
      !git(root, ["ls-tree", commit, "--", path])
    )
      continue;
    if (!match)
      throw Error("Select tracked regular files. Directories and symlinks cannot be written.");
    if (Number(git(root, ["cat-file", "-s", match[2]!])) > 32000)
      throw Error("A selected file exceeds 32 KB.");
    const text = git(root, ["cat-file", "blob", match[2]!]);
    if (text.includes("\0")) throw Error("Select text files.");
    if (
      scope.source.includes(path) &&
      /(?:\b(?:describe|it|test|expect)\s*\(|#\[\s*(?:cfg\(test\)|test)\s*\]|\bdef test_|\bfunc Test[A-Z]|@Test\b)/m.test(
        text,
      )
    )
      throw Error("Classify files containing inline tests as protected.");
    files[path] = text;
  }
  return files;
}
export function writeGuardedCandidate(
  root: string,
  parent: string,
  scope: Scope,
  role: "builder" | "test-maintainer",
  edits: readonly { path: string; content: string | null }[],
  contested: string,
  receipt: string,
) {
  const files = readGuardedFiles(root, parent, scope, true);
  if (!edits.length || edits.length > 12 || new Set(edits.map((e) => e.path)).size !== edits.length)
    throw Error("Expected distinct candidate edits.");
  for (const e of edits) {
    if (
      !Object.hasOwn(files, e.path) ||
      (role === "builder"
        ? !scope.source.includes(e.path) || e.content === null
        : e.path !== contested || !scope.tests.includes(e.path))
    )
      throw Error("Protected path: this agent cannot write or delete " + e.path);
    if (e.content !== null && (Buffer.byteLength(e.content) > 32000 || e.content.includes("\0")))
      throw Error("Invalid replacement text.");
  }
  if (!/^[a-f0-9]{64}$/.test(receipt)) throw Error("Invalid run receipt.");
  const scratch = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "it3-index-"));
  try {
    const index = NodePath.join(scratch, "index");
    git(root, ["read-tree", parent], undefined, index);
    for (const e of edits) {
      if (e.content === null)
        git(root, ["update-index", "--force-remove", "--", e.path], undefined, index);
      else {
        const blob = git(root, ["hash-object", "-w", "--stdin"], e.content).trim();
        const mode = git(root, ["ls-tree", parent, "--", e.path]).slice(0, 6);
        git(root, ["update-index", "--cacheinfo", mode, blob, e.path], undefined, index);
      }
    }
    const tree = git(root, ["write-tree"], undefined, index).trim();
    const commit = git(root, [
      "commit-tree",
      tree,
      "-p",
      parent,
      "-m",
      "iT3 " + role + " proposal " + receipt,
    ]).trim();
    git(root, ["update-ref", "refs/it3/candidates/" + receipt, commit, "0".repeat(commit.length)]);
    return commit;
  } finally {
    NodeFS.rmSync(scratch, { force: true, recursive: true });
  }
}

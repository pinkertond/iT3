import { sha256 } from "@noble/hashes/sha2";
import { bytesToHex } from "@noble/hashes/utils";
import { Link } from "@tanstack/react-router";
import styles from "./workspaces.module.css";
import { T, useGT } from "gt-react";
import { useEffect, useState } from "react";
import * as Schema from "effect/Schema";
import { ChevronRight, BookOpen, ArrowLeft } from "lucide-react";
import type { Project } from "~/types";
import {
  useProjectEntriesQuery,
  useProjectFileQuery,
} from "~/components/files/projectFilesQueryState";
import { useProjectContentSearch } from "~/state/queries";
import { PageList } from "./PageList";
import ChatMarkdown from "~/components/ChatMarkdown";

const key = Schema.String.check(Schema.isPattern(/^[0-9a-f]{24,64}$/));
const pager = Schema.Struct({ page: key, count: Schema.Int });
const manifest = Schema.Struct({
  format: Schema.Literal(1),
  digest: key,
  sections: Schema.Record(Schema.String, pager),
  progress: Schema.optionalKey(Schema.Record(Schema.String, Schema.Int)),
});
const detail = Schema.Struct({
  id: Schema.String,
  kind: Schema.String,
  title: Schema.String,
  status: Schema.String,
  summary: Schema.String,
  hash: key,
  file: Schema.String,
  children: pager,
  related: pager,
});
const listing = Schema.Struct({
  rows: Schema.Array(
    Schema.Struct({
      id: Schema.String,
      kind: Schema.String,
      title: Schema.String,
      key: Schema.NullOr(key),
      status: Schema.optionalKey(Schema.String),
    }),
  ),
  total: Schema.Int,
  previous: Schema.NullOr(key),
  next: Schema.NullOr(key),
});
function decode<S extends Schema.Top>(schema: S, raw: string | undefined): S["Type"] | null {
  try {
    return raw
      ? Schema.decodeUnknownSync(schema as S & Schema.Decoder<S["Type"]>)(JSON.parse(raw))
      : null;
  } catch {
    return null;
  }
}
function safeSource(file: string) {
  return (
    !/[\\:\x00-\x1f]/.test(file) &&
    file.split("/").every((part) => part && part !== "." && part !== "..")
  );
}
function useSource(project: Project, file: string | null) {
  return useProjectFileQuery(project.environmentId, project.workspaceRoot, file, file !== null);
}
export function TaskReference({ project, reference }: { project: Project; reference: string }) {
  const index = useSource(project, ".it3/home/index.json");
  const manifestData = decode(manifest, index.data?.contents);
  const node = bytesToHex(sha256(new TextEncoder().encode(reference)));
  const entry = useSource(
    project,
    manifestData ? ".it3/home/" + manifestData.digest + "/nodes/" + node + ".json" : null,
  );
  const task = decode(detail, entry.data?.contents);
  return task?.id === reference && task.kind === "task" ? (
    <Link
      to="/workspaces"
      search={{ project: project.id, env: project.environmentId, view: "docs", node }}
    >
      {task.title} ↗
    </Link>
  ) : (
    <p>{reference}</p>
  );
}
export function ProjectLibrary({
  project,
  node,
  onNode,
}: {
  project: Project;
  node: string | undefined;
  onNode: (n: string | undefined) => void;
}) {
  const gt = useGT();
  const index = useSource(project, ".it3/home/index.json");
  const doc = decode(manifest, index.data?.contents);
  const [section, setSection] = useState("Documentation");
  const selected = node && /^[a-f0-9]{64}$/.test(node) ? node : null;
  const root = doc ? ".it3/home/" + doc.digest + "/" : "";
  return (
    <section className={styles["iw-library"]}>
      <div className={styles["iw-title"]}>
        <h2>
          <T>Project home</T>
        </h2>
        <button onClick={index.refresh}>
          <T>Refresh index</T>
        </button>
      </div>
      {doc ? (
        <>
          <p className={styles["iw-secondary"]}>
            <T>Source snapshot</T> <code>{doc.digest.slice(0, 12)}</code>
          </p>
          {selected ? (
            <>
              <button className={styles["iw-back"]} onClick={() => onNode(undefined)}>
                <ArrowLeft size={14} />
                <T>Back to sections</T>
              </button>
              <RecordView
                key={root + selected}
                root={root}
                record={selected}
                project={project}
                onNode={onNode}
              />
            </>
          ) : (
            <>
              <nav className={styles["iw-tabs"]} aria-label={gt("Project sections")}>
                {Object.keys(doc.sections).map((name) => (
                  <button
                    aria-pressed={section === name}
                    key={name}
                    onClick={() => setSection(name)}
                  >
                    {name}
                  </button>
                ))}
              </nav>
              {section === "Tasks" && doc.progress && (
                <p className={styles["iw-secondary"]}>
                  {Object.entries(doc.progress)
                    .map(([stage, count]) => count + " " + stage)
                    .join(" · ")}
                </p>
              )}
              {doc.sections[section] && (
                <Listing
                  key={root + section}
                  project={project}
                  root={root}
                  first={doc.sections[section].page}
                  onNode={onNode}
                />
              )}
            </>
          )}
        </>
      ) : index.isPending ? (
        <p role="status">
          <T>Loading documentation…</T>
        </p>
      ) : (
        <>
          {index.data && (
            <p role="alert">
              <T>Unsupported project index. Showing live project files.</T>
            </p>
          )}
          <LiveLibrary project={project} />
          <details>
            <summary>
              <T>Generate the project site</T>
            </summary>
            <p>
              <T>
                Run this in an iT3 checkout with dependencies installed, using the project’s
                repository path.
              </T>
            </p>
            <code>node it3/extensions/project-home/generate.mjs /path/to/project</code>
          </details>
        </>
      )}
    </section>
  );
}
const liveKinds: Record<string, string> = {
  Tasks: "task",
  Laws: "law|principle|invariant",
  Deployments: "deployment",
  Versions: "version|release",
  Agents: "agent|seat|team",
};
function LiveLibrary({ project }: { project: Project }) {
  const gt = useGT();
  const [section, setSection] = useState("Documentation");
  const scan = useProjectContentSearch({
    environmentId: project.environmentId,
    cwd: project.workspaceRoot,
    query: liveKinds[section] ? "^kind: +(" + liveKinds[section] + ") *$" : "",
    caseSensitive: true,
    wholeWord: false,
    useRegex: true,
  });
  const [directory, setDirectory] = useState("");
  const [file, setFile] = useState<string | null>(null);
  const entries = useProjectEntriesQuery(project.environmentId, project.workspaceRoot, directory);
  const fileEntries = (entries.data?.entries ?? []).filter((entry) => {
    if (!safeSource(entry.path)) return false;
    if (directory) return entry.kind === "directory" || /\.md$/i.test(entry.path);
    return /^(docs|documentation|laws|tasks|deployments|versions|agents|README\.md|IT3_VERSION|VERSION|package\.json)$/i.test(
      entry.path,
    );
  });
  const found = [
    ...new Set(
      scan.matches.map((hit) => hit.path).filter((path) => safeSource(path) && /\.md$/i.test(path)),
    ),
  ];
  const items =
    section === "Documentation" || directory
      ? fileEntries
      : [
          ...(section === "Versions"
            ? fileEntries.filter((e) => ["VERSION", "IT3_VERSION", "package.json"].includes(e.path))
            : []),
          ...found.map((path) => ({ path, kind: "file" as const })),
        ];
  const source = useSource(project, file);
  let content = source.data?.contents;
  if (file === "package.json" && content) {
    try {
      const v: unknown = JSON.parse(content).version;
      content = typeof v === "string" ? "Package version · " + v : "No package version recorded.";
    } catch {
      content = "Invalid package metadata.";
    }
  }
  return (
    <>
      <nav className={styles["iw-tabs"]} aria-label={gt("Project sections")}>
        {["Documentation", ...Object.keys(liveKinds)].map((name) => (
          <button
            key={name}
            aria-pressed={section === name}
            onClick={() => {
              setSection(name);
              setDirectory("");
              setFile(null);
            }}
          >
            {name}
          </button>
        ))}
      </nav>
      <p className={styles["iw-secondary"]}>
        <T>Live project files</T>
        {directory ? " · " + directory : ""}
      </p>
      {(file || directory) && (
        <button
          className={styles["iw-back"]}
          onClick={() =>
            file ? setFile(null) : setDirectory(directory.split("/").slice(0, -1).join("/"))
          }
        >
          <ArrowLeft size={14} />
          <T>Back</T>
        </button>
      )}
      {file ? (
        <article>
          <h3>{file}</h3>
          {content !== undefined ? (
            <ChatMarkdown
              text={content}
              cwd={project.workspaceRoot}
              environmentId={project.environmentId}
              parseRawHtml={false}
            />
          ) : (
            <p>{source.error ?? gt("Loading file…")}</p>
          )}
          <button onClick={source.refresh}>
            <T>Refresh file</T>
          </button>
        </article>
      ) : (
        <div className={styles["iw-list"]}>
          <PageList key={directory} items={items}>
            {(e) => (
              <button
                className={styles["iw-row"]}
                key={e.path}
                onClick={() => (e.kind === "directory" ? setDirectory(e.path) : setFile(e.path))}
              >
                <BookOpen size={16} />
                <span>{e.path.split("/").at(-1)}</span>
                <ChevronRight size={16} />
              </button>
            )}
          </PageList>
          {!items.length && (
            <p>
              {(section !== "Documentation" ? scan.error : entries.error) ??
                (entries.isPending || scan.isPending
                  ? gt("Loading documentation…")
                  : gt("No matching records found."))}
            </p>
          )}
          {(entries.data?.truncated || scan.truncated) && (
            <p>
              <T>Results limited by the host.</T>
            </p>
          )}
        </div>
      )}
    </>
  );
}
function Listing({
  project,
  root,
  first,
  onNode,
}: {
  project: Project;
  root: string;
  first: string;
  onNode: (id: string) => void;
}) {
  const gt = useGT();
  const [page, setPage] = useState(first);
  const data = useSource(project, root + "pages/" + page + ".json");
  const list = decode(listing, data.data?.contents);
  if (!list)
    return (
      <p role="status">
        {data.isPending
          ? gt("Loading records…")
          : (data.error ?? gt("The record list could not be read."))}
      </p>
    );
  return (
    <div className={styles["iw-list"]}>
      {list.rows.map((r) => (
        <button
          key={JSON.stringify([r.id, r.kind])}
          className={styles["iw-row"]}
          disabled={!r.key}
          onClick={() => r.key && onNode(r.key)}
        >
          <BookOpen size={16} />
          <span>
            <strong>{r.title}</strong>
            <small>
              {r.kind}
              {r.status ? " · " + r.status : ""}
              {!r.key ? gt(" · external record") : ""}
            </small>
          </span>
          <ChevronRight size={16} />
        </button>
      ))}
      {!list.total && (
        <p>
          <T>No records in this section.</T>
        </p>
      )}
      {(list.next || list.previous) && (
        <nav className={styles["iw-pager"]}>
          <button disabled={!list.previous} onClick={() => list.previous && setPage(list.previous)}>
            <T>Previous</T>
          </button>
          <button disabled={!list.next} onClick={() => list.next && setPage(list.next)}>
            <T>Next</T>
          </button>
        </nav>
      )}
    </div>
  );
}
function RecordView({
  project,
  root,
  record,
  onNode,
}: {
  project: Project;
  root: string;
  record: string;
  onNode: (id: string) => void;
}) {
  const gt = useGT();
  const data = useSource(project, root + "nodes/" + record + ".json");
  const item = decode(detail, data.data?.contents);
  const source = useSource(project, item && safeSource(item.file) ? item.file : null);
  const raw = source.data?.contents;
  const expected = item?.hash;
  const [verified, setVerified] = useState<{ text: string; hash: string; matches: boolean } | null>(
    null,
  );
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- match the latest file contents to the asynchronous Web Crypto digest.
  useEffect(() => {
    if (raw === undefined || !expected || source.data?.truncated || !globalThis.crypto?.subtle)
      return;
    let current = true;
    void crypto.subtle
      .digest("SHA-256", new TextEncoder().encode(raw))
      .then((buffer) => {
        const actual = Array.from(new Uint8Array(buffer), (v) =>
          v.toString(16).padStart(2, "0"),
        ).join("");
        if (current) setVerified({ text: raw, hash: expected, matches: actual === expected });
      })
      .catch(() => {});
    return () => {
      current = false;
    };
  }, [raw, expected, source.data?.truncated]);
  if (!item)
    return (
      <p role="status">
        {data.isPending ? gt("Opening record…") : (data.error ?? gt("Record unavailable."))}
      </p>
    );
  const checked = verified?.text === raw && verified?.hash === expected ? verified : null;
  const status = source.data?.truncated
    ? "Partial source"
    : checked
      ? checked.matches
        ? "Source matches snapshot"
        : "Source changed · regenerate the index"
      : "Source unverified";
  return (
    <article>
      <h3>{item.title}</h3>
      <small>
        {item.kind} · {item.status || gt("Recorded")} · {status}
      </small>
      <p className={styles["iw-secondary"]}>{item.file}</p>
      {item.kind === "task" && (
        <Link
          to="/workspaces"
          search={{
            env: project.environmentId,
            project: project.id,
            view: "agents",
            assign: item.id,
          }}
        >
          <T>Assign to a conversation</T> →
        </Link>
      )}
      {item.summary && <p>{item.summary}</p>}
      {item.children.count > 0 && (
        <>
          <h4>
            <T>Child nodes</T>
          </h4>
          <Listing project={project} root={root} first={item.children.page} onNode={onNode} />
        </>
      )}
      {item.related.count > 0 && (
        <details>
          <summary>
            <T>Relationships ·</T> {item.related.count}
          </summary>
          <div className={styles["iw-graph-origin"]}>{item.title}</div>
          <Listing project={project} root={root} first={item.related.page} onNode={onNode} />
        </details>
      )}
      {raw !== undefined ? (
        <details open={item.children.count === 0}>
          <summary>
            <T>Source detail</T>
          </summary>
          <ChatMarkdown
            text={
              item.kind === "version"
                ? item.title
                : raw.replace(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/, "")
            }
            cwd={project.workspaceRoot}
            environmentId={project.environmentId}
            parseRawHtml={false}
          />
        </details>
      ) : (
        <p>
          {source.isPending ? gt("Loading source…") : source.error || gt("Source unavailable.")}
        </p>
      )}
      <button
        onClick={() => {
          source.refresh();
          data.refresh();
        }}
      >
        <T>Recheck source</T>
      </button>
    </article>
  );
}

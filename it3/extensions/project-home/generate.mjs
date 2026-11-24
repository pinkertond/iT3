// Build from tracked files so a new checkout can reproduce the same site.
import * as NodeChildProcess from "node:child_process";
const { execFileSync } = NodeChildProcess;
import * as NodeCrypto from "node:crypto";
const { createHash } = NodeCrypto;
import * as NodeFS from "node:fs";
const { mkdirSync, readFileSync, renameSync, writeFileSync, lstatSync, realpathSync } = NodeFS;
import * as NodeModule from "node:module";
const { createRequire } = NodeModule;
import * as NodePath from "node:path";
const path = NodePath.default;
import * as NodeSqlite from "node:sqlite";
const { DatabaseSync } = NodeSqlite;
const dependency = createRequire(new URL("../../../packages/shared/package.json", import.meta.url));
const { parse } = dependency("yaml");
const { unified } = dependency("unified");
const { toHtml } = dependency("hast-util-to-html");
const markdown = unified()
  .use(dependency("remark-parse").default)
  .use(dependency("remark-gfm").default)
  .use(dependency("remark-rehype").default)
  .use(dependency("rehype-sanitize").default);
const root = realpathSync(
  path.resolve(process.argv.slice(2).find((arg) => arg !== "--check") || "."),
);
const check = process.argv.includes("--check");
const files = execFileSync("git", ["-C", root, "ls-files", "-z"], { maxBuffer: 32e6 })
  .toString()
  .split("\0")
  .filter(Boolean);
const sha = (text) => createHash("sha256").update(text).digest("hex");
const esc = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
  );
const nodes = [],
  bodies = new Map();
function add(row, source, body) {
  if (bodies.has(row.id)) throw new Error("Duplicate record ID: " + row.id);
  nodes.push({ ...row, hash: sha(source) });
  bodies.set(row.id, body);
}
for (const file of files) {
  if (
    file.startsWith(".it3/") ||
    !(/\.md$/i.test(file) || ["IT3_VERSION", "package.json", "VERSION"].includes(file))
  )
    continue;
  const absolute = path.join(root, file);
  if (
    !lstatSync(absolute, { throwIfNoEntry: false })?.isFile() ||
    realpathSync(absolute) !== absolute
  )
    continue;
  const source = readFileSync(absolute, "utf8");
  const base = { file, parent: null, links: [], status: "", summary: "" };
  if (file === "IT3_VERSION" || file === "VERSION" || file === "package.json") {
    const version = file === "package.json" ? JSON.parse(source).version : source.trim();
    if (typeof version === "string" && version)
      add(
        { ...base, id: "version." + file, kind: "version", title: version, summary: file },
        source,
        version,
      );
    continue;
  }
  const fm = source.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  const body = fm ? source.slice(fm[0].length).trim() : source.trim();
  if (fm && /^id:\s*\S/m.test(fm[1]) && /^kind:\s*\S/m.test(fm[1])) {
    const r = parse(fm[1]);
    if (typeof r.id !== "string" || typeof r.kind !== "string" || typeof r.title !== "string")
      throw new Error("Invalid record: " + file);
    const pins = [
      ...(r.details?.specification_refs ?? []),
      ...(r.details?.plan_ref ? [r.details.plan_ref] : []),
    ];
    const links = [
      ...pins.map((p) => ({ type: "pinned revision " + p.revision, to: p.id })),
      ...(r.details?.commission_ref ? [{ type: "commission", to: r.details.commission_ref }] : []),
      ...(r.relations ?? []),
      ...(r.origins ?? []).map((to) => ({ type: "origin", to })),
    ];
    if (links.some((l) => typeof l.to !== "string" || typeof l.type !== "string"))
      throw new Error("Invalid relationship: " + file);
    add(
      {
        ...base,
        id: r.id,
        kind: r.kind,
        title: r.title,
        parent: r.parent ?? null,
        status: r.lifecycle ?? "",
        summary: r.purpose ?? "",
        links,
      },
      source,
      body,
    );
  } else if (file === "README.md" || file.startsWith("docs/")) {
    const title = body.match(/^#\s+(.+)$/m)?.[1] || path.basename(file, ".md");
    add({ ...base, id: "doc." + file, kind: "document", title }, source, body);
  }
}
const byId = new Map(nodes.map((n) => [n.id, n]));
for (const n of nodes) {
  const seen = new Set([n.id]);
  for (let p = n.parent; p && byId.has(p); p = byId.get(p).parent) {
    if (seen.has(p)) throw new Error("Containment cycle at " + p);
    seen.add(p);
  }
}
const digest = sha(sha(readFileSync(new URL(import.meta.url))) + JSON.stringify(nodes));
const out = path.join(root, ".it3/home");
function outputDirectory(dir) {
  const relative = path.relative(root, dir);
  let current = root;
  for (const part of relative.split(path.sep)) {
    current = path.join(current, part);
    const stat = lstatSync(current, { throwIfNoEntry: false });
    if (stat && !stat.isDirectory()) throw new Error("Expected an output directory: " + current);
    if (!stat && !check) mkdirSync(current);
  }
}
const outputs = new Map();
const pageSize = 12;
const section = (k) =>
  k === "task"
    ? "Tasks"
    : ["law", "principle", "invariant"].includes(k)
      ? "Laws"
      : k === "deployment"
        ? "Deployments"
        : ["version", "release"].includes(k)
          ? "Versions"
          : ["agent", "seat", "team"].includes(k)
            ? "Agents"
            : "Documentation";
const pageKey = (k, n) => sha(k + "\n" + n).slice(0, 24);
function indexPage(key, array) {
  const total = array.length;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  for (let i = 0; i < pages; i++) {
    const rows = array.slice(i * pageSize, (i + 1) * pageSize);
    outputs.set(
      "pages/" + pageKey(key, i) + ".json",
      JSON.stringify({
        rows,
        total,
        previous: i ? pageKey(key, i - 1) : null,
        next: i + 1 < pages ? pageKey(key, i + 1) : null,
      }),
    );
  }
  return { page: pageKey(key, 0), count: total };
}
const children = new Map(),
  back = new Map();
for (const n of nodes) {
  if (n.parent && byId.has(n.parent)) {
    const a = children.get(n.parent) ?? [];
    a.push(n);
    children.set(n.parent, a);
  }
  for (const l of n.links) {
    const a = back.get(l.to) ?? [];
    a.push({ id: n.id, title: n.title, kind: l.type });
    back.set(l.to, a);
  }
}
const row = (n) => ({ id: n.id, title: n.title, kind: n.kind, status: n.status, key: sha(n.id) });
const sections = {};
for (const name of ["Documentation", "Tasks", "Laws", "Deployments", "Versions", "Agents"]) {
  const items = nodes.filter(
    (n) =>
      section(n.kind) === name &&
      (!byId.has(n.parent) || section(byId.get(n.parent).kind) !== name),
  );
  sections[name] = indexPage("section." + name, items.map(row));
}
for (const n of nodes) {
  const relations = [...(n.parent ? [{ type: "parent", to: n.parent }] : []), ...n.links];
  const related = relations.map((l) => ({
    id: l.to,
    title: byId.get(l.to)?.title ?? l.to,
    kind: l.type,
    key: byId.has(l.to) ? sha(l.to) : null,
  }));
  for (const b of back.get(n.id) ?? [])
    related.push({ ...b, kind: "Referenced by · " + b.kind, key: sha(b.id) });
  outputs.set(
    "nodes/" + sha(n.id) + ".json",
    JSON.stringify({
      ...n,
      children: indexPage("children." + n.id, (children.get(n.id) ?? []).map(row)),
      related: indexPage("links." + n.id, related),
    }),
  );
}
const progress = Object.create(null);
for (const n of nodes.filter(
  (n) => n.kind === "task" && !(children.get(n.id) ?? []).some((c) => c.kind === "task"),
)) {
  const stage = n.status || "unspecified";
  progress[stage] = (Object.hasOwn(progress, stage) ? progress[stage] : 0) + 1;
}
const index = { format: 1, digest, sections, progress };
const dbPath = path.join(out, digest, "records.sqlite");
outputDirectory(path.dirname(dbPath));
const tempDb = dbPath + "." + process.pid + ".tmp";
const db = new DatabaseSync(check ? dbPath : tempDb, { readOnly: check });
try {
  if (!check) {
    db.exec(
      "BEGIN; CREATE TABLE nodes(id TEXT PRIMARY KEY, kind TEXT NOT NULL, title TEXT NOT NULL, status TEXT, source_path TEXT NOT NULL, source_hash TEXT NOT NULL, parent_id TEXT); CREATE TABLE edges(source_id TEXT REFERENCES nodes(id), relation TEXT NOT NULL,target_id TEXT NOT NULL,PRIMARY KEY(source_id,relation,target_id)); CREATE INDEX incoming ON edges(target_id); CREATE INDEX child ON nodes(parent_id);",
    );
    const insert = db.prepare("INSERT INTO nodes VALUES(?,?,?,?,?,?,?)");
    const edge = db.prepare("INSERT OR IGNORE INTO edges VALUES(?,?,?)");
    for (const n of nodes) {
      insert.run(n.id, n.kind, n.title, n.status, n.file, n.hash, n.parent);
      for (const l of n.links) edge.run(n.id, l.type, l.to);
    }
    db.exec("COMMIT");
  } else {
    const rows = db.prepare("SELECT * FROM nodes ORDER BY id").all();
    const expected = new Map(nodes.map((n) => [n.id, n]));
    if (
      rows.length !== nodes.length ||
      rows.some((r) => {
        const n = expected.get(r.id);
        return (
          !n ||
          r.source_hash !== n.hash ||
          r.kind !== n.kind ||
          r.title !== n.title ||
          r.status !== n.status ||
          r.source_path !== n.file ||
          r.parent_id !== n.parent
        );
      })
    )
      throw new Error("Stale database records");
    const edges = new Set(
      nodes.flatMap((n) => n.links.map((l) => JSON.stringify([n.id, l.type, l.to]))),
    );
    const actual = db.prepare("SELECT source_id,relation,target_id FROM edges").all();
    if (
      actual.length !== edges.size ||
      actual.some((e) => !edges.has(JSON.stringify([e.source_id, e.relation, e.target_id])))
    )
      throw new Error("Stale database relationships");
  }
} finally {
  db.close();
}
if (!check) renameSync(tempDb, dbPath);

outputs.set("index.json", JSON.stringify(index));
const fileNodes = new Map(nodes.map((n) => [n.file, n]));
function htmlBody(md, file) {
  const tree = markdown.runSync(markdown.parse(md));
  function visit(node) {
    if (node.tagName === "a" && typeof node.properties.href === "string") {
      const url = node.properties.href;
      if (!/^[a-z]+:|^\/|^#/i.test(url)) {
        const target = fileNodes.get(
          path.posix.normalize(path.posix.join(path.posix.dirname(file), url.split("#")[0])),
        );
        if (target) node.properties.href = href(target);
        else delete node.properties.href;
      }
    }
    for (const child of node.children ?? []) visit(child);
  }
  visit(tree);
  return toHtml(tree);
}
const href = (n) => "#r-" + sha(n.id);
const links = (arr) =>
  "<ul>" +
  arr.map((n) => '<li><a href="' + href(n) + '">' + esc(n.title) + "</a></li>").join("") +
  "</ul>";
const renderList = (arr) =>
  Array.from(
    { length: Math.ceil(arr.length / pageSize) },
    (_, i) =>
      "<details" +
      (arr.length <= pageSize ? " open" : "") +
      "><summary>" +
      esc(
        arr.length <= pageSize
          ? "Records"
          : i * pageSize + 1 + "–" + Math.min(arr.length, (i + 1) * pageSize),
      ) +
      "</summary>" +
      links(arr.slice(i * pageSize, (i + 1) * pageSize)) +
      "</details>",
  ).join("");
outputs.set(
  "index.html",
  '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Project home</title><style>body{max-width:54rem;margin:3rem auto;padding:0 1.4rem;font:16px/1.55 system-ui;color:#192b36}a{color:#195a83}section{border-top:1px solid #c7d4d9;padding:1rem 0}section[id^=r-]{display:none}section:target{display:block}main:has(section:target)>:is(h1,small,details){display:none}p{overflow-wrap:anywhere}pre{padding:1rem;overflow:auto;background:#f0f4f6}table{border-collapse:collapse}td,th{border:1px solid #c7d4d9;padding:.4rem}img{max-width:100%}small{color:#526975}summary{cursor:pointer}</style><main><h1 id="home">Project home</h1><small>Source snapshot ' +
    digest.slice(0, 12) +
    "</small>" +
    Object.keys(sections)
      .map(
        (k) =>
          "<details><summary>" +
          k +
          "</summary>" +
          renderList(
            nodes.filter(
              (n) =>
                section(n.kind) === k &&
                (!byId.has(n.parent) || section(byId.get(n.parent).kind) !== k),
            ),
          ) +
          "</details>",
      )
      .join("") +
    nodes
      .map(
        (n) =>
          '<section id="r-' +
          sha(n.id) +
          '"><a href="#home">Project home</a><h2>' +
          esc(n.title) +
          "</h2><small>" +
          esc([n.kind, n.status, n.file].filter(Boolean).join(" · ")) +
          "</small>" +
          htmlBody(bodies.get(n.id), n.file) +
          renderList(children.get(n.id) ?? []) +
          renderList(n.links.map((l) => byId.get(l.to)).filter(Boolean)) +
          "</section>",
      )
      .join("") +
    "</main></html>",
);
// Immutable generation pages first; a single rename publishes the manifest last.
for (const [name, data] of [...outputs].sort(
  ([a], [b]) => Number(a === "index.json") - Number(b === "index.json"),
)) {
  const target = path.join(
    out,
    name === "index.json" || name === "index.html" ? name : digest + "/" + name,
  );
  if (check) {
    if (readFileSync(target, "utf8") !== data) throw new Error("Out of date: " + name);
  } else {
    outputDirectory(path.dirname(target));
    const temp = target + "." + process.pid + ".tmp";
    writeFileSync(temp, data, { flag: "wx" });
    renameSync(temp, target);
  }
}
console.log(
  (check ? "Verified " : "Generated ") + nodes.length + " project records · " + digest.slice(0, 12),
);

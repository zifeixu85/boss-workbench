#!/usr/bin/env node
// 上传前自检：dist-mobile 里不能有数据库、密钥、源代码、Markdown 原文、真名和电话。
// 加了口令锁的页面，正文是加密的，这里看不到字：要带 --snapshot，把打包用的那份快照一起查。
// 只读，不改任何文件。通过返回 0；有必须改的问题返回 1；参数错返回 2。
import { readdirSync, lstatSync, readFileSync, existsSync } from "node:fs";
import { join, relative, extname, basename, resolve, sep } from "node:path";
import { cli, die, readJson, scanText, loadTerms, snapshotFingerprint, FORMAT, isSnapshotFormat, PAGE_META_RE } from "./lib.mjs";

const USAGE = `用法：
  node check_dist.mjs "<dist-mobile 文件夹>" --terms "<对照表-日期.json>" --snapshot "<快照-日期.json>" [--max-mb 5] [--json]

  --terms      export_snapshot.mjs 生成的对照表：逐个查有没有漏掉的真名
  --snapshot   打包用的那份快照。有口令锁时必须带：页面正文加密了，要查快照里的字；
               还会核对页面是不是用这份快照打的
  --max-mb     包超过多少 MB 给提醒（默认 5）`;

const { values: o, positionals } = cli({ terms: { type: "string" }, snapshot: { type: "string" }, "max-mb": { type: "string" }, json: { type: "boolean" } }, USAGE, { maxPositionals: 1 });
const dir = positionals[0] ? resolve(positionals[0]) : die(USAGE, 2);
if (!existsSync(dir) || !lstatSync(dir).isDirectory()) die(`找不到这个文件夹：${dir}`, 2);
if (basename(dir) !== "dist-mobile") console.error(`提醒：要上传的文件夹一般叫 dist-mobile，这里是“${basename(dir)}”，确认没选错。`);
const maxMb = Number(o["max-mb"] ?? 5);

const BAD_EXT = new Set([".db", ".sqlite", ".sqlite3", ".db-wal", ".db-shm", ".md", ".markdown", ".ts", ".tsx", ".mts", ".cts", ".jsx", ".map", ".pem", ".key", ".p12", ".pfx", ".csv", ".tsv", ".xlsx", ".xls", ".numbers", ".doc", ".docx", ".pdf", ".zip", ".rar", ".7z", ".log", ".sql", ".bak", ".toml", ".yaml", ".yml"]);
const BAD_NAME = /^(\.env.*|package(-lock)?\.json|pnpm-lock\.yaml|tsconfig.*\.json|cloudbaserc\.json|\.npmrc|AGENTS\.md|CLAUDE\.md|id_rsa.*|.*-wal|.*-shm|.*\.db-journal)$/i;
const BAD_DIR = new Set(["node_modules", ".git", ".cloudbase", "server", "src", "数据", "快照", "手机版", "知识库", "scripts", "migrations"]);
const TEXT_EXT = new Set([".html", ".htm", ".js", ".mjs", ".cjs", ".css", ".json", ".txt", ".svg", ".webmanifest", ".xml"]);
const IMG_EXT = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".avif", ".heic", ".bmp"]);

const problems = [];
const warnings = [];
const files = [];

function walk(d) {
  for (const name of readdirSync(d)) {
    const p = join(d, name);
    const rel = relative(dir, p).split(sep).join("/");
    const st = lstatSync(p);
    if (st.isSymbolicLink()) { problems.push(`${rel}：是快捷方式（链接），不上传这种文件`); continue; }
    if (st.isDirectory()) {
      if (BAD_DIR.has(name)) problems.push(`${rel}/：这个文件夹不该在包里（像是程序、数据或知识库）`);
      walk(p);
      continue;
    }
    files.push({ rel, size: st.size, path: p });
  }
}
walk(dir);

if (!files.some((f) => f.rel === "index.html")) problems.push("最外层没有 index.html：打开链接会是空的。确认选的是打包好的文件夹");

let terms = [];
if (o.terms) {
  try { terms = loadTerms(resolve(o.terms)); } catch (e) { die(`对照表读不了：${e.message}`, 2); }
}

let images = 0;
let locked = false;
let pageMeta = null;
for (const f of files) {
  const ext = extname(f.rel).toLowerCase();
  const name = basename(f.rel);
  if (name === ".DS_Store") { warnings.push(`${f.rel}：苹果电脑自动生成的文件，删掉再传`); continue; }
  if (BAD_EXT.has(ext) || BAD_NAME.test(name)) { problems.push(`${f.rel}：这类文件不能上传（数据库、表格、文档、源代码、配置或密钥）`); continue; }
  if (IMG_EXT.has(ext)) images++;
  if (!TEXT_EXT.has(ext)) continue;
  const text = readFileSync(f.path, "utf8");
  const r = scanText(text, terms);
  for (const x of r.problems) problems.push(`${f.rel}：${x}`);
  for (const x of r.warnings) warnings.push(`${f.rel}：${x}`);
  if (/\.html?$/.test(ext) && /(?:src|href)=["']\/(?!\/)/.test(text)) problems.push(`${f.rel}：引用文件用的是“/”开头的绝对路径。手机版放在子文件夹里，这样会找不到文件、页面空白`);
  if (f.rel === "index.html") {
    const meta = text.match(PAGE_META_RE); // 并进 boss-workbench 以前打的页面（boss-deploy）也认
    if (meta) pageMeta = Object.fromEntries(meta[1].split(";").map((kv) => kv.trim().split("=")).filter((kv) => kv.length === 2));
    if (pageMeta?.lock === "有" || /"cipher":"AES-256-GCM"/.test(text)) locked = true;
  }
}

// 口令锁：正文加密了，只能查快照
if (o.snapshot) {
  let s;
  try { s = readJson(resolve(o.snapshot)); } catch (e) { die(`快照读不了：${e.message}`, 2); }
  if (!isSnapshotFormat(s.format)) die(`这不是手机版快照（format 应为 ${FORMAT}）。`, 2);
  if (pageMeta?.snapshot && pageMeta.snapshot !== snapshotFingerprint(s)) problems.push("快照和页面对不上：页面不是用这份快照打的。用同一份快照重新打包，或换成打包时用的那份再查");
  if (!pageMeta?.snapshot) warnings.push("页面里没有快照指纹（不是 build_page.mjs 打的？），没法核对页面和快照是不是同一份");
  const r = scanText(JSON.stringify(s), terms);
  for (const x of r.problems) problems.push(`快照（页面正文）：${x}`);
  for (const x of r.warnings) warnings.push(`快照（页面正文）：${x}`);
} else if (locked) {
  problems.push("这一页加了口令锁，正文是加密的，这里查不到里面的字。带上 --snapshot \"<打包用的快照>\" 再查一次");
}
if (images) warnings.push(`包里有 ${images} 张图片：确认没有客户照片、聊天截图、收款码`);
if (files.some((f) => extname(f.rel) === ".json")) warnings.push("包里有 .json 文件：确认里面没有未打码的原始数据");

const total = files.reduce((n, f) => n + f.size, 0);
if (total > 50 * 1024 * 1024) problems.push(`整个包 ${(total / 1048576).toFixed(1)} MB，太大了：手机版一般只有几十 KB 到几 MB，检查是不是把别的东西打进去了`);
else if (total > maxMb * 1024 * 1024) warnings.push(`整个包 ${(total / 1048576).toFixed(1)} MB，比平常大：检查是不是带了大图或视频`);
if (!terms.length) warnings.push("没给对照表（--terms），这次没查漏掉的真名");

const result = { ok: problems.length === 0, dir, locked, total_bytes: total, files: files.map(({ rel, size }) => ({ path: rel, bytes: size })), problems, warnings };
if (o.json) console.log(JSON.stringify(result, null, 2));
else {
  const kb = (n) => (n < 1024 * 1024 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1048576).toFixed(1)} MB`);
  console.log(`要上传的文件（${files.length} 个，共 ${kb(total)}）${locked ? "，页面加了口令锁" : ""}：`);
  for (const f of files.slice(0, 40)) console.log(`  ${f.rel}  ${kb(f.size)}`);
  if (files.length > 40) console.log(`  ……还有 ${files.length - 40} 个`);
  if (problems.length) console.log(`\n必须先改（${problems.length}）：\n${problems.map((x) => `  ✗ ${x}`).join("\n")}`);
  if (warnings.length) console.log(`\n看一眼（${warnings.length}）：\n${warnings.map((x) => `  · ${x}`).join("\n")}`);
  console.log(problems.length ? "\n没通过：改好再检查一次，不要上传。" : "\n通过：可以把这个文件夹交给老板做最后确认。");
}
process.exit(problems.length ? 1 : 0);

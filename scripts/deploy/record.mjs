#!/usr/bin/env node
// 手机版的上线记录：单独一个文件 工作台/手机版/记录.md，不改 工作台/README.md。
//   info   ：看现在的状态、云上文件夹、环境（只读）
//   reserve：上传前先定云上文件夹并记下来；已经定过、或在线的，原样返回同一个（重跑、换线程都不会变）
//   check  ：删除前核对：文件夹名形如 m-xxxxxxxx，而且就是记录里的那个，才返回 0
//   add    ：上线、更新、撤下之后追加一行
// 云上文件夹一律写成 m-xxxxxxxx：不带开头和结尾的斜杠（CloudBase 工具和命令行都用这个写法）。
import { existsSync, readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { resolve } from "node:path";
import { cli, die, writeTextAtomic, localStamp } from "./lib.mjs";

const START = "<!-- 手机版记录 开始：由 boss-workbench 维护，别手改这两行之间 -->";
// 并进 boss-workbench 以前写的记录（开始标记写的是 boss-deploy）照样读；下次记一笔时原地换成新标记
const START_RE = /<!-- 手机版记录 开始：由 boss-(?:workbench|deploy) 维护，别手改这两行之间 -->/;
const END = "<!-- 手机版记录 结束 -->";
const USAGE = `用法：
  node record.mjs info    --file "<工作台>/手机版/记录.md" [--json]
  node record.mjs reserve --file "<工作台>/手机版/记录.md" --env <环境ID> [--json]
  node record.mjs check   --file "<工作台>/手机版/记录.md" --path m-xxxxxxxx
  node record.mjs add     --file "<工作台>/手机版/记录.md" --action 上线|更新|撤下 --path m-xxxxxxxx --env <环境ID>
                          [--url https://…] [--scope "待办、日程…"] [--mask "客户代号、金额隐藏"] [--lock 有|无]
                          [--expires 2027-04-10|未知] [--note "…"]

  链接、环境 ID 只写进本机这个文件；口令从不记录，只记“有没有口令锁”。`;

const { values: o, positionals } = cli({
  file: { type: "string" }, action: { type: "string" }, path: { type: "string" }, env: { type: "string" }, url: { type: "string" },
  scope: { type: "string" }, mask: { type: "string" }, lock: { type: "string" }, expires: { type: "string" }, note: { type: "string" }, json: { type: "boolean" },
}, USAGE, { maxPositionals: 1 });
const cmd = positionals[0];
if (!["info", "reserve", "check", "add"].includes(cmd) || !o.file) die(USAGE, 2);
const file = resolve(o.file);
const text = existsSync(file) ? readFileSync(file, "utf8") : "";
const cell = (s) => String(s ?? "—").replace(/\|/g, "/").replace(/\r?\n/g, " ").trim() || "—";
const PATH_RE = /^m-[0-9a-f]{8}$/;
const newPath = () => `m-${randomBytes(4).toString("hex")}`;
const say = (obj, line) => { console.log(o.json ? JSON.stringify(obj, null, 2) : line); };

function readState(t) {
  const a = t.search(START_RE), b = t.indexOf(END);
  if (a === -1 || b === -1 || b < a) return { status: "未上线", rows: [], path: null, env: null, url: null, expires: null, lock: null, last: null };
  const block = t.slice(a, b + END.length);
  const line = (label) => block.match(new RegExp(`^- ${label}：(.*)$`, "m"))?.[1]?.trim() ?? null;
  const loc = line("云上位置") ?? "";
  const rows = block.split("\n").filter((l) => /^\| \d{4}-/.test(l));
  const last = rows.at(-1)?.split("|")[2]?.trim() ?? null;
  const status = { 预留: "已预留", 上线: "在线", 更新: "在线", 撤下: "已撤下" }[last] ?? "未上线";
  return {
    a, b: b + END.length, rows, last, status,
    url: line("现在的链接"), env: loc.match(/环境 `([^`]+)`/)?.[1] ?? null, path: loc.match(/文件夹 `([^`]+)`/)?.[1] ?? null,
    expires: line("免费环境到期"), lock: line("口令锁")?.replace(/（.*$/, "") ?? null,
  };
}
const cur = readState(text);
const active = cur.status === "在线" || cur.status === "已预留";

function write({ action, path, env, url, lock, expires, row }) {
  const now = localStamp();
  const where = action === "撤下" ? "（已删除；再上线会换新文件夹）" : action === "预留" ? "（已定好，还没上传）" : "（更新时沿用；撤下时只删这个文件夹）";
  const head = [
    "## 手机版（只读，放在腾讯云开发上）",
    "",
    "- 是什么：工作台的只读快照，打过码；不是实时数据，手机上不能改。更新说“更新手机版”，撤掉说“把手机版撤掉”。",
    `- 现在的链接：${action === "撤下" ? `已撤下（${now}）` : action === "预留" ? "还没上线" : url}`,
    `- 云上位置：环境 \`${env}\`，文件夹 \`${path}\`${where}`,
    `- 免费环境到期：${expires ?? cur.expires ?? "未知，去云开发控制台看"}`,
    `- 口令锁：${lock ?? cur.lock ?? "未记"}（口令不记在这里）`,
    "- 链接别发到群里、别当正式网站；腾讯云默认网址只适合自己和几个人看。",
    "",
    "| 时间 | 做了什么 | 文件夹 | 放了哪些 | 打码 | 口令锁 | 备注 |",
    "|---|---|---|---|---|---|---|",
  ];
  const block = [START, ...head, ...cur.rows, `| ${now} | ${row}`, END].join("\n");
  let next;
  if (cur.a != null) next = text.slice(0, cur.a) + block + text.slice(cur.b);
  else if (text.trim()) next = `${text.replace(/\s*$/, "")}\n\n${block}\n`;
  else next = `# 手机版记录\n\n> 由工作台 Skill（boss-workbench）的“上线手机版”维护。手机版的快照、上传清单、对照表、二维码也在这个文件夹里，都只在本机；对照表永远不上传。\n\n${block}\n`;
  writeTextAtomic(file, next);
  return now;
}

if (cmd === "info") {
  const info = { status: cur.status, deployed: cur.status === "在线", path: active ? cur.path : null, old_path: cur.status === "已撤下" ? cur.path : null, env: cur.env, url: cur.status === "在线" ? cur.url : null, expires: cur.expires, lock: cur.lock, last_action: cur.last };
  const line = {
    在线: `手机版在线：${cur.url ?? "（链接没记）"}\n环境：${cur.env}；云上文件夹：${cur.path}（更新时沿用）；免费环境到期：${cur.expires ?? "未记"}`,
    已预留: `云上文件夹已定好、还没上线：环境 ${cur.env}，文件夹 ${cur.path}。上传就用这个。`,
    已撤下: `上次已撤下（旧文件夹 ${cur.path}，不再用）。再上线先运行 reserve 定新文件夹。`,
    未上线: "还没上线过。上传前先运行 reserve 定云上文件夹。",
  }[cur.status];
  say(info, line);
  process.exit(0);
}

if (cmd === "reserve") {
  if (!o.env) die("--env 要写环境 ID（老板选好的那个）。", 2);
  if (active) {
    if (cur.env && cur.env !== o.env) die(`记录里的手机版在环境 ${cur.env}，这次是 ${o.env}。先和老板确认用哪个环境；要换环境，先把旧的撤下。`, 1);
    say({ path: cur.path, env: cur.env, status: cur.status, new: false }, `沿用云上文件夹：${cur.path}（环境 ${cur.env}，${cur.status}）`);
    process.exit(0);
  }
  const path = newPath();
  write({ action: "预留", path, env: o.env, row: `预留 | ${path} | — | — | — | ${cell(o.note)} |` });
  say({ path, env: o.env, status: "已预留", new: true }, `已定好云上文件夹：${path}（环境 ${o.env}），记在 ${file}。上传、核对、链接都用它。`);
  process.exit(0);
}

if (!o.path || !PATH_RE.test(o.path)) die(`--path 要写成 m-xxxxxxxx 这样（m- 加 8 位，前后都不带斜杠），用 reserve 或 info 给的那个。这次是：“${o.path ?? ""}”`, 2);

if (cmd === "check") {
  if (!active) die(`记录里没有在线或已预留的文件夹（现在是“${cur.status}”），不删任何东西。`, 1);
  if (o.path !== cur.path) die(`要删的是 ${o.path}，记录里的是 ${cur.path}。对不上，不删。`, 1);
  console.log(`可以删：只删文件夹 ${cur.path}（环境 ${cur.env}）。\n删除写法：manageHosting(action="delete", cloudPath="${cur.path}", isDir=true, confirm=true)`);
  process.exit(0);
}

// add
const action = o.action;
if (!["上线", "更新", "撤下"].includes(action)) die("--action 只能是 上线、更新、撤下。", 2);
if (!o.env) die("--env 要写环境 ID。", 2);
if (o.lock && !["有", "无"].includes(o.lock)) die("--lock 只能写“有”或“无”（口令本身不记录）。", 2);
const need = { 上线: ["已预留", "在线"], 更新: ["在线"], 撤下: ["已预留", "在线"] }[action];
if (!need.includes(cur.status)) die(`现在是“${cur.status}”，不能记“${action}”。${cur.status === "未上线" || cur.status === "已撤下" ? "上传前先运行 reserve 定文件夹。" : ""}`, 2);
if (o.path !== cur.path) die(`--path ${o.path} 和记录里的文件夹 ${cur.path} 对不上。用 info 看记录里是哪个。`, 2);
if (cur.env && o.env !== cur.env) die(`--env ${o.env} 和记录里的环境 ${cur.env} 对不上。`, 2);
if (action !== "撤下") {
  if (!/^https:\/\//.test(o.url ?? "")) die("上线、更新要写 --url（https:// 开头的完整链接）。", 2);
  if (!o.url.includes(`/${o.path}/`)) die(`--url 里应该有 /${o.path}/ 这一段（链接要指向这个文件夹）。`, 2);
}
const gone = action === "撤下";
const now = write({
  action, path: o.path, env: o.env, url: o.url, lock: o.lock, expires: o.expires,
  row: `${action} | ${o.path} | ${cell(gone ? "—" : o.scope)} | ${cell(gone ? "—" : o.mask)} | ${cell(gone ? "—" : o.lock)} | ${cell(o.note)} |`,
});
console.log(`已记到 ${file}：${now} ${action}${gone ? "" : ` ${o.url}`}`);

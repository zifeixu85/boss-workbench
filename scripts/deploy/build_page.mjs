#!/usr/bin/env node
// 把打过码的快照做成一个只读手机网页：dist-mobile/index.html，一个文件。
// 页面不连任何接口、没有新增和修改按钮；加 --passcode 时，内容先加密再放进页面（口令锁）。
// 加密之前先用对照表和号码规则把正文查一遍：加了锁以后，上传前的自检就看不到正文了。
import { existsSync, readdirSync, rmSync, mkdirSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, resolve } from "node:path";
import { cli, die, readJson, writeTextAtomic, escapeHtml as e, encryptPayload, checkPasscode, scanText, loadTerms, snapshotFingerprint, FORMAT, isSnapshotFormat, PAGE_META } from "./lib.mjs";

const USAGE = `用法：
  node build_page.mjs --snapshot "<快照-日期.json>" --terms "<对照表-日期.json>" --out "<工作台程序>/dist-mobile" --passcode "<口令>"
  node build_page.mjs --snapshot "<快照-日期.json>" --terms "<对照表-日期.json>" --out "<工作台程序>/dist-mobile" --no-lock

  --snapshot      export_snapshot.mjs 导出的快照
  --terms         同一次导出的对照表：加密前逐个查有没有漏掉的真名。加口令锁时必须带
  --out           输出文件夹（只放 index.html 一个文件；已有别的文件时不覆盖）
  --passcode      口令锁：没口令看不到内容。也可以用环境变量 BOSS_WORKBENCH_PASSCODE
  --no-lock       明确不加口令锁（老板说不要时用）

  正文里查到电话、证件号、密钥或真名时不打包，返回 1。`;

const { values: o } = cli({ snapshot: { type: "string" }, terms: { type: "string" }, out: { type: "string" }, passcode: { type: "string" }, "no-lock": { type: "boolean" } }, USAGE, { maxPositionals: 0 });
if (!o.snapshot || !o.out) die(USAGE, 2);

const s = readJson(resolve(o.snapshot));
if (!isSnapshotFormat(s.format)) die(`这不是手机版快照（format 应为 ${FORMAT}）：先用 export_snapshot.mjs 导出。`, 2);
const rawPass = o.passcode ?? process.env.BOSS_WORKBENCH_PASSCODE ?? process.env.BOSS_DEPLOY_PASSCODE ?? ""; // 旧变量名照样认
if (!rawPass && !o["no-lock"]) die("要口令锁就加 --passcode \"<口令>\"；老板说不要口令锁，就加 --no-lock。", 2);
if (rawPass && o["no-lock"]) die("--passcode 和 --no-lock 只能选一个。", 2);
const planned = s.rules?.lock; // 导出时写进清单的“有 / 无”
if (planned === "有" && !rawPass) die("上传清单里写的是“有口令锁”，这次却没给口令。老板改主意了就重新导出（--lock 无），再打包。", 2);
if (planned === "无" && rawPass) die("上传清单里写的是“没有口令锁”，这次却给了口令。老板改主意了就重新导出（--lock 有），再打包。", 2);
let passWarn = "";
if (rawPass) { try { passWarn = checkPasscode(rawPass); } catch (err) { die(err.message, 2); } }
if (rawPass && !o.terms) die("加口令锁时要带 --terms（同一次导出的对照表）：内容加密后，上传前的自检看不到正文，所以打包时先查一遍真名。", 2);
let terms = [];
if (o.terms) { try { terms = loadTerms(resolve(o.terms)); } catch (err) { die(`对照表读不了：${err.message}`, 2); } }

/* ---------- 渲染（全部文字都经过转义） ---------- */
const WEEK = "日一二三四五六";
const isDay = (d) => /^\d{4}-\d{2}-\d{2}$/.test(d ?? "");
const md = (d) => { if (!isDay(d)) return d ?? ""; const [y, m, dd] = d.split("-").map(Number); return `${m}月${dd}日 周${WEEK[new Date(Date.UTC(y, m - 1, dd)).getUTCDay()]}`; };
const short = (d) => (isDay(d) ? `${+d.slice(5, 7)}/${+d.slice(8, 10)}` : d ?? "");
const pct = (n) => (n == null ? "—" : `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n)}%`);
const list = (items, empty = "没有") => (items.length ? `<ul>${items.join("")}</ul>` : `<p class="empty">${empty}</p>`);
const sub = (parts) => { const xs = parts.filter(Boolean); return xs.length ? `<span class="sub">${xs.join(" · ")}</span>` : ""; };
const card = (title, n, inner) => `<section class="card"><h2>${e(title)}${n != null ? `<span class="n">${n} 条</span>` : ""}</h2>${inner}</section>`;
const LEVEL = { 紧急: "red", 高: "red", 重要: "amber", 中: "amber" };

function todos() {
  const item = (t) => `<li><span class="chip ${LEVEL[t.priority] ?? ""}">${e(t.priority ?? "待办")}</span><span class="t">${e(t.title)}${sub([
    t.overdue > 0 ? `<span class="late">已过 ${t.overdue} 天</span>` : t.due === s.data_date ? "今天截止" : t.due ? `截止 ${short(t.due)}` : "",
    t.status && t.status !== "待办" ? e(t.status) : "", t.client ? e(t.client) : "",
  ])}</span></li>`;
  return card("今天要做", s.todos.today.length, list(s.todos.today.map(item), "今天没有要做的") + (s.todos.week.length ? `<h3>这周还有</h3>${list(s.todos.week.map(item))}` : ""));
}
function events() {
  const item = (x) => `<li><span class="time">${e(x.time)}</span><span class="t">${e(x.title)}${sub([x.end ? `到 ${e(x.end)}` : "", e(x.kind ?? ""), x.client ? e(x.client) : ""])}</span></li>`;
  const days = [...new Set(s.events.upcoming.map((x) => x.date))];
  return card("日程", null, `<h3>今天</h3>${list(s.events.today.map(item), "今天没有日程")}${days.map((d) => `<h3>${e(md(d))}</h3>${list(s.events.upcoming.filter((x) => x.date === d).map(item))}`).join("")}`);
}
function follow() {
  const key = s.follow.key.map((c) => `<li><span class="chip green">${e(c.stage ?? "跟进")}</span><span class="t"><b>${e(c.name)}</b>${sub([c.reasons.map(e).join("；")])}${c.next_step ? `<span class="sub">下一步：${e(c.next_step)}</span>` : ""}</span></li>`);
  const due = s.follow.due.map((c) => `<li><span class="chip">${e(c.stage ?? "客户")}</span><span class="t"><b>${e(c.name)}</b>${sub([`计划 ${e(short(c.next_follow) || "未定")} 联系`, c.overdue > 0 ? `<span class="late">已过 ${c.overdue} 天</span>` : ""])}</span></li>`);
  return card("该联系的客户", key.length + due.length, (key.length ? `<h3>重点客户</h3>${list(key)}` : "") + (due.length ? `<h3>快到跟进日</h3>${list(due)}` : "") + (key.length + due.length ? "" : `<p class="empty">这几天没有要联系的</p>`));
}
function risks() {
  const body = s.risks.map((p) => `<h3>${e(p.name)}${p.client ? ` · ${e(p.client)}` : ""}</h3>${list(p.items.map((r) => `<li><span class="chip ${LEVEL[r.level] ?? ""}">${e(r.level ?? "风险")}</span><span class="t">${e(r.text)}</span></li>`))}`).join("");
  return card("项目风险", s.risks.reduce((n, p) => n + p.items.length, 0), body || `<p class="empty">没有风险提醒</p>`);
}
function xhs() {
  const post = (p, withDate) => `<li><span class="time">${e(p.time ?? "")}</span><span class="t">${e(p.title)}${sub([withDate ? e(md(p.date)) : "", e(p.status ?? "")])}</span></li>`;
  return card("小红书", null, `<h3>今天发</h3>${list(s.xhs.posts.map((p) => post(p)), "今天没有要发的笔记")}${s.xhs.upcoming.length ? `<h3>接下来</h3>${list(s.xhs.upcoming.map((p) => post(p, true)))}` : ""}${s.xhs.topics.length ? `<h3>今天的选题（共 ${s.xhs.topics_total} 个）</h3>${list(s.xhs.topics.map((t) => `<li><span class="t">${e(t.title)}</span></li>`))}` : ""}`);
}
function biz() {
  const b = s.biz;
  const tone = (n) => (n == null ? "" : n < 0 ? "down" : "up");
  const rows = b.channels.map((c) => `<li><span class="t"><b>${e(c.name)}</b>${sub([`比前天 <span class="${tone(c.vs_prev)}">${pct(c.vs_prev)}</span>`, `退款率 ${c.refund_rate ?? "—"}%`, `ROI ${c.roi ?? "—"}`, c.gmv != null ? `成交 ${Math.round(c.gmv).toLocaleString("zh-CN")} 元` : "", c.orders != null ? `${c.orders} 单` : ""])}</span></li>`);
  const alerts = b.alerts.map((a) => `<li><span class="chip ${LEVEL[a.level] ?? ""}">${e(a.level ?? "提醒")}</span><span class="t">${e(a.title)}</span></li>`);
  const total = `<p class="total">合计比前天 <b class="${tone(b.total.vs_prev)}">${pct(b.total.vs_prev)}</b>${b.total.gmv != null ? ` · 成交 ${Math.round(b.total.gmv).toLocaleString("zh-CN")} 元` : ""}</p>`;
  return card(`各平台昨天${b.date ? `（${md(b.date)}）` : ""}`, null, total + list(rows, "没有经营数据") + (alerts.length ? `<h3>要注意的</h3>${list(alerts)}` : ""));
}
function cash() {
  const c = s.cash;
  const n = (v, label) => `<div class="num"><b>${v ?? "—"}</b><span>${label}</span></div>`;
  return card("钱（万元）", null, `<div class="grid">${n(c.outstanding, "应收")}${n(c.overdue_amount, `逾期 ${c.overdue_count ?? 0} 笔`)}${n(c.due_30, "30 天内到期")}</div>`);
}

const parts = [];
if (s.headline) parts.push(`<div class="lead"><small>最该做的一件事</small><p>${e(s.headline.title)}</p></div>`);
for (const [k, fn] of [["todos", todos], ["events", events], ["follow", follow], ["risks", risks], ["xhs", xhs], ["biz", biz], ["cash", cash]]) if (s[k]) parts.push(fn());
const content = parts.join("\n");

// 加密之前查一遍正文（不加锁也查：多一道闸门）
const scan = scanText(`${s.title}\n${content}`, terms);
if (scan.problems.length) {
  die(`没打包：页面正文里还有不能上传的内容。\n${scan.problems.map((x) => `  ✗ ${x}`).join("\n")}\n回到导出那一步，用 --extra-names 补名字或改掉原文，重新导出再打包。`, 1);
}

const r = s.rules ?? {};
const rulesText = [
  r.alias === "首字" ? "客户名字只留第一个字" : "客户名字换成了代号",
  "电话、地址、备注没有放上来",
  r.amounts ? "" : "金额已隐藏",
].filter(Boolean).join("；");

const CSS = `:root{--bg:#f3f1ea;--surface:#fffdf8;--ink:#1c211e;--muted:#646b65;--faint:#8d938e;--line:#e3ded2;--accent:#2d6a55;--accent-ink:#fff;--accent-soft:#e2eee8;--red:#b4372a;--red-soft:#f7e3df;--amber:#8a5d0b;--amber-soft:#f5ebd3;--gray-soft:#ecebe5;--r:14px;--font:-apple-system,BlinkMacSystemFont,"PingFang SC","Hiragino Sans GB","Microsoft YaHei","Noto Sans CJK SC","Noto Sans SC",sans-serif}
@media (prefers-color-scheme:dark){:root{--bg:#121513;--surface:#1b1f1d;--ink:#ebeae4;--muted:#a6aca6;--faint:#80867f;--line:#2b302d;--accent:#7cc4a7;--accent-ink:#0f1a15;--accent-soft:#1d3229;--red:#f08b7d;--red-soft:#3b211d;--amber:#e3b45e;--amber-soft:#382d16;--gray-soft:#262a28}}
*{box-sizing:border-box}html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.6 var(--font);padding:max(16px,env(safe-area-inset-top)) 16px max(28px,env(safe-area-inset-bottom))}
.wrap{max-width:560px;margin:0 auto}header{padding:6px 2px 14px}
h1{font-size:22px;line-height:1.3;margin:0;font-weight:700}
.meta{margin:6px 0 0;color:var(--muted);font-size:13px;display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.pill{padding:1px 8px;border-radius:999px;background:var(--accent-soft);color:var(--accent);font-size:12px;font-weight:600}
.lead{background:var(--accent);color:var(--accent-ink);border-radius:var(--r);padding:14px 16px 14px;margin:0 0 14px;box-shadow:0 6px 18px -12px rgba(0,0,0,.5)}
.lead small{opacity:.85;font-size:12px;letter-spacing:.08em}.lead p{margin:4px 0 0;font-size:18px;font-weight:650;line-height:1.45}
.card{background:var(--surface);border:1px solid var(--line);border-radius:var(--r);padding:14px 14px 6px;margin:0 0 14px}
.card h2{font-size:16px;margin:0 0 4px;display:flex;justify-content:space-between;align-items:baseline;gap:8px}
.card h2 .n{color:var(--faint);font-weight:500;font-size:13px}
h3{font-size:12px;color:var(--muted);font-weight:600;margin:12px 0 0;letter-spacing:.04em}
ul{list-style:none;margin:0;padding:0}li{padding:10px 0;border-top:1px solid var(--line);display:flex;gap:10px;align-items:flex-start}
h3+ul li:first-child,h2+ul li:first-child{border-top:0}
.t{flex:1;min-width:0;overflow-wrap:anywhere}.sub{display:block;color:var(--muted);font-size:13px;margin-top:2px}
.chip{flex:none;font-size:12px;line-height:20px;padding:0 7px;border-radius:6px;background:var(--gray-soft);color:var(--muted);font-weight:600;margin-top:1px;white-space:nowrap}
.chip.red{background:var(--red-soft);color:var(--red)}.chip.amber{background:var(--amber-soft);color:var(--amber)}.chip.green{background:var(--accent-soft);color:var(--accent)}
.time{flex:none;width:46px;font-variant-numeric:tabular-nums;color:var(--accent);font-weight:650;font-size:14px}
.late,.down{color:var(--red);font-weight:600}.up{color:var(--accent);font-weight:600}
.empty{color:var(--faint);font-size:14px;margin:6px 0 10px}.total{margin:2px 0 6px;color:var(--muted);font-size:14px}
.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;padding:6px 0 10px}.num{background:var(--bg);border-radius:10px;padding:10px}
.num b{display:block;font-size:20px;font-variant-numeric:tabular-nums}.num span{font-size:12px;color:var(--muted)}
footer{color:var(--faint);font-size:12px;line-height:1.7;padding:4px 2px 0}
.lock{background:var(--surface);border:1px solid var(--line);border-radius:var(--r);padding:18px 16px;margin:0 0 14px}
.lock label{display:block;font-weight:650;margin-bottom:10px}.lock .row{display:flex;gap:8px}
input{flex:1;min-width:0;font:inherit;font-size:16px;padding:10px 12px;border-radius:10px;border:1px solid var(--line);background:var(--bg);color:var(--ink)}
input:focus-visible,button:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
button{font:inherit;font-weight:650;padding:10px 18px;border:0;border-radius:10px;background:var(--accent);color:var(--accent-ink);cursor:pointer}
button:active{transform:translateY(1px)}button:disabled{opacity:.6}#msg{min-height:1.5em;margin:10px 0 0;color:var(--muted);font-size:13px}`;

let main = content;
let script = "";
if (rawPass) {
  const payload = encryptPayload(content, rawPass.trim());
  main = `<form class="lock" id="lock" autocomplete="off"><label for="pass">这一页加了口令</label><div class="row"><input id="pass" type="password" autocomplete="off" enterkeyhint="go" placeholder="输入口令" required><button type="submit">打开</button></div><p id="msg">口令找发链接给你的人要。</p></form>`;
  script = `(function(){var P=${JSON.stringify(payload)};var f=document.getElementById("lock"),i=document.getElementById("pass"),m=document.getElementById("msg"),b=f.querySelector("button");
function u(s){var x=atob(s),a=new Uint8Array(x.length);for(var k=0;k<x.length;k++)a[k]=x.charCodeAt(k);return a}
if(!(window.crypto&&crypto.subtle&&window.TextEncoder)){m.textContent="这个浏览器打不开加了口令的页面：换手机自带的浏览器，或确认网址是 https 开头。";b.disabled=true;return}
f.addEventListener("submit",function(ev){ev.preventDefault();var p=i.value.trim().normalize("NFC");if(!p)return;b.disabled=true;m.textContent="正在打开……";
crypto.subtle.importKey("raw",new TextEncoder().encode(p),"PBKDF2",false,["deriveKey"]).then(function(k){return crypto.subtle.deriveKey({name:"PBKDF2",salt:u(P.salt),iterations:P.iter,hash:"SHA-256"},k,{name:"AES-GCM",length:256},false,["decrypt"])}).then(function(key){return crypto.subtle.decrypt({name:"AES-GCM",iv:u(P.iv)},key,u(P.data))}).then(function(buf){document.getElementById("app").innerHTML=new TextDecoder().decode(buf)}).catch(function(){m.textContent="口令不对，再试一次。";b.disabled=false;i.select()})})})();`;
}
const scriptSrc = script ? `'sha256-${createHash("sha256").update(script).digest("base64")}'` : "'none'";
const csp = `default-src 'none'; style-src 'unsafe-inline'; img-src data:; script-src ${scriptSrc}; connect-src 'none'; base-uri 'none'; form-action 'none'`;

const html = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<meta name="robots" content="noindex, nofollow, noarchive">
<meta name="referrer" content="no-referrer">
<meta name="color-scheme" content="light dark">
<meta name="${PAGE_META}" content="snapshot=${snapshotFingerprint(s)}; lock=${rawPass ? "有" : "无"}; terms=${terms.length}">
<title>${e(s.title)}</title>
<style>${CSS}</style>
</head>
<body>
<div class="wrap">
<header><h1>${e(s.title)}</h1><p class="meta"><span class="pill">只读</span><span>${e(md(s.data_date))}的情况</span><span>导出于 ${e(String(s.generated_at ?? "").slice(5).replace("-", "/"))}</span></p></header>
<main id="app">
${main}
</main>
<footer>这是导出那一刻的快照，不会自己更新，在这里也不能修改。${e(rulesText)}。</footer>
</div>
${script ? `<script>${script}</script>\n` : ""}</body>
</html>
`;

/* ---------- 写出 ---------- */
const out = resolve(o.out);
if (existsSync(out)) {
  if (!statSync(out).isDirectory()) die(`--out 不是文件夹：${out}`, 2);
  const others = readdirSync(out).filter((f) => f !== "index.html" && f !== ".DS_Store");
  if (others.length) die(`输出文件夹里已经有别的文件（${others.slice(0, 5).join("、")}），为了不误删，这次不写。换一个空文件夹，或先确认这些文件可以删掉。`, 2);
  rmSync(join(out, ".DS_Store"), { force: true });
}
mkdirSync(out, { recursive: true });
const file = join(out, "index.html");
writeTextAtomic(file, html);
console.log(`已做好只读手机页：${file}（${(Buffer.byteLength(html) / 1024).toFixed(1)} KB）`);
console.log(rawPass ? `口令锁：有。口令不写进工作台和网页文件（但会留在本机 Codex 的对话记录里，所以别用在别处用过的密码）；告诉要看的人时单独说。${passWarn ? `\n提醒：${passWarn}` : ""}` : "口令锁：没有。拿到链接的人都能直接看到内容。");
if (scan.warnings.length) console.log(`看一眼：\n${scan.warnings.map((x) => `  · ${x}`).join("\n")}`);
console.log(`正文查过了：${terms.length ? `对照表里 ${terms.length} 个名字都没出现` : "没给对照表，这次没查真名"}；电话、证件号、密钥都没有。`);
console.log("下一步：用 scripts/deploy/check_dist.mjs 检查这个文件夹（带上 --terms 和 --snapshot），通过了再上传。");

#!/usr/bin/env node
// 导出“手机版”打码快照、上传清单和本机对照表。
// 只读：只调用工作台的查看命令（today、clients，加 --json），不改业务数据、不联网。
// （工作台每次打开数据库都会切 WAL 模式、补跑数据库升级，这是工作台自己的行为，不动任何记录。）
import { existsSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, resolve } from "node:path";
import { cli, die, readJson, writeTextAtomic, buildSnapshot, pickSections, defaultSections, reviewHints, SECTIONS, localDate } from "./lib.mjs";

const USAGE = `用法：
  node export_snapshot.mjs --app "<工作台程序文件夹>" --out-dir "<工作台>/手机版" --lock 有|无 [选项]
  node export_snapshot.mjs --from-json today.json --clients-json clients.json --out-dir "<文件夹>" [选项]

只读：调用工作台的查看命令 today、clients（加 --json），不改业务数据。
产出（都在 --out-dir 里，只存在本机；默认是程序文件夹旁边的 手机版/）：
  快照-<日期>.json          打过码的快照，打包手机版用它
  上传清单-<日期>.md        给老板确认的清单（最上面是“最该看的几处”，后面是会上传的全部文字）
  对照表-<日期>.json        化名和原名的对照。只在本机，不上传；打包和自检时用它查漏掉的真名

选项（几项写在一起时，整段用英文双引号包起来）：
  --sections "待办,日程,跟进,风险,小红书"   放哪几块。不写：这五块里今天有内容的；还能加：经营、钱
  --amounts                          放金额（默认不放；“钱”这一块必须加）
  --alias 代号|首字                   客户名字怎么打码：代号＝客户A（默认）；首字＝衡**
  --extra-names "<名字1>,<名字2>=设计师" 还要打码的名字（同事、家人……）；=后面写换成什么，默认“某人”
  --lock 有|无                        第 3 步定的口令锁，写进清单；打包时会核对
  --title "手机看板"                   页面标题（写店名的话，拿到链接的人会看到）
  --json                             结果按 JSON 打印`;

const { values: o } = cli({
  app: { type: "string" }, "out-dir": { type: "string" }, "from-json": { type: "string" }, "clients-json": { type: "string" },
  sections: { type: "string" }, amounts: { type: "boolean" }, alias: { type: "string" }, "extra-names": { type: "string" },
  lock: { type: "string" }, title: { type: "string" }, json: { type: "boolean" },
}, USAGE, { maxPositionals: 0 });

function runWorkbench(app, cmd) {
  const cliFile = join(app, "server", "cli.ts");
  try {
    return JSON.parse(execFileSync(process.execPath, [cliFile, cmd, "--json"], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] }));
  } catch (e) {
    const err = String(e.stderr || e.message || "");
    const hint = /ERR_UNKNOWN_FILE_EXTENSION|node:sqlite|ERR_UNKNOWN_BUILTIN_MODULE/.test(err)
      ? "工作台要 Node 22.18 以上（node -v 看版本）。"
      : /EPERM|EACCES|SQLITE_READONLY|readonly/i.test(err)
        ? "没有权限读工作台的数据：Codex 问“是否允许”时点允许；工作台在知识库外面时也一样。"
        : "先在工作台程序文件夹里跑 npm run doctor 看看工作台好不好。";
    return die(`读工作台数据没成功（${cmd} --json）。${hint}\n原始报错：${err.trim().split("\n").slice(-3).join(" ")}`);
  }
}

function loadData() {
  if (o["from-json"]) {
    if (!o["clients-json"]) die("用 --from-json 时要同时给 --clients-json（客户列表），不然客户名字打不了码。", 2);
    if (!o["out-dir"]) die("用 --from-json 时要写 --out-dir（快照放哪）。", 2);
    return { ov: readJson(o["from-json"]), clients: readJson(o["clients-json"]), outDir: resolve(o["out-dir"]) };
  }
  if (!o.app) die(`要告诉我工作台程序在哪（--app）。\n\n${USAGE}`, 2);
  const app = resolve(o.app);
  if (!existsSync(join(app, "server", "cli.ts"))) die(`这里不像工作台程序文件夹（找不到 server/cli.ts）：${app}\n看 工作台/README.md 里“程序在哪”。`, 2);
  const outDir = resolve(o["out-dir"] ?? join(app, "..", "手机版"));
  return { ov: runWorkbench(app, "today"), clients: runWorkbench(app, "clients"), outDir };
}

/** 每一块会上传的文字，一行一条（给老板看的就是手机上会出现的字）。 */
function sectionLines(s) {
  const L = {};
  const pct = (n) => (n == null ? "—" : `${n > 0 ? "+" : ""}${n}%`);
  if (s.todos) {
    const t = (x, week) => `${week ? "本周：" : ""}${x.title}（${[x.priority, x.overdue ? `已过 ${x.overdue} 天` : x.due ? `截止 ${x.due}` : "", x.client].filter(Boolean).join("，")}）`;
    L.todos = [...(s.headline ? [`最该做的一件事：${s.headline.title}`] : []), ...s.todos.today.map((x) => t(x)), ...s.todos.week.map((x) => t(x, true))];
  }
  if (s.events) L.events = [...s.events.today, ...s.events.upcoming].map((e) => `${e.date} ${e.time}${e.end ? `—${e.end}` : ""} ${e.title}${e.kind ? `（${e.kind}）` : ""}`);
  if (s.follow) L.follow = [...s.follow.key.map((c) => `${c.name}（${c.stage ?? ""}）：${c.reasons.join("；")}${c.next_step ? `。下一步：${c.next_step}` : ""}`), ...s.follow.due.map((c) => `${c.name}（${c.stage ?? ""}）计划 ${c.next_follow ?? "未定"} 联系${c.overdue > 0 ? `，已过 ${c.overdue} 天` : ""}`)];
  if (s.risks) L.risks = s.risks.flatMap((p) => p.items.map((r) => `${p.name}：[${r.level ?? ""}] ${r.text}`));
  if (s.xhs) L.xhs = [...s.xhs.posts.map((p) => `今天 ${p.time ?? ""} ${p.title}（${p.status ?? ""}）`), ...s.xhs.upcoming.map((p) => `${p.date ?? ""} ${p.time ?? ""} ${p.title}（${p.status ?? ""}）`), ...s.xhs.topics.map((x) => `选题：${x.title}`)];
  if (s.biz) L.biz = [`合计比前天 ${pct(s.biz.total.vs_prev)}${s.biz.total.gmv != null ? `，成交 ${s.biz.total.gmv} 元` : ""}`, ...s.biz.channels.map((c) => `${c.name}：比前天 ${pct(c.vs_prev)}，退款率 ${c.refund_rate ?? "—"}%，ROI ${c.roi ?? "—"}${c.gmv != null ? `，成交 ${c.gmv} 元，${c.orders ?? "—"} 单` : ""}`), ...s.biz.alerts.map((a) => `异常[${a.level ?? ""}]：${a.title}`)];
  if (s.cash) L.cash = [`应收 ${s.cash.outstanding ?? "—"} 万，逾期 ${s.cash.overdue_amount ?? "—"} 万（${s.cash.overdue_count ?? "—"} 笔），30 天内到期 ${s.cash.due_30 ?? "—"} 万`];
  return L;
}

function checklist(s, lines, files, skipped) {
  const r = s.rules;
  const left = [
    "客户和合作方的真名、联系人、电话、微信、地址、备注、沟通记录原文",
    ...(r.sections.includes("biz") ? (r.amounts ? [] : ["成交金额、订单数、推广花费"]) : ["经营数字（各平台成交额、订单、推广花费、退款率）"]),
    ...(r.sections.includes("cash") ? [] : ["钱（应收、回款、账本）"]),
    ...skipped.map((x) => `${x.label}（${x.reason}）`),
    "工作台数据库、程序源代码、知识库原文、这份对照表",
  ];
  const all = SECTIONS.filter((x) => r.sections.includes(x.key)).flatMap((x) => lines[x.key] ?? []);
  const h = reviewHints(all);
  const more = (n, shown) => (n > shown ? `（共 ${n} 条，这里列前 ${shown} 条）` : "");
  const hints = [
    `- **可能是人名、自动打码没认出来的叫法**：${h.names.length ? h.names.map((x) => `“${x}”`).join("、") + "。是人名就告诉我，我加进 --extra-names 重导" : "没找到小X、老X、阿X 这类叫法；也请再扫一眼同事、家人的名字"}`,
    `- **还带数字的条目**${more(h.numbers_total, h.numbers.length)}：${h.numbers.length ? "看看是不是价格、预算、账号" : "没有（金额已换成 ××）"}`,
    ...h.numbers.map((l) => `  - ${l}`),
    `- **像地址的条目**${more(h.places_total, h.places.length)}：${h.places.length ? "门店、客户的地址不该放" : "没有"}`,
    ...h.places.map((l) => `  - ${l}`),
  ];
  const rows = SECTIONS.filter((x) => r.sections.includes(x.key)).map((x) => `| ${x.label} | ${(lines[x.key] ?? []).length} 条 | ${x.fields} |`);
  const body = SECTIONS.filter((x) => r.sections.includes(x.key)).map((x) => `### ${x.label}\n\n${(lines[x.key] ?? []).map((l) => `- ${l}`).join("\n") || "- （没有内容）"}`).join("\n\n");
  const m = r.masked;
  return `# 手机版上传清单（${s.generated_at} 导出）

> 请老板从头看到尾。**拿到链接的人都能看到下面这些字。** 没问题就在对话里回“确认上传”；有漏掉的名字或不想放的，直接说。

- 页面标题：${s.title}
- 数据日期：${s.data_date}（手机上看到的是这一天的情况，不会自己更新）
- 客户名字打码：${r.alias === "首字" ? "只留第一个字（衡**）" : "换成代号（客户A、客户B……）"}；金额：${r.amounts ? "**放金额**" : "不放，文字里的金额写成 ××"}
- 口令锁：${r.lock === "有" ? "有（没口令打不开；口令不写在这里）" : r.lock === "无" ? "**没有**（拿到链接的人都能直接看到下面这些字）" : "还没定"}

## 最该看的几处（先看这里）

${hints.join("\n")}

## 放哪几块

| 块 | 条数 | 放了哪些信息 |
|---|---|---|
${rows.join("\n")}

## 没放的

${left.map((x) => `- ${x}`).join("\n")}

## 打码规则

- ${m.clients} 个客户、${m.partners} 个合作方换成${r.alias === "首字" ? "首字" : "代号"}；${m.contacts} 个联系人换成“联系人”或“某老师”这类称呼
- ${m.staff} 个同事名字换成“同事”；老板补充的 ${m.extra} 个名字也换掉了
- 姓加称呼（王总、宋姐）换成“某总”“某姐”；电话、身份证号、邮箱、微信号、门牌地址自动隐藏
- 对照表只在本机：\`${files.table}\`，不上传
- **自动打码认不全人名**：下面每一条都看一眼，发现漏掉的名字告诉我，我加上再导一次

## 会上传的全部文字

${body}
`;
}

let data;
try {
  data = loadData();
} catch (e) { die(`读数据没成功：${e.message}`); }
const { ov, clients, outDir } = data;
if (existsSync(outDir) && !statSync(outDir).isDirectory()) die(`--out-dir 不是文件夹：${outDir}`, 2);

let chosen;
try {
  chosen = o.sections ? { keys: pickSections(o.sections), skipped: [] } : defaultSections(ov);
} catch (e) { die(e.message, 2); }
if (!chosen.keys.length) die(`工作台今天的数据里，默认那几块都是空的（${chosen.skipped.map((x) => x.label).join("、")}），没有能放的。用 --sections 点名要放哪几块。`, 2);

let built;
try {
  built = buildSnapshot(ov, Array.isArray(clients) ? clients : clients?.data ?? [], {
    sections: chosen.keys, amounts: Boolean(o.amounts), style: o.alias ?? "代号", lock: o.lock ?? null,
    extra: String(o["extra-names"] ?? "").split(/[,，、]/).map((x) => x.trim()).filter(Boolean), title: o.title,
  });
} catch (e) { die(e.message, 2); }

const { snapshot, table, terms } = built;
const day = localDate();
const files = {
  snapshot: join(outDir, `快照-${day}.json`),
  checklist: join(outDir, `上传清单-${day}.md`),
  table: join(outDir, `对照表-${day}.json`),
};
const lines = sectionLines(snapshot);
writeTextAtomic(files.snapshot, JSON.stringify(snapshot, null, 2) + "\n");
writeTextAtomic(files.table, JSON.stringify({ note: "只在本机，不上传。check_dist.mjs --terms 用它查漏掉的真名。", generated_at: snapshot.generated_at, aliases: table, terms }, null, 2) + "\n");
writeTextAtomic(files.checklist, checklist(snapshot, lines, files, chosen.skipped));

const summary = {
  ok: true, files, data_date: snapshot.data_date, sections: snapshot.rules.sections,
  counts: Object.fromEntries(Object.entries(lines).map(([k, v]) => [k, v.length])),
  masked: snapshot.rules.masked, amounts: snapshot.rules.amounts, lock: snapshot.rules.lock ?? "未定",
  skipped_sections: chosen.skipped,
  hints: reviewHints(Object.values(lines).flat()),
  samples: Object.fromEntries(Object.entries(lines).map(([k, v]) => [k, v.slice(0, 3)])),
};
if (o.json) console.log(JSON.stringify(summary, null, 2));
else {
  console.log(`已导出手机版快照（数据日期 ${snapshot.data_date}）：`);
  if (chosen.skipped.length) console.log(`默认没放：${chosen.skipped.map((x) => `${x.label}（${x.reason}）`).join("、")}`);
  for (const x of SECTIONS.filter((x) => snapshot.rules.sections.includes(x.key))) {
    console.log(`\n【${x.label}】${(lines[x.key] ?? []).length} 条`);
    for (const l of (lines[x.key] ?? []).slice(0, 3)) console.log(`  - ${l}`);
  }
  console.log(`\n上传清单：${files.checklist}\n快照：${files.snapshot}\n对照表（只在本机，不上传）：${files.table}`);
  const h = reviewHints(Object.values(lines).flat());
  if (h.names.length) console.log(`\n可能是人名、没打码的叫法：${h.names.join("、")}（请老板确认）`);
  if (!o.lock) console.log("\n提醒：没写 --lock 有|无，清单里口令锁是“还没定”。");
  console.log("\n下一步：把上传清单最上面“最该看的几处”贴给老板，再请他打开清单从头看；等老板在对话里回“确认上传”。");
}

// boss-workbench 上线手机版脚本（scripts/deploy/）的测试。在仓库根目录（boss-workbench 文件夹）运行：node --test scripts/deploy/tests/deploy.test.mjs
// （原来是 boss-deploy 的测试，2026-10-11 并进 boss-workbench。）
// （安装 Skill 时不带 tests/，装好的 Skill 里没有这个文件。）
// 数据全是虚构的（ABC茶社示例的缩小版），不联网、不登录、不部署。
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, existsSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { buildSnapshot, buildMasker, pickSections, defaultSections, shortForms, encryptPayload, checkPasscode, suspectNames, reviewHints, scanText, checkNode, FORMAT } from "../lib.mjs";
import { encode } from "../qrcode.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const SCRIPTS = join(HERE, "..");
const run = (script, args, env) => spawnSync(process.execPath, [join(SCRIPTS, script), ...args], { encoding: "utf8", ...(env ? { env: { ...process.env, ...env } } : {}) });
const tmp = () => mkdtempSync(join(tmpdir(), "boss-workbench-deploy-"));

const CLIENTS = [
  { id: "c_hengyan", kind: "客户", name: "衡言律师事务所", contact_name: "陈静", salutation: "陈静（衡言行政）", phone: "186 **** 3391" },
  { id: "c_qingyan", kind: "客户", name: "青砚建筑设计院", contact_name: "吴老师", salutation: "吴老师（青砚院办）" },
  { id: "c_fang", kind: "客户", name: "方雅琴", contact_name: "方雅琴", salutation: "雅琴" },
  { id: "c_hongyin", kind: "伙伴", name: "鸿印包装", contact_name: "刘经理" },
  { id: "c_sh", kind: "客户", name: "上海澜拓科技", contact_name: "周明远" },
];
const OV = {
  date: "2026-10-27",
  headline: { id: "t_1", title: "给衡言出两款升级包装效果图（明天要发）", due: "2026-10-27" },
  todos: {
    today: [
      { id: "t_1", title: "给衡言出两款升级包装效果图（明天要发）", status: "进行中", priority: "紧急", due: "2026-10-27", client_id: "c_hengyan", client_name: "衡言律师事务所", note: "陈静嫌包装普通" },
      { id: "t_3", title: "联系青砚吴老师，问今年春节怎么安排", status: "待办", priority: "重要", due: "2026-10-20", client_id: "c_qingyan", client_name: "青砚建筑设计院" },
    ],
    week: [{ id: "t_9", title: "邀请雅琴来品茶会，电话 13812345678，尾款 1.6 万", status: "待办", priority: "普通", due: "2026-10-31", client_id: "c_fang" }],
    open: 3,
  },
  events: [{ id: "e_1", title: "鸿印包装刘经理电话：春节礼盒报价", start: "2026-10-27T16:00", end: "2026-10-27T16:30", kind: "会面", location: "滨江路 88 号 3 楼 301 室", client_id: "c_hongyin" }],
  upcoming: [{ id: "e_2", title: "和小艾、阿杰过澜拓方案，林总定稿", start: "2026-10-28", all_day: 1, kind: "内部" }],
  key_clients: [{ id: "c_hengyan", name: "衡言律师事务所", stage: "报价中", contact: "陈静", next_step: "10/28 前发效果图给陈静", reasons: ["答应的事明天到期"] }],
  follow: { due: [{ id: "c_qingyan", name: "青砚建筑设计院", stage: "待复购", next_follow: "2026-10-20", overdue: 7 }] },
  risks: [{ id: "p_1", name: "春节企业茶礼预售", risks: [{ level: "高", text: "等鸿印包装刘经理报价，宋姐说周总结前给" }] }],
  xhs: { posts: [{ time: "12:00", title: "白茶怎么泡", status: "待发布" }], upcoming: [], topics: [{ title: "围炉白茶" }], topics_total: 1 },
  sales: { date: "2026-10-26", total: { gmv: 22420, vs_prev: -13.8 }, channels: [{ name: "抖店", owner: "阿杰", gmv: 8725, orders: 80, vs_prev: -12.5, refund_rate: 3.3, roi: 2.93 }] },
  alerts: [{ level: "高", title: "视频号小店成交比上周同日少 30%" }],
  cash: { outstanding: 3.09, overdue: { amount: 0.85, count: 2 }, due_30: 2.24 },
};
const ORIGINALS = ["衡言", "青砚", "陈静", "吴老师", "雅琴", "方雅琴", "鸿印包装", "刘经理", "阿杰", "小艾", "澜拓", "13812345678", "滨江路", "宋姐"];

test("简称：去掉地名和行业词，再取前两个字", () => {
  assert.deepEqual(shortForms("衡言律师事务所").sort(), ["衡言"]);
  assert.ok(shortForms("上海澜拓科技").includes("澜拓"));
  assert.ok(!shortForms("上海澜拓科技").includes("上海"));
});

test("快照只放白名单字段，真名、电话、地址、金额都换掉", () => {
  const { snapshot, terms } = buildSnapshot(OV, CLIENTS, { extra: ["小艾"] });
  const txt = JSON.stringify(snapshot);
  for (const t of ORIGINALS) assert.ok(!txt.includes(t), `快照里还有：${t}`);
  assert.equal(snapshot.format, FORMAT);
  assert.deepEqual(snapshot.rules.sections, ["todos", "events", "follow", "risks", "xhs"]);
  assert.ok(!("biz" in snapshot) && !("cash" in snapshot), "经营和钱默认不放");
  assert.ok(!txt.includes("note") && !txt.includes("location"), "备注、地点不进快照");
  assert.match(snapshot.todos.today[1].title, /^联系客户C某老师/);
  assert.equal(snapshot.todos.today[1].overdue, 7);
  assert.match(snapshot.todos.week[0].title, /××\s*万/);
  assert.match(snapshot.todos.week[0].title, /电话已隐藏/);
  assert.match(snapshot.risks[0].items[0].text, /某姐说周总结前给/, "“周总结”不能误伤，“宋姐”要换掉");
  assert.match(snapshot.events.upcoming[0].title, /和某人、同事过客户\w+方案，某总定稿/);
  assert.ok(terms.includes("衡言律师事务所") && terms.includes("衡言"));
});

test("首字模式：只留第一个字", () => {
  const { snapshot } = buildSnapshot(OV, CLIENTS, { style: "首字" });
  assert.match(snapshot.headline.title, /^给衡\*出/);
  assert.equal(snapshot.follow.key[0].name, "衡**");
});

test("经营默认只放涨跌，钱必须同意放金额", () => {
  const a = buildSnapshot(OV, CLIENTS, { sections: pickSections("经营") }).snapshot;
  assert.equal(a.biz.channels[0].gmv, undefined);
  assert.equal(a.biz.channels[0].vs_prev, -12.5);
  assert.throws(() => buildSnapshot(OV, CLIENTS, { sections: pickSections("钱") }), /--amounts/);
  const b = buildSnapshot(OV, CLIENTS, { sections: pickSections("经营,钱"), amounts: true }).snapshot;
  assert.equal(b.biz.total.gmv, 22420);
  assert.equal(b.cash.outstanding, 3.09);
  assert.throws(() => pickSections("库存"), /不认识/);
});

test("打码器：合作方不取简称，联系人按称呼换", () => {
  const m = buildMasker({ clients: CLIENTS });
  assert.equal(m.mask("鸿印包装刘经理"), "合作方A某经理");
  assert.equal(m.mask("汇总一下"), "汇总一下");
  assert.equal(m.mask("¥1,280 和 300 份"), "¥×× 和 300 份");
});

test("金额：不带单位的价格、w、“1万2”、钱字眼后的数字都遮；数量、日期、时间、百分比不动", () => {
  const m = buildMasker({});
  const cases = {
    "推经典双罐 180（不超 200）": "推经典双罐 ××（不超 ××）",
    "预算 3000 左右": "预算 ×× 左右",
    "客单价 680": "客单价 ××",
    "价 80 一盒": "价 ×× 一盒",
    "欠款1万2": "欠款××万",
    "尾款 1.6w": "尾款 ××w",
    "江南大道 588 号 3 栋 1201 室，到了打电话": "（地址已隐藏），到了打电话",
    "确认 11 月起每月加到 2500 袋": "确认 11 月起每月加到 2500 袋",
    "10/31 结货款，19:30—21:30 直播，退款率 3.3%，第 4 个拿法，2026 春节礼盒，2026-10-27": "10/31 结货款，19:30—21:30 直播，退款率 3.3%，第 4 个拿法，2026 春节礼盒，2026-10-27",
  };
  for (const [a, b] of Object.entries(cases)) assert.equal(m.mask(a), b, a);
  assert.equal(buildMasker({}).mask("预算 3000"), "预算 ××", "默认不放金额");
  assert.equal(buildMasker({ amounts: true }).mask("预算 3000 左右"), "预算 3000 左右", "老板同意放金额时不遮");
});

test("客户超过 26 个，代号用数字（客户27），不出现“客户AB”", () => {
  const many = Array.from({ length: 28 }, (_, i) => ({ id: `c_${String(i).padStart(2, "0")}`, kind: "客户", name: `测试${String.fromCharCode(0x4e00 + i * 7)}${String.fromCharCode(0x4e01 + i * 7)}贸易公司` }));
  const m = buildMasker({ clients: many });
  const aliases = m.table.filter((r) => r.kind === "客户").map((r) => r.alias);
  assert.ok(aliases.includes("客户Z") && aliases.includes("客户27") && aliases.includes("客户28"));
  assert.ok(!aliases.some((a) => /客户[A-Z]{2}/.test(a)));
});

test("疑似人名：小X、老X、阿X 列出来，常见词不算", () => {
  assert.deepEqual(suspectNames("和小艾、老何过方案；小周说阿芳要小程序，老白茶、小红书、老顾客、小时、阿姨").sort(), ["小周", "小艾", "老何", "阿芳"].sort());
  const h = reviewHints(["送到江南大道 588 号", "确认 2500 袋", "围炉煮茶在家怎么弄？", "和小艾对一下"]);
  assert.deepEqual(h.names, ["小艾"]);
  assert.deepEqual(h.places, ["送到江南大道 588 号"]);
  assert.deepEqual(h.numbers, ["送到江南大道 588 号", "确认 2500 袋"]);
});

test("默认几块：只放今天有内容的；点名要的照放", () => {
  const ov = { ...OV, xhs: { posts: [], upcoming: [], topics: [] }, risks: [] };
  const d = defaultSections(ov);
  assert.deepEqual(d.keys, ["todos", "events", "follow"]);
  assert.deepEqual(d.skipped.map((x) => x.key), ["risks", "xhs"]);
  const noXhs = { ...OV };
  delete noXhs.xhs;
  assert.match(defaultSections(noXhs).skipped[0].reason, /没有这一块/);
});

test("查漏：号码、密钥、真名（含 \\u 写法）", () => {
  const r = scanText('陈静 13812345678 AKIDabcdefghijklmnop1234 "\\u8861\\u8a00"', ["陈静", "衡言"]);
  assert.equal(r.problems.length, 3);
  assert.ok(r.problems.join("").includes("没打码的名字 2 个"));
  assert.ok(!r.problems.join("").includes("13812345678") && !r.problems.join("").includes("AKIDabcdefghij"));
});

test("口令：太短不收，纯数字提醒", () => {
  assert.throws(() => checkPasscode("12345"), /太短/);
  assert.match(checkPasscode("12345678"), /纯数字/);
  assert.equal(checkPasscode("周三下午喝白茶"), "");
});

test("导出脚本：三份文件，清单里有全部文字", () => {
  const d = tmp();
  writeFileSync(join(d, "today.json"), JSON.stringify(OV));
  writeFileSync(join(d, "clients.json"), "﻿" + JSON.stringify(CLIENTS));
  const base = ["--from-json", join(d, "today.json"), "--clients-json", join(d, "clients.json"), "--out-dir", join(d, "手机版")];
  const r = run("export_snapshot.mjs", [...base, "--extra-names", "小艾", "--lock", "有", "--json"]);
  assert.equal(r.status, 0, r.stderr);
  const out = JSON.parse(r.stdout);
  assert.match(out.files.checklist, /上传清单-\d{4}-\d{2}-\d{2}\.md$/);
  const list = readFileSync(out.files.checklist, "utf8");
  assert.match(list, /确认上传/);
  assert.match(list, /客户C某老师/);
  assert.match(list, /口令锁：有/);
  assert.ok(list.indexOf("## 最该看的几处") < list.indexOf("## 会上传的全部文字"), "最该看的几处放在最上面");
  assert.equal(JSON.parse(readFileSync(out.files.snapshot, "utf8")).rules.lock, "有");
  // 没补“小艾”时，清单最上面会把它列成疑似人名
  const r2 = run("export_snapshot.mjs", [...base, "--json"]);
  assert.ok(JSON.parse(r2.stdout).hints.names.includes("小艾"));
  // PowerShell 把没加引号的“待办,日程”拆开时，要停下
  const r3 = run("export_snapshot.mjs", [...base, "--sections", "待办", "日程"]);
  assert.equal(r3.status, 2);
  assert.match(r3.stderr, /英文双引号/);
  for (const t of ORIGINALS.filter((x) => x !== "宋姐")) assert.ok(!list.split("## 打码规则")[1].split("对照表只在本机")[1].includes(t), `清单正文里还有：${t}`);
  assert.ok(JSON.parse(readFileSync(out.files.table, "utf8")).terms.includes("陈静"));
});

test("手机页：无口令版没有脚本；口令版能用口令解开，内容不以明文出现", async () => {
  const d = tmp();
  const { snapshot, terms } = buildSnapshot(OV, CLIENTS, { extra: ["小艾"] });
  writeFileSync(join(d, "snap.json"), JSON.stringify(snapshot));
  writeFileSync(join(d, "table.json"), JSON.stringify({ terms }));
  const plain = run("build_page.mjs", ["--snapshot", join(d, "snap.json"), "--out", join(d, "a", "dist-mobile"), "--no-lock"]);
  assert.equal(plain.status, 0, plain.stderr);
  const html = readFileSync(join(d, "a", "dist-mobile", "index.html"), "utf8");
  assert.match(html, /script-src 'none'/);
  assert.match(html, /connect-src 'none'/);
  assert.ok(!html.includes("<script"));
  assert.ok(html.includes("客户C某老师"));
  assert.equal(run("build_page.mjs", ["--snapshot", join(d, "snap.json"), "--out", join(d, "x")]).status, 2, "不写口令也不写 --no-lock 要停下");

  const pass = "周三下午喝白茶";
  assert.equal(run("build_page.mjs", ["--snapshot", join(d, "snap.json"), "--out", join(d, "x2"), "--passcode", pass]).status, 2, "加口令锁不带对照表要停下");
  const locked = run("build_page.mjs", ["--snapshot", join(d, "snap.json"), "--terms", join(d, "table.json"), "--out", join(d, "b", "dist-mobile"), "--passcode", pass]);
  assert.equal(locked.status, 0, locked.stderr);
  const lh = readFileSync(join(d, "b", "dist-mobile", "index.html"), "utf8");
  assert.ok(!lh.includes("客户C某老师"), "口令版里不能有明文内容");
  assert.match(lh, /script-src 'sha256-/);
  const P = JSON.parse(lh.match(/var P=(\{.*?\});/)[1]);
  const u = (s) => Uint8Array.from(Buffer.from(s, "base64"));
  const { subtle } = globalThis.crypto;
  const base = await subtle.importKey("raw", new TextEncoder().encode(pass), "PBKDF2", false, ["deriveKey"]);
  const key = await subtle.deriveKey({ name: "PBKDF2", salt: u(P.salt), iterations: P.iter, hash: "SHA-256" }, base, { name: "AES-GCM", length: 256 }, false, ["decrypt"]);
  const text = new TextDecoder().decode(await subtle.decrypt({ name: "AES-GCM", iv: u(P.iv) }, key, u(P.data)));
  assert.match(text, /客户C某老师/);
  await assert.rejects(async () => {
    const k2 = await subtle.deriveKey({ name: "PBKDF2", salt: u(P.salt), iterations: P.iter, hash: "SHA-256" }, await subtle.importKey("raw", new TextEncoder().encode("错的口令"), "PBKDF2", false, ["deriveKey"]), { name: "AES-GCM", length: 256 }, false, ["decrypt"]);
    await subtle.decrypt({ name: "AES-GCM", iv: u(P.iv) }, k2, u(P.data));
  });

  // 自检：带上快照，两个都该通过；加锁版不带快照要停下（看不到正文）
  for (const dir of ["a", "b"]) assert.equal(run("check_dist.mjs", [join(d, dir, "dist-mobile"), "--terms", join(d, "table.json"), "--snapshot", join(d, "snap.json")]).status, 0);
  const noSnap = run("check_dist.mjs", [join(d, "b", "dist-mobile"), "--terms", join(d, "table.json"), "--json"]);
  assert.equal(noSnap.status, 1);
  assert.match(JSON.parse(noSnap.stdout).problems.join(""), /口令锁/);
});

test("口令锁不再让自检失明：漏了真名和手机号，加锁版也拦下", () => {
  const d = tmp();
  const { snapshot, terms } = buildSnapshot(OV, CLIENTS, { extra: ["小艾"] });
  writeFileSync(join(d, "table.json"), JSON.stringify({ terms }));
  // 模拟“快照里漏了”：手工塞进真名和手机号
  const leaky = { ...snapshot, todos: { ...snapshot.todos, today: [{ ...snapshot.todos.today[0], title: "给衡言律师事务所陈静回电 13812345678" }] } };
  writeFileSync(join(d, "leaky.json"), JSON.stringify(leaky));
  const pass = "周三下午喝白茶";
  const b = run("build_page.mjs", ["--snapshot", join(d, "leaky.json"), "--terms", join(d, "table.json"), "--out", join(d, "b", "dist-mobile"), "--passcode", pass]);
  assert.equal(b.status, 1, "打包时就要拦下");
  assert.match(b.stderr, /没打码的名字/);
  assert.match(b.stderr, /手机号/);
  assert.ok(!existsSync(join(d, "b", "dist-mobile", "index.html")), "拦下时不写页面");
  // 就算页面是用干净快照打的，拿漏了的快照来查，也对不上、也查得出
  writeFileSync(join(d, "clean.json"), JSON.stringify(snapshot));
  assert.equal(run("build_page.mjs", ["--snapshot", join(d, "clean.json"), "--terms", join(d, "table.json"), "--out", join(d, "c", "dist-mobile"), "--passcode", pass]).status, 0);
  const c = run("check_dist.mjs", [join(d, "c", "dist-mobile"), "--terms", join(d, "table.json"), "--snapshot", join(d, "leaky.json"), "--json"]);
  assert.equal(c.status, 1);
  const all = JSON.parse(c.stdout).problems.join("\n");
  assert.match(all, /对不上/);
  assert.match(all, /没打码的名字/);
});

test("口令锁要和清单上写的一致", () => {
  const d = tmp();
  const { snapshot, terms } = buildSnapshot(OV, CLIENTS, { lock: "无" });
  writeFileSync(join(d, "s.json"), JSON.stringify(snapshot));
  writeFileSync(join(d, "t.json"), JSON.stringify({ terms }));
  assert.equal(run("build_page.mjs", ["--snapshot", join(d, "s.json"), "--terms", join(d, "t.json"), "--out", join(d, "o"), "--passcode", "周三下午喝白茶"]).status, 2);
  assert.equal(run("build_page.mjs", ["--snapshot", join(d, "s.json"), "--terms", join(d, "t.json"), "--out", join(d, "o"), "--no-lock"]).status, 0);
});

test("加密：同一段文字每次的密文都不同", () => {
  const a = encryptPayload("你好", "周三下午喝白茶"), b = encryptPayload("你好", "周三下午喝白茶");
  assert.notEqual(a.data, b.data);
  assert.notEqual(a.salt, b.salt);
});

test("自检：数据库、源代码、电话、密钥、真名、绝对路径都拦下", () => {
  const d = tmp();
  const dist = join(d, "dist-mobile");
  mkdirSync(join(dist, "assets"), { recursive: true });
  writeFileSync(join(dist, "index.html"), '<script src="/assets/a.js"></script>衡言 13812345678');
  writeFileSync(join(dist, "assets", "a.js"), 'const id="AKIDabcdefghijklmnop1234";fetch("/api/x")');
  writeFileSync(join(dist, "workbench.db"), "x");
  writeFileSync(join(dist, "app.ts"), "x");
  writeFileSync(join(d, "t.json"), JSON.stringify({ terms: ["衡言"] }));
  const r = run("check_dist.mjs", [dist, "--terms", join(d, "t.json"), "--json"]);
  assert.equal(r.status, 1);
  const out = JSON.parse(r.stdout);
  const all = out.problems.join("\n");
  for (const k of ["workbench.db", "app.ts", "手机号", "SecretId", "没打码的名字", "绝对路径"]) assert.ok(all.includes(k), `应拦下：${k}`);
  assert.ok(!all.includes("AKIDabcdefghij"), "报告里不能把密钥原样打出来");
  assert.ok(out.warnings.join("\n").includes("本机接口"));
  assert.equal(run("check_dist.mjs", [join(d, "nope")]).status, 2);
});

test("二维码：尺寸、定位图案、版本挑选", () => {
  const q = encode("https://demo-1300000000.tcloudbaseapp.com/m-3f9a2c7e/?v=k3x9qa");
  assert.equal(q.size, q.version * 4 + 17);
  for (const [x, y] of [[0, 0], [q.size - 7, 0], [0, q.size - 7]]) {
    assert.equal(q.modules[y][x], true);
    assert.equal(q.modules[y + 1][x + 1], false);
    assert.equal(q.modules[y + 3][x + 3], true);
  }
  assert.equal(encode("https://a.cn/").version, 1);
  assert.equal(encode("https://example.com/" + "z".repeat(185)).version, 10);
  assert.throws(() => encode("https://example.com/" + "z".repeat(300)), /太长/);
  const d = tmp();
  const r = run("qrcode.mjs", ["https://a.cn/m-1/?v=1", "--out", join(d, "qr.html")]);
  assert.equal(r.status, 0, r.stderr);
  assert.match(readFileSync(join(d, "qr.html"), "utf8"), /确定访问/);
  assert.equal(run("qrcode.mjs", ["http://a.cn/", "--out", join(d, "x.svg")]).status, 2, "非 https 不收");
});

test("记录：先预留文件夹，重跑不变；只认 m-xxxxxxxx；撤下后换新文件夹", () => {
  const d = tmp();
  const file = join(d, "手机版", "记录.md");
  const R = (...a) => run("record.mjs", [...a, "--file", file]);
  const info0 = JSON.parse(R("info", "--json").stdout);
  assert.equal(info0.status, "未上线");
  assert.equal(info0.path, null, "info 只读，不再每次给一个新名字");
  const r1 = JSON.parse(R("reserve", "--env", "demo-env", "--json").stdout);
  assert.match(r1.path, /^m-[0-9a-f]{8}$/);
  const r2 = JSON.parse(R("reserve", "--env", "demo-env", "--json").stdout);
  assert.equal(r2.path, r1.path, "重跑 reserve 拿到同一个文件夹");
  assert.equal(R("reserve", "--env", "other-env").status, 1, "换了环境要停下问老板");
  const p = r1.path;
  const url = `https://x.tcloudbaseapp.com/${p}/index.html?v=1`;
  assert.equal(R("add", "--action", "上线", "--path", `/${p}/`, "--env", "demo-env", "--url", url).status, 2, "带斜杠的写法不收");
  assert.equal(R("add", "--action", "上线", "--path", p, "--env", "demo-env", "--url", "https://x.tcloudbaseapp.com/index.html").status, 2, "链接要指向这个文件夹");
  assert.equal(R("add", "--action", "上线", "--path", p, "--env", "demo-env", "--url", url, "--lock", "有", "--scope", "待办|日程").status, 0);
  assert.equal(R("add", "--action", "更新", "--path", p, "--env", "demo-env", "--url", url.replace("v=1", "v=2")).status, 0);
  const live = JSON.parse(R("info", "--json").stdout);
  assert.equal(live.status, "在线");
  assert.equal(live.path, p);
  // 删除前核对：空、/、别的文件夹都不行
  for (const bad of ["", "/", "m-00000000", `/${p}`]) assert.notEqual(R("check", "--path", bad).status, 0, `不该放行：${bad}`);
  const ok = R("check", "--path", p);
  assert.equal(ok.status, 0);
  assert.match(ok.stdout, new RegExp(`cloudPath="${p}", isDir=true, confirm=true`));
  assert.equal(R("add", "--action", "撤下", "--path", p, "--env", "demo-env").status, 0);
  const text = readFileSync(file, "utf8");
  assert.equal((text.match(/^\| 20\d\d-/gm) ?? []).length, 4);
  assert.match(text, /口令锁：有（口令不记在这里）\n/);
  assert.match(text, /待办\/日程/, "表格里的 | 要换掉");
  const after = JSON.parse(R("info", "--json").stdout);
  assert.equal(after.status, "已撤下");
  assert.equal(after.old_path, p);
  assert.notEqual(R("check", "--path", p).status, 0, "撤下后不能再删");
  assert.notEqual(JSON.parse(R("reserve", "--env", "demo-env", "--json").stdout).path, p, "撤下后再上线换新文件夹");
});

test("装机检查：只读，认得出插件装没装、误装的 cloudbase-sites", () => {
  const home = tmp();
  const env = { HOME: home, USERPROFILE: home, CODEX_HOME: join(home, ".codex") };
  const r0 = run("preflight.mjs", ["--json"], env);
  assert.equal(r0.status, 1);
  assert.match(JSON.parse(r0.stdout).items.find((x) => x.name === "CloudBase 插件").text, /没找到/);
  mkdirSync(join(home, ".codex"));
  writeFileSync(join(home, ".codex", "config.toml"), '[plugins."cloudbase@tencent-cloudbase"]\nenabled = true\n\n[plugins."cloudbase-sites@tencent-cloudbase"]\nenabled = true\n');
  const r1 = JSON.parse(run("preflight.mjs", ["--json"], env).stdout);
  assert.equal(r1.items.find((x) => x.name === "CloudBase 插件").level, "ok");
  assert.equal(r1.items.find((x) => x.name === "cloudbase-sites").level, "todo");
  assert.equal(r1.items.find((x) => x.name === "CloudBase 登录").level, "info");
  assert.deepEqual(readdirSync(home).sort(), [".codex"], "不在家目录里写任何东西");
});

test("装机检查：Node 太旧时，请老板到 nodejs.org 下载长期支持版（LTS），不提课程包", () => {
  for (const v of ["18.12.0", "20.11.1", "22.17.0"]) {
    const r = checkNode(v);
    assert.equal(r.name, "Node");
    assert.equal(r.level, "todo", v);
    assert.match(r.fix, /nodejs\.org/, v);
    assert.match(r.fix, /长期支持版（LTS）/, v);
    assert.match(r.fix, /22\.18 以上/, v);
    assert.ok(!/课程包/.test(r.fix), `${v} 的处理办法里不该提课程包`);
  }
  assert.match(checkNode("18.12.0").text, /18\.15 以上/);
  assert.match(checkNode("20.11.1").text, /22\.18 以上/);
  for (const v of ["22.18.0", "24.1.0"]) assert.deepEqual([checkNode(v).level, checkNode(v).fix], ["ok", ""], v);
  const src = readFileSync(join(SCRIPTS, "preflight.mjs"), "utf8");
  assert.ok(!/课程包|课前/.test(src), "preflight.mjs 里不该再有课程说法");
});

test("没有脚本会写到 Skill 文件夹外面的固定位置", () => {
  for (const f of readdirSync(SCRIPTS).filter((x) => x.endsWith(".mjs"))) {
    const src = readFileSync(join(SCRIPTS, f), "utf8");
    assert.ok(!/AKID[0-9A-Za-z]{13}|SecretKey\s*=/.test(src), `${f} 里不该有密钥`);
    if (f === "preflight.mjs") assert.ok(!/writeFileSync|writeTextAtomic|mkdirSync|rmSync|appendFileSync|renameSync/.test(src), "装机检查只读，不写文件");
    else assert.ok(!/homedir\(\)|~\//.test(src), `${f} 里不该有家目录写死`);
  }
  assert.ok(existsSync(join(SCRIPTS, "lib.mjs")));
  execFileSync(process.execPath, ["--check", join(SCRIPTS, "export_snapshot.mjs")]);
});

test("并进 boss-workbench：给人看的文字都改成 boss-workbench，路径写 scripts/deploy/", () => {
  for (const f of readdirSync(SCRIPTS).filter((x) => x.endsWith(".mjs"))) {
    const src = readFileSync(join(SCRIPTS, f), "utf8");
    for (const old of ["$boss-deploy", "boss-add-module", "references/常见问题.md", "部署上线 Skill"]) assert.ok(!src.includes(old), `${f} 里还有：${old}`);
  }
  const home = tmp();
  const pre = JSON.parse(run("preflight.mjs", ["--json"], { HOME: home, USERPROFILE: home, CODEX_HOME: join(home, ".codex") }).stdout);
  assert.match(pre.items.find((x) => x.name === "CloudBase 登录").fix, /“\$boss-workbench 登录云开发”/);
  const { snapshot } = buildSnapshot(OV, CLIENTS, { extra: ["小艾"] });
  assert.equal(snapshot.format, "boss-workbench/手机版快照/1");
  const d = tmp();
  writeFileSync(join(d, "snap.json"), JSON.stringify(snapshot));
  const b = run("build_page.mjs", ["--snapshot", join(d, "snap.json"), "--out", join(d, "dist-mobile"), "--no-lock"]);
  assert.equal(b.status, 0, b.stderr);
  assert.match(b.stdout, /scripts\/deploy\/check_dist\.mjs/);
  const html = readFileSync(join(d, "dist-mobile", "index.html"), "utf8");
  assert.match(html, /<meta name="boss-workbench" content="snapshot=/);
  assert.ok(!html.includes("boss-deploy"));
  assert.match(run("build_page.mjs", ["--help"]).stdout, /BOSS_WORKBENCH_PASSCODE/);
  const file = join(d, "手机版", "记录.md");
  assert.equal(run("record.mjs", ["reserve", "--env", "demo-env", "--file", file]).status, 0);
  const rec = readFileSync(file, "utf8");
  assert.match(rec, /由 boss-workbench 维护/);
  assert.ok(!rec.includes("boss-deploy"));
});

test("改名以前留下的东西照样认：旧快照、旧页面、旧记录、旧口令变量", () => {
  const d = tmp();
  const { snapshot, terms } = buildSnapshot(OV, CLIENTS, { extra: ["小艾"] });
  const old = { ...snapshot, format: "boss-deploy/手机版快照/1" };
  writeFileSync(join(d, "old.json"), JSON.stringify(old));
  writeFileSync(join(d, "t.json"), JSON.stringify({ terms }));
  const b = run("build_page.mjs", ["--snapshot", join(d, "old.json"), "--terms", join(d, "t.json"), "--out", join(d, "dist-mobile")], { BOSS_DEPLOY_PASSCODE: "周三下午喝白茶" });
  assert.equal(b.status, 0, b.stderr);
  assert.match(b.stdout, /口令锁：有/);
  // 旧版打的页面：meta 名字是 boss-deploy，照样能核对快照指纹
  const page = join(d, "dist-mobile", "index.html");
  writeFileSync(page, readFileSync(page, "utf8").replace('<meta name="boss-workbench"', '<meta name="boss-deploy"'));
  const c = run("check_dist.mjs", [join(d, "dist-mobile"), "--terms", join(d, "t.json"), "--snapshot", join(d, "old.json"), "--json"]);
  assert.equal(c.status, 0, c.stdout);
  assert.ok(!JSON.parse(c.stdout).warnings.join("").includes("没有快照指纹"));
  // 旧版写的记录：开始标记是 boss-deploy 的，照样读得出在线；再记一笔时原地换成新标记，不多出一段
  const file = join(d, "手机版", "记录.md");
  const R = (...a) => run("record.mjs", [...a, "--file", file]);
  const p = JSON.parse(R("reserve", "--env", "demo-env", "--json").stdout).path;
  const url = `https://x.tcloudbaseapp.com/${p}/index.html?v=1`;
  assert.equal(R("add", "--action", "上线", "--path", p, "--env", "demo-env", "--url", url).status, 0);
  writeFileSync(file, readFileSync(file, "utf8").replace("由 boss-workbench 维护", "由 boss-deploy 维护"));
  const info = JSON.parse(R("info", "--json").stdout);
  assert.equal(info.status, "在线");
  assert.equal(info.path, p);
  assert.equal(R("add", "--action", "更新", "--path", p, "--env", "demo-env", "--url", url.replace("v=1", "v=2")).status, 0);
  const text = readFileSync(file, "utf8");
  assert.equal((text.match(/<!-- 手机版记录 开始/g) ?? []).length, 1);
  assert.ok(!text.includes("boss-deploy"));
  assert.equal((text.match(/^\| 20\d\d-/gm) ?? []).length, 3);
});

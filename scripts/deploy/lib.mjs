// boss-workbench 上线手机版脚本共用的小工具：参数、读写文件、打码、加密。
// （原来是 boss-deploy Skill 的脚本，2026-10-11 并进 boss-workbench 的 scripts/deploy/。）
// 只用 Node 自带模块（Node 18 以上），Mac 和 Windows 都能跑；不含任何账号、密钥。
import { parseArgs } from "node:util";
import { readFileSync, writeFileSync, renameSync, rmSync, mkdirSync } from "node:fs";
import { dirname, join, basename } from "node:path";
import { randomBytes, pbkdf2Sync, createCipheriv, createHash } from "node:crypto";

export const FORMAT = "boss-workbench/手机版快照/1";
// 并进 boss-workbench 以前导出的快照、打的页面：照样认（只读的时候认，写出来的一律是新名字）
export const LEGACY_FORMATS = ["boss-deploy/手机版快照/1"];
export const isSnapshotFormat = (f) => f === FORMAT || LEGACY_FORMATS.includes(f);
export const PAGE_META = "boss-workbench"; // 手机页里 <meta name="…"> 的名字：记快照指纹、有没有口令锁
export const PAGE_META_RE = /<meta name="boss-(?:workbench|deploy)" content="([^"]*)">/;
export const PASS_ITER = 250000; // 口令锁：PBKDF2-SHA256 次数。手机上解开约零点几秒
export const PASS_MIN = 6;

/* ---------- 参数、输出 ---------- */

export function die(msg, code = 1) {
  console.error(msg);
  process.exit(code);
}

/**
 * 解析命令行参数。参数写错时用中文说明哪里不对，并打印用法。
 * maxPositionals：最多几个不带 -- 的参数。多出来的多半是 Windows PowerShell 把没加引号的
 * “待办,日程,跟进”拆成了几段，这时停下，不悄悄只用第一段。
 */
export function cli(options, usage, { maxPositionals = Infinity } = {}) {
  let r;
  try {
    r = parseArgs({ args: process.argv.slice(2), options: { ...options, help: { type: "boolean", short: "h" } }, allowPositionals: true, strict: true });
  } catch (e) {
    return die(`参数不对：${e.message}\n\n${usage}`, 2);
  }
  if (r.values.help) { console.log(usage); process.exit(0); }
  if (r.positionals.length > maxPositionals) {
    const extra = r.positionals.slice(maxPositionals).join(" ");
    return die(`参数不对：多出来“${extra}”。几项写在一起时要用英文双引号包起来，比如 --sections "待办,日程,跟进"（Windows PowerShell 不加引号会把逗号拆开）。\n\n${usage}`, 2);
  }
  return r;
}

/* ---------- 装机检查：Node 版本 ---------- */

const NODE_FIX = "到 nodejs.org 下载长期支持版（LTS），要 22.18 以上，装好后重开终端和 Codex";

/** 看 Node 版本够不够：CloudBase 插件要 18.15 以上，工作台要 22.18 以上。返回 preflight 的一项 { name, level, text, fix }。 */
export function checkNode(version = process.versions.node) {
  const [maj, min] = String(version).replace(/^v/, "").split(".").map(Number);
  const ge = (a, b) => maj > a || (maj === a && min >= b);
  if (!ge(18, 15)) return { name: "Node", level: "todo", text: `Node ${version}，太旧：CloudBase 插件要 18.15 以上`, fix: NODE_FIX };
  if (!ge(22, 18)) return { name: "Node", level: "todo", text: `Node ${version}：插件能跑，但工作台要 22.18 以上`, fix: NODE_FIX };
  return { name: "Node", level: "ok", text: `Node ${version}`, fix: "" };
}

const p2 = (n) => String(n).padStart(2, "0");
export const localDate = (d = new Date()) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
export const localStamp = (d = new Date()) => `${localDate(d)} ${p2(d.getHours())}:${p2(d.getMinutes())}`;

/** 读 JSON。Windows PowerShell 用 > 存的文件是 UTF-16，这里也能读。 */
export function readJson(file) {
  const b = readFileSync(file);
  let text;
  if (b[0] === 0xff && b[1] === 0xfe) text = b.subarray(2).toString("utf16le");
  else text = b.toString("utf8").replace(/^﻿/, "");
  try { return JSON.parse(text); } catch (e) { throw new Error(`${basename(file)} 不是有效的 JSON：${e.message}`); }
}

/** 写文本：先写临时文件再换名，中途失败不留半截。 */
export function writeTextAtomic(file, text) {
  mkdirSync(dirname(file), { recursive: true });
  const tmp = join(dirname(file), `.${basename(file)}.${process.pid}.tmp`);
  writeFileSync(tmp, text, "utf8");
  try { renameSync(tmp, file); } catch (e) {
    rmSync(tmp, { force: true });
    if (!["EPERM", "EBUSY", "EACCES"].includes(e.code)) throw e;
    writeFileSync(file, text, "utf8"); // Windows 上文件被占用时换名会失败，退回直接写
  }
}

export const escapeHtml = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

/* ---------- 打码 ---------- */

// 称呼前面的姓（去掉了“和、时、成、全、安、万、明、文”这类常当普通字用的，免得误伤“和老师”“说明总”）
const SURNAMES = "王李张刘陈杨黄赵吴周徐孙马朱胡郭何高林罗郑梁谢宋唐许韩冯邓曹彭曾肖田董袁潘蒋蔡余杜叶程苏魏吕丁任沈姚卢姜崔钟谭陆汪范金石廖贾夏韦付方白邹孟熊秦邱江尹薛闫段雷侯龙史陶黎贺顾毛郝龚邵钱严覃武戴莫孔汤温康施牛樊葛邢齐易乔伍庞颜倪庄聂章鲁岳翟殷詹申欧耿兰焦俞左柳甘祝宁尚符舒阮柯纪梅童凌毕季裴霍涂苗谷盛曲翁冉骆蓝游辛靳管柴蒙鲍喻祁蒲房滕屈饶解牟艾尤穆卓吉缪简芦麦褚娄窦戚岑景党宫费卜冷晏席卫米柏宗瞿桂佟臧闵苟邬边卞姬仇栾隋刁沙荣巫寇桑郎甄丛仲虞敖巩佘池查麻苑迟邝";
const PERSON_SURNAMES = SURNAMES + "于文明华关向车路司连项和时成全安万常应单包商古农阳";
const HONOR = "老师|经理|师傅|主任|院长|律师|医生|老板|女士|先生|小姐|总(?![结额计量数体部裁价共线之账])|姐(?!妹)|哥|叔|姨";
const HONOR_TAIL = /(老师|经理|师傅|主任|院长|律师|医生|老板|总|姐|哥)$/;
const PLACES = "北京|上海|天津|重庆|广州|深圳|杭州|南京|苏州|成都|武汉|西安|长沙|郑州|青岛|宁波|厦门|福州|合肥|济南|东莞|佛山|无锡|昆明|南宁|贵阳|沈阳|大连|哈尔滨|长春|石家庄|太原|南昌|兰州|海口|三亚|珠海|中山|温州|泉州|常州|徐州|烟台|绍兴|嘉兴|金华|台州|香港|澳门|中国|广东|浙江|江苏|山东|福建|四川|湖北|湖南|河南|河北|安徽|江西|云南|广西|贵州|辽宁|吉林|黑龙江|山西|陕西|甘肃|海南|内蒙古|新疆|西藏|宁夏|青海";
const PLACE_RE = new RegExp(`^(?:${PLACES})(?:市|省)?`);
const SUFFIX_RE = /(有限责任公司|股份有限公司|有限公司|集团|公司|律师事务所|会计师事务所|事务所|建筑设计院|设计院|研究院|设计工作室|工作室|科技|置业|地产|财税|医疗器械|医药|资本|咖啡|精品酒店|酒店|瑜伽|物流|民宿|跨境电商|电商|广告|教育|建设|包装|快运|岩茶厂|茶厂|工厂|餐饮|文化|传媒|贸易|实业|商贸|网络|信息|咨询|服务|中心|门店|店|馆|厂)$/;
const STOP = new Set(["中国", "国际", "全国", "我们", "客户", "公司", "第一", "东方", "华夏", "天下", "未来", "阳光", "美好", "金色", "绿色", "茶叶", "茶具", "茶礼", "茶社", "茶馆"]);
const PARTNER_KINDS = new Set(["伙伴", "合作方", "供应商", "合作伙伴"]);

const PRIVATE = [
  [/(?<![\dA-Za-z])\d{17}[\dXx](?![\dA-Za-z])/g, "（证件号已隐藏）"],
  [/(?<!\d)1[3-9]\d[\s-]?(?:\d{4}|\*{4})[\s-]?\d{4}(?!\d)/g, "（电话已隐藏）"],
  [/(?<!\d)0\d{2,3}-\d{7,8}(?!\d)/g, "（电话已隐藏）"],
  [/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "（邮箱已隐藏）"],
  [/(微信号|微信ID|微信|vx|VX|wx|WX)\s*[:：]?\s*[A-Za-z][-_A-Za-z0-9]{5,19}/g, "$1（已隐藏）"],
  // 门牌地址：“江南大道 588 号”这种中间带空格的也认
  [/[一-龥A-Za-z0-9]{1,12}(?:路|街|大道|巷|弄)\s*\d{1,5}\s*号(?:院|楼)?(?:\s*[一-龥A-Za-z0-9-]{0,12}\s*(?:室|楼|层|座|栋|单元))*/g, "（地址已隐藏）"],
];

// 不放金额时，文字里的钱换成 ××。宁可多遮，不能漏：
//   带单位的（1.6 万、300 元、1.6w、3k、“1万2”整段）；钱字眼后面的数字（预算 3000、客单价 680、价 80）；
//   没单位的三位以上数字（“推经典双罐 180（不超 200）”）。数量（6 盒、2500 袋）、百分比、日期、时间不动。
const NUM = String.raw`\d[\d,]*(?:\.\d+)?`;
const QTY = "盒袋份个件人位名天日周月年次回条款号点分秒时斤两克箱罐包瓶杯泡壶只张页篇单笔层楼室栋座米家店台套场期届批粒片双对支根株桌趟遍集章节步岁度℃%‰"; // 后面跟这些的是数量、时间，不遮
const MONEY_WORDS = "预算|报价|单价|客单价|客单|尾款|货款|欠款|余款|成交额|成交价|售价|定价|标价|原价|到手价|折后|一口价|均价|进价|成本|定金|订金|押金|首付|结款|付款|回款|收款|应收|应付|费用|花费|营收|流水|利润|毛利|充值|余额|消费|价格|价钱|价";
const MONEY = [
  [new RegExp(`[￥¥]\\s*${NUM}(?:\\s*(?:万元|万|元|[wWkK](?![A-Za-z])))?`, "g"), () => "¥××"],
  [new RegExp(`${NUM}(\\s*)(万元|万(?:\\d{1,4}千?)?|元|块钱|块(?![一-龥])|[wWkK](?![A-Za-z]))`, "g"), (_, sp, u) => `××${sp}${u.startsWith("万") && u !== "万元" ? "万" : u}`],
  [new RegExp(`(${MONEY_WORDS})([^\\d\\n，。；,;！？!?]{0,6}?)(?<![\\d./:-])${NUM}(?![\\d./:-])(?!\\s*[${QTY}])`, "g"), (_, w, mid) => `${w}${mid}××`],
  [new RegExp(`(?<![\\d./:\\-A-Za-z第])(?!(?:19|20)\\d\\d(?!\\d))(?:\\d{1,3}(?:,\\d{3})+|\\d{3,})(?:\\.\\d+)?(?![\\d./:\\-A-Za-z])(?!\\s*[${QTY}])`, "g"), () => "××"],
];

/** 客户代号：前 26 个用字母（客户A……客户Z），再往后用数字（客户27），免得“客户AB”被读成“A 和 B”。 */
export const aliasCode = (n) => (n < 26 ? String.fromCharCode(65 + n) : String(n + 1));
const firstMask = (s) => (s.length <= 1 ? s : s[0] + "*".repeat(Math.min(2, s.length - 1)));
const cleanName = (s) => String(s ?? "").replace(/[（(][^）)]*[）)]/g, "").trim();
const isCjkName = (s) => /^[一-龥]{2,4}$/.test(s);

export function isPersonName(name) {
  return /^[一-龥]{2,3}$/.test(name) && PERSON_SURNAMES.includes(name[0]) && !SUFFIX_RE.test(name);
}

/** 公司名的简称：去掉开头的地名、结尾的行业词，再加上前两个字（“云杉律师事务所”→“云杉”）。 */
export function shortForms(name) {
  const out = new Set();
  let base = name;
  for (let i = 0; i < 2; i++) { const m = base.match(PLACE_RE); if (m && base.length - m[0].length >= 2) base = base.slice(m[0].length); }
  if (base !== name) out.add(base);
  let s = base;
  for (let i = 0; i < 2; i++) { const m = s.match(SUFFIX_RE); if (m && s.length - m[0].length >= 2) s = s.slice(0, -m[0].length); else break; }
  if (s !== base) out.add(s);
  if (base.length >= 4 && /^[一-龥]{2}/.test(base)) out.add(base.slice(0, 2));
  return [...out].filter((t) => t.length >= 2 && !STOP.has(t) && t !== name);
}

/**
 * 做一个打码器。
 * clients：工作台的客户列表（id、name、kind、contact_name、salutation、decision_maker）。
 * staff：同事名字（渠道负责人等），换成“同事”。extra：老板补充的名字，"小艾" 或 "小艾=设计"。
 * style："代号"（客户A）或 "首字"（衡**）。amounts：false 时把文字里的金额换成 ××。
 */
export function buildMasker({ clients = [], staff = [], extra = [], style = "代号", amounts = false } = {}) {
  const rep = new Map(); // 原文 → 替换
  const table = []; // 对照表：只存在本机
  const aliasById = new Map();
  const counters = { 客户: 0, 合作方: 0 };
  const put = (term, to, kind) => {
    const t = String(term ?? "").trim();
    if (t.length < 2 || rep.has(t)) return;
    const v = style === "首字" ? firstMask(t) : to;
    rep.set(t, v);
    table.push({ original: t, alias: v, kind });
  };
  const sorted = [...clients].filter((c) => c && c.name).sort((a, b) => String(a.id ?? a.name).localeCompare(String(b.id ?? b.name)));
  for (const c of sorted) {
    const cat = PARTNER_KINDS.has(c.kind) ? "合作方" : "客户";
    const name = cleanName(c.name);
    const alias = style === "首字" ? firstMask(name) : `${cat}${aliasCode(counters[cat]++)}`;
    aliasById.set(c.id ?? name, alias);
    put(name, alias, cat);
    const person = cat === "客户" && isPersonName(name);
    if (person && name.length === 3) put(name.slice(1), alias, `${cat}（名）`);
    if (!person && cat === "客户") for (const s of shortForms(name)) put(s, alias, `${cat}（简称）`);
    for (const raw of [c.contact_name, c.salutation, c.decision_maker]) {
      const n = cleanName(raw);
      if (!isCjkName(n) && !/^[一-龥]{1,3}(老师|经理|师傅|主任|院长|律师|医生|老板|总|姐|哥)$/.test(n)) continue;
      if (n === name) continue;
      const tail = n.match(HONOR_TAIL);
      put(n, person ? alias : tail ? `某${tail[1]}` : "联系人", "联系人");
    }
  }
  for (const s of staff) put(cleanName(s), "同事", "同事");
  for (const e of extra) {
    const [k, v] = String(e).split("=").map((x) => x.trim());
    if (k) put(k, v || "某人", "补充");
  }
  const terms = [...rep.keys()].sort((a, b) => b.length - a.length);
  const termRe = terms.length ? new RegExp(terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"), "g") : null;
  const honorRe = new RegExp(`[${SURNAMES}](${HONOR})`, "g");

  function mask(text) {
    if (text == null) return null;
    let s = String(text);
    if (termRe) s = s.replace(termRe, (m) => rep.get(m));
    if (style !== "首字") s = s.replace(honorRe, "某$1");
    for (const [re, to] of PRIVATE) s = s.replace(re, to);
    if (!amounts) for (const [re, to] of MONEY) s = s.replace(re, to);
    return s;
  }
  const who = (id, name) => (id != null && aliasById.has(id) ? aliasById.get(id) : name ? mask(name) : null);
  return { mask, who, table, terms, aliasById };
}

/* ---------- 快照 ---------- */

export const SECTIONS = [
  { key: "todos", label: "今天要做", names: ["待办", "todos"], on: true, fields: "事情、截止日、紧急程度、相关客户（化名）；不放备注" },
  { key: "events", label: "日程", names: ["日程", "events"], on: true, fields: "时间、事情、类型、相关客户（化名）；不放地点和备注" },
  { key: "follow", label: "该联系的客户", names: ["跟进", "客户", "follow"], on: true, fields: "客户（化名）、阶段、计划跟进日、跟进理由和下一步；不放联系人、电话、沟通原文" },
  { key: "risks", label: "项目风险", names: ["风险", "项目", "risks"], on: true, fields: "项目名、风险说明" },
  { key: "xhs", label: "小红书排期", names: ["小红书", "内容", "xhs"], on: true, fields: "今天和后三天要发的笔记标题和状态、今天的选题标题；不放账号数据" },
  { key: "biz", label: "各平台昨天", names: ["经营", "biz"], on: false, fields: "各平台比前天涨跌、退款率、ROI、异常标题（加 --amounts 才放成交额和订单数）" },
  { key: "cash", label: "钱（应收）", names: ["钱", "应收", "cash"], on: false, fields: "应收总额、逾期金额和笔数、30 天内到期金额（万元）" },
];

/** 把“待办,日程,经营”这样的写法换成内部的 key；不写就用默认的五块。 */
export function pickSections(spec) {
  if (!spec) return SECTIONS.filter((s) => s.on).map((s) => s.key);
  const keys = [];
  for (const raw of String(spec).split(/[,，、\s]+/).filter(Boolean)) {
    const s = SECTIONS.find((x) => x.key === raw || x.names.includes(raw));
    if (!s) throw new Error(`不认识“${raw}”。能选的有：${SECTIONS.map((x) => x.names[0]).join("、")}`);
    if (!keys.includes(s.key)) keys.push(s.key);
  }
  return keys;
}

const arr = (x) => (Array.isArray(x) ? x : []);
const num = (x) => (typeof x === "number" && Number.isFinite(x) ? x : null);
const dayDiff = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5);

/** 工作台 today --json 里，这一块有没有东西可放。每个老板挑的模块不一样，没有的块默认不放，免得手机上一张空卡。 */
const HAS = {
  todos: (ov) => Boolean(ov.headline) || arr(ov.todos?.today).length + arr(ov.todos?.week).length > 0,
  events: (ov) => arr(ov.events).length + arr(ov.upcoming).length > 0,
  follow: (ov) => arr(ov.key_clients).length + arr(ov.follow?.due).length > 0,
  risks: (ov) => arr(ov.risks).some((p) => arr(p.risks).length > 0),
  xhs: (ov) => Boolean(ov.xhs) && arr(ov.xhs.posts).length + arr(ov.xhs.upcoming).length + arr(ov.xhs.topics).length > 0,
  biz: (ov) => arr(ov.sales?.channels).length + arr(ov.alerts).length > 0,
  cash: (ov) => Boolean(ov.cash),
};

/** 老板没点名放哪几块时：默认的五块里，只放今天真有内容的。返回 { keys, skipped }。 */
export function defaultSections(ov) {
  const keys = [];
  const skipped = [];
  for (const s of SECTIONS.filter((x) => x.on)) {
    if (HAS[s.key](ov ?? {})) keys.push(s.key);
    else skipped.push({ key: s.key, label: s.label, reason: ov && s.key in ov ? "今天没有内容" : "这个工作台没有这一块" });
  }
  return { keys, skipped };
}

/**
 * 从工作台 today --json（ov）和 clients --json（clients）做出打过码的快照。
 * 只挑白名单里的字段：备注、地点、联系人、电话、沟通原文一律不进快照。
 * lock：第 3 步定下的“有 / 无”口令锁，写进快照，打包时核对。
 * 返回 { snapshot, table, terms }：table、terms 是化名对照，只存在本机。
 */
export function buildSnapshot(ov, clients, { sections, amounts = false, style = "代号", extra = [], title = "手机看板", lock = null, now = new Date() } = {}) {
  if (!ov || typeof ov !== "object" || !ov.date) throw new Error("工作台的今日数据不对（缺 date）：要用工作台的 today --json。");
  if (!["代号", "首字"].includes(style)) throw new Error("--alias 只能是“代号”或“首字”。");
  if (lock != null && !["有", "无"].includes(lock)) throw new Error("--lock 只能写“有”或“无”。");
  const keys = sections ?? pickSections();
  if (keys.includes("cash") && !amounts) throw new Error("“钱”这一块全是金额：老板同意放金额才能导出（加 --amounts）。");
  const staff = arr(ov.sales?.channels).map((c) => c.owner).filter(Boolean);
  const m = buildMasker({ clients: arr(clients), staff, extra, style, amounts });
  const T = m.mask;
  const D = ov.date;
  const s = { format: FORMAT, title: String(title || "手机看板").slice(0, 40), data_date: D, generated_at: localStamp(now), rules: { sections: keys, alias: style, amounts, ...(lock ? { lock } : {}) } };

  if (keys.includes("todos")) {
    const todo = (t) => ({ title: T(t.title), due: t.due ?? null, status: t.status ?? null, priority: t.priority ?? null, client: m.who(t.client_id, t.client_name), overdue: t.due && t.due < D ? dayDiff(t.due, D) : 0 });
    s.headline = ov.headline ? { title: T(ov.headline.title), due: ov.headline.due ?? null } : null;
    s.todos = { today: arr(ov.todos?.today).map(todo), week: arr(ov.todos?.week).map(todo), open_total: num(ov.todos?.open) };
  }
  if (keys.includes("events")) {
    const ev = (e) => {
      const st = String(e.start ?? "");
      return { date: st.slice(0, 10), time: e.all_day || !st.includes("T") ? "全天" : st.slice(11, 16), end: String(e.end ?? "").includes("T") ? String(e.end).slice(11, 16) : null, title: T(e.title), kind: e.kind ?? null, client: m.who(e.client_id, e.client_name) };
    };
    s.events = { today: arr(ov.events).map(ev), upcoming: arr(ov.upcoming).map(ev) };
  }
  if (keys.includes("follow")) {
    const keyIds = new Set(arr(ov.key_clients).map((c) => c.id));
    s.follow = {
      key: arr(ov.key_clients).map((c) => ({ name: m.who(c.id, c.name), stage: c.stage ?? null, next_follow: c.next_follow ?? null, next_step: T(c.next_step), reasons: arr(c.reasons).slice(0, 3).map(T) })),
      due: arr(ov.follow?.due).filter((c) => !keyIds.has(c.id)).map((c) => ({ name: m.who(c.id, c.name), stage: c.stage ?? null, next_follow: c.next_follow ?? null, overdue: num(c.overdue) ?? 0 })),
    };
  }
  if (keys.includes("risks")) {
    s.risks = arr(ov.risks).map((p) => ({ name: T(p.name), client: m.who(p.client_id, p.client_name), items: arr(p.risks).map((r) => ({ level: r.level ?? null, text: T(r.text) })) }));
  }
  if (keys.includes("xhs")) {
    const x = ov.xhs ?? {};
    const post = (p) => ({ date: p.date ?? null, time: p.time ?? null, title: T(p.title), status: p.status ?? null });
    s.xhs = { posts: arr(x.posts).map(post), upcoming: arr(x.upcoming).map(post), topics: arr(x.topics).map((t) => ({ title: T(t.title) })), topics_total: num(x.topics_total) ?? arr(x.topics).length };
  }
  if (keys.includes("biz")) {
    const sa = ov.sales ?? {};
    const money = (o) => (amounts ? { gmv: num(o?.gmv), orders: num(o?.orders) } : {});
    s.biz = {
      date: sa.date ?? null,
      total: { vs_prev: num(sa.total?.vs_prev), ...money(sa.total) },
      channels: arr(sa.channels).map((c) => ({ name: T(c.name), vs_prev: num(c.vs_prev), refund_rate: num(c.refund_rate), roi: num(c.roi), ...money(c) })),
      alerts: arr(ov.alerts).map((a) => ({ level: a.level ?? null, title: T(a.title) })),
    };
  }
  if (keys.includes("cash")) {
    const c = ov.cash ?? {};
    s.cash = { unit: "万元", outstanding: num(c.outstanding), overdue_amount: num(c.overdue?.amount), overdue_count: num(c.overdue?.count), due_30: num(c.due_30) };
  }
  const count = (k) => m.table.filter((r) => r.kind === k).length;
  s.rules.masked = { clients: count("客户"), partners: count("合作方"), contacts: count("联系人"), staff: count("同事"), extra: count("补充") };
  return { snapshot: s, table: m.table, terms: m.terms };
}

/* ---------- 给老板看的“最该看的几处” ---------- */

// 小X、老X（X 是常见姓）、阿X：多半是同事、家人的叫法，自动打码认不全，列出来请老板看
const NICK_STOP = ["小红书", "小程序", "小黄车", "小龙虾", "小米", "小金罐", "小叶", "小白", "小方块", "小毛病", "小时", "小姐", "小哥", "小伙伴", "老白茶", "老顾客", "老方法", "老毛病", "老龙井", "老丛", "老枞", "老字号", "老规矩", "老黄历", "阿里", "阿姨", "阿胶", "阿拉", "阿根廷", "阿萨姆"];
const NICK_RE = new RegExp(`(?:[小老][${SURNAMES}]|阿[一-龥])`, "g");

/** 找出文字里“像人名的叫法”（小周、老何、阿芳），去重后按出现次数排。 */
export function suspectNames(text) {
  const seen = new Map();
  const s = String(text ?? "");
  for (const m of s.matchAll(NICK_RE)) {
    if (NICK_STOP.some((w) => s.startsWith(w, m.index))) continue;
    if (/^[小老阿]某/.test(m[0])) continue;
    seen.set(m[0], (seen.get(m[0]) ?? 0) + 1);
  }
  return [...seen.entries()].sort((a, b) => b[1] - a[1]).map(([w]) => w);
}

const ADDR_RE = /(?:路|街|大道|巷|弄)\s*\d|\d\s*(?:号楼|号院|栋|幢|单元|室)|小区|大厦|门牌/;
const BIGNUM_RE = /(?<![\d./:-])\d{3,}(?![\d./:-])|\d+\.\d+/;

/** 上传清单最上面那几处：疑似人名、还带数字的条目、像地址的条目。lines：会上传的每一行文字。 */
export function reviewHints(lines, { limit = 8 } = {}) {
  const all = lines.join("\n");
  const names = suspectNames(all);
  const numbers = lines.filter((l) => BIGNUM_RE.test(l.replace(/\d{4}-\d{2}-\d{2}|\d{1,2}:\d{2}/g, "")));
  const places = lines.filter((l) => ADDR_RE.test(l));
  return { names: names.slice(0, 20), numbers: numbers.slice(0, limit), numbers_total: numbers.length, places: places.slice(0, limit), places_total: places.length };
}

/* ---------- 上传前查漏（自检和打包共用） ---------- */

export const SCAN_PATTERNS = [
  ["手机号", /(?<!\d)1[3-9]\d[\s-]?\d{4}[\s-]?\d{4}(?!\d)/g, "error"],
  ["身份证号", /(?<![\dA-Za-z])\d{17}[\dXx](?![\dA-Za-z])/g, "error"],
  ["腾讯云密钥（SecretId）", /AKID[0-9A-Za-z]{13,40}/g, "error"],
  ["密钥字样（SecretKey）", /secret_?key\s*["':=]/gi, "error"],
  ["私钥", /-----BEGIN [A-Z ]*PRIVATE KEY-----/g, "error"],
  ["接口密钥（sk-…）", /\bsk-[A-Za-z0-9_-]{20,}/g, "error"],
  ["邮箱", /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+\.[A-Za-z]{2,}(?:\.[A-Za-z]{2,})?/g, "warn"],
  ["连本机接口的地址", /127\.0\.0\.1|localhost:\d+|["'`]\/api\//g, "warn"],
];
const uEsc = (s) => [...s].map((c) => (c.charCodeAt(0) > 127 ? `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}` : c)).join("");

/**
 * 查一段文字里有没有电话、证件号、密钥、对照表里的真名。
 * 返回 { problems, warnings }，每条是一句给人看的话；号码、密钥只露前 4 位。
 */
export function scanText(text, terms = []) {
  const problems = [];
  const warnings = [];
  const t = String(text ?? "");
  for (const [label, re, level] of SCAN_PATTERNS) {
    const hits = [...new Set(t.match(re) ?? [])];
    if (!hits.length) continue;
    const msg = `发现${label} ${hits.length} 处（例：${hits.slice(0, 2).map((h) => (level === "error" ? h.slice(0, 4) + "…" : h.slice(0, 24))).join("、")}）`;
    (level === "error" ? problems : warnings).push(msg);
  }
  const lower = t.toLowerCase();
  const leaked = terms.filter((x) => t.includes(x) || lower.includes(uEsc(x).toLowerCase())); // 打包工具可能把中文写成 衡 这样
  if (leaked.length) problems.push(`还有没打码的名字 ${leaked.length} 个（例：${leaked.slice(0, 3).map((x) => x[0] + "…").join("、")}）。重新导出快照时用 --extra-names 补上，或检查打包有没有用错数据`);
  return { problems, warnings };
}

/** 读对照表，取出要查的真名（两个字以上）。 */
export function loadTerms(file) {
  const t = readJson(file);
  return [...new Set((t.terms ?? t.aliases?.map((a) => a.original) ?? []).filter((x) => typeof x === "string" && x.length >= 2))];
}

/** 快照的指纹：打包时写进页面，自检时核对“页面是不是用这份快照打的”。 */
export const snapshotFingerprint = (s) => createHash("sha256").update(JSON.stringify(s)).digest("hex").slice(0, 16);

/* ---------- 口令锁 ---------- */

/** 用口令加密一段文字。浏览器里用 WebCrypto 的 PBKDF2 + AES-GCM 解开（见 build_page.mjs）。 */
export function encryptPayload(plaintext, passcode) {
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const key = pbkdf2Sync(String(passcode).normalize("NFC"), salt, PASS_ITER, 32, "sha256");
  const c = createCipheriv("aes-256-gcm", key, iv);
  const data = Buffer.concat([c.update(plaintext, "utf8"), c.final(), c.getAuthTag()]);
  return { v: 1, kdf: "PBKDF2-SHA256", iter: PASS_ITER, cipher: "AES-256-GCM", salt: salt.toString("base64"), iv: iv.toString("base64"), data: data.toString("base64") };
}

/** 检查口令：太短直接不收；纯数字给提醒。返回提醒文字（没有就是空）。 */
export function checkPasscode(p) {
  const s = String(p ?? "").trim();
  if (s.length < PASS_MIN) throw new Error(`口令太短：至少 ${PASS_MIN} 个字。建议用一句只有你们知道的短话，比如“周三下午喝白茶”，别用微信、银行卡密码。`);
  if (/^\d+$/.test(s) && s.length < 10) return "口令是纯数字，懂技术的人能很快试出来；建议换成一句短话。";
  return "";
}

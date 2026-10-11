#!/usr/bin/env node
// 装机检查：上线手机版之前，这台电脑准备好了没有。
// 只读、不联网、不登录：只看 Node 版本、Codex 配置里的 CloudBase 插件、npm 下载源、CloudBase 登录文件在不在。
// 不打印配置文件内容，不读登录文件里面的东西。全部就绪返回 0；有要处理的返回 1。
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { cli, checkNode } from "./lib.mjs";

const USAGE = `用法：
  node preflight.mjs [--json]

  查四件事（只读、不联网）：
  1. Node 版本：CloudBase 插件要 18.15 以上，工作台要 22.18 以上
  2. Codex 里装好、打开了 CloudBase 插件（cloudbase），没有误装 cloudbase-sites
  3. npm 下载源：插件每次启动都从 npm 下载最新版，国内网络慢时会超时
  4. 登录过 CloudBase 没有（只看登录文件在不在）`;

const { values: o } = cli({ json: { type: "boolean" } }, USAGE, { maxPositionals: 0 });
const items = [];
const add = (name, level, text, fix = "") => items.push({ name, level, text, fix }); // level: ok / todo / info

/* 1. Node */
const node = checkNode();
add(node.name, node.level, node.text, node.fix);

/* 2. Codex 配置 */
const codexHome = process.env.CODEX_HOME || join(homedir(), ".codex");
const cfgFile = join(codexHome, "config.toml");
function sections(text) {
  const out = new Map();
  let name = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    const h = line.match(/^\[(.+)\]$/);
    if (h) { name = h[1].trim(); out.set(name, {}); continue; }
    const kv = line.match(/^enabled\s*=\s*(true|false)/);
    if (name && kv) out.get(name).enabled = kv[1] === "true";
  }
  return out;
}
if (!existsSync(cfgFile)) {
  add("CloudBase 插件", "todo", "没找到 Codex 的配置文件：Codex 还没装好，或者还没打开过", "先装好 Codex 桌面版、登录一次，再按接入文档装插件");
} else {
  let secs;
  try { secs = sections(readFileSync(cfgFile, "utf8")); } catch { secs = new Map(); }
  const plugin = [...secs.entries()].find(([k]) => /^plugins\."cloudbase@[^"]+"$/.test(k));
  const sites = [...secs.entries()].find(([k]) => /^plugins\."cloudbase-sites@[^"]+"$/.test(k));
  const mcpOnly = secs.has("mcp_servers.cloudbase");
  if (plugin && plugin[1].enabled !== false) add("CloudBase 插件", "ok", `已装好、已打开（${plugin[0].replace(/^plugins\."|"$/g, "")}）`);
  else if (plugin) add("CloudBase 插件", "todo", "装了但被停用了", "Codex App 插件列表里把 cloudbase 打开，然后完全退出 Codex 再打开");
  else if (mcpOnly) add("CloudBase 插件", "ok", "没装插件，用的是“只接 MCP”的接法（mcp_servers.cloudbase）");
  else add("CloudBase 插件", "todo", "还没装 CloudBase 插件", "按接入文档 1.1 的六步装 cloudbase，装完完全退出 Codex 再打开");
  if (sites && sites[1].enabled !== false) add("cloudbase-sites", "todo", "装了 cloudbase-sites（测试版），它一开会话就自动起开发服务器，会和工作台冲突", "Codex App 插件列表里停用或卸载 cloudbase-sites");
}

/* 3. npm 下载源：只读配置文件，不运行 npm（npm 一跑就会往家目录写日志） */
function registry() {
  const fromEnv = process.env.npm_config_registry || process.env.NPM_CONFIG_REGISTRY;
  if (fromEnv) return fromEnv;
  const prefix = process.platform === "win32" ? dirname(process.execPath) : dirname(dirname(process.execPath));
  for (const f of [join(homedir(), ".npmrc"), join(prefix, "etc", "npmrc")]) {
    try {
      const m = readFileSync(f, "utf8").match(/^\s*registry\s*=\s*(\S+)/m);
      if (m) return m[1];
    } catch { /* 没有这个文件 */ }
  }
  return "https://registry.npmjs.org/（没改过，默认）";
}
const reg = registry();
if (/registry\.npmjs\.org/.test(reg)) add("npm 下载源", "info", `官方源 ${reg}：国内网络下载慢时，插件可能超时（-32001）或看不到工具`, "要换：终端运行 npm config set registry https://mirrors.cloud.tencent.com/npm/ （会改这台电脑所有 npm 的下载源），再重启 Codex");
else add("npm 下载源", "ok", reg);

/* 4. CloudBase 登录 */
const auth = join(homedir(), ".config", ".cloudbase", "auth.json");
if (existsSync(auth)) add("CloudBase 登录", "ok", "登录过（有登录文件；是不是还有效，要在 Codex 里用 auth(action=\"status\") 看）");
else add("CloudBase 登录", "info", "还没登录过", "装好插件后，在知识库项目里新开对话说“$boss-workbench 登录云开发”，按设备码登录（用 Chrome 或 Edge 打开授权页）");

const todo = items.filter((x) => x.level === "todo");
if (o.json) console.log(JSON.stringify({ ok: todo.length === 0, items }, null, 2));
else {
  const mark = { ok: "✓", todo: "✗", info: "·" };
  console.log("上线手机版前的装机检查（只读、不联网）：\n");
  for (const x of items) console.log(`  ${mark[x.level]} ${x.name}：${x.text}${x.fix ? `\n      怎么办：${x.fix}` : ""}`);
  console.log(todo.length ? `\n还有 ${todo.length} 项要处理，处理完再查一次。` : "\n都准备好了。");
}
process.exit(todo.length ? 1 : 0);

#!/usr/bin/env node
// 把手机版网址做成二维码（零依赖）。输出 .svg 或 .html（带网址和说明，电脑上打开给老板扫）。
// 编码：字节模式、纠错等级 M、版本 1—10（网址最长约 210 个字符），按标准挑掩码。
import { resolve, extname } from "node:path";
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { cli, die, writeTextAtomic, escapeHtml } from "./lib.mjs";

/* ---------- QR 编码 ---------- */
const ECC_M = [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26]; // 每块纠错码字数
const BLOCKS_M = [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5]; // 块数
const MAX_VER = 10;

function rawModules(v) {
  let r = (16 * v + 128) * v + 64;
  if (v >= 2) { const n = Math.floor(v / 7) + 2; r -= (25 * n - 10) * n - 55; if (v >= 7) r -= 36; }
  return r;
}
const dataCodewords = (v) => Math.floor(rawModules(v) / 8) - ECC_M[v] * BLOCKS_M[v];

function gfMul(x, y) {
  let z = 0;
  for (let i = 7; i >= 0; i--) { z = (z << 1) ^ ((z >>> 7) * 0x11d); z ^= ((y >>> i) & 1) * x; }
  return z & 0xff;
}
function rsDivisor(deg) {
  const r = new Array(deg).fill(0); r[deg - 1] = 1;
  let root = 1;
  for (let i = 0; i < deg; i++) {
    for (let j = 0; j < deg; j++) { r[j] = gfMul(r[j], root); if (j + 1 < deg) r[j] ^= r[j + 1]; }
    root = gfMul(root, 2);
  }
  return r;
}
function rsRemainder(data, div) {
  const r = div.map(() => 0);
  for (const b of data) { const f = b ^ r.shift(); r.push(0); div.forEach((c, i) => { r[i] ^= gfMul(c, f); }); }
  return r;
}

export function encode(text) {
  const bytes = [...Buffer.from(String(text), "utf8")];
  let ver = 1;
  for (; ver <= MAX_VER; ver++) if (4 + (ver < 10 ? 8 : 16) + bytes.length * 8 <= dataCodewords(ver) * 8) break;
  if (ver > MAX_VER) throw new Error(`网址太长了（${bytes.length} 个字节），二维码最多放约 210 个字符。去掉网址后面多余的参数再试。`);
  // 数据位
  const bits = [];
  const put = (val, len) => { for (let i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1); };
  put(4, 4); put(bytes.length, ver < 10 ? 8 : 16); bytes.forEach((b) => put(b, 8));
  const cap = dataCodewords(ver) * 8;
  put(0, Math.min(4, cap - bits.length));
  put(0, (8 - (bits.length % 8)) % 8);
  for (let pad = 0xec; bits.length < cap; pad ^= 0xec ^ 0x11) put(pad, 8);
  const data = [];
  for (let i = 0; i < bits.length; i += 8) data.push(parseInt(bits.slice(i, i + 8).join(""), 2));
  // 分块、加纠错码、交织
  const nBlocks = BLOCKS_M[ver], eccLen = ECC_M[ver], raw = Math.floor(rawModules(ver) / 8);
  const nShort = nBlocks - (raw % nBlocks), shortLen = Math.floor(raw / nBlocks);
  const div = rsDivisor(eccLen);
  const blocks = [];
  for (let i = 0, k = 0; i < nBlocks; i++) {
    const dat = data.slice(k, k + shortLen - eccLen + (i < nShort ? 0 : 1));
    k += dat.length;
    const ecc = rsRemainder(dat, div);
    if (i < nShort) dat.push(0);
    blocks.push(dat.concat(ecc));
  }
  const all = [];
  for (let i = 0; i < blocks[0].length; i++) blocks.forEach((b, j) => { if (i !== shortLen - eccLen || j >= nShort) all.push(b[i]); });
  return draw(ver, all);
}

function draw(ver, codewords) {
  const size = ver * 4 + 17;
  const m = Array.from({ length: size }, () => new Array(size).fill(false));
  const fn = Array.from({ length: size }, () => new Array(size).fill(false));
  const set = (x, y, dark) => { m[y][x] = dark; fn[y][x] = true; };
  for (let i = 0; i < size; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
  const finder = (cx, cy) => {
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
      const x = cx + dx, y = cy + dy, d = Math.max(Math.abs(dx), Math.abs(dy));
      if (x >= 0 && x < size && y >= 0 && y < size) set(x, y, d !== 2 && d !== 4);
    }
  };
  finder(3, 3); finder(size - 4, 3); finder(3, size - 4);
  if (ver > 1) {
    const n = Math.floor(ver / 7) + 2, step = Math.ceil((ver * 4 + 4) / (n * 2 - 2)) * 2;
    const pos = [6];
    for (let p = size - 7; pos.length < n; p -= step) pos.splice(1, 0, p);
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      if ((i === 0 && j === 0) || (i === 0 && j === n - 1) || (i === n - 1 && j === 0)) continue;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(pos[i] + dx, pos[j] + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    }
  }
  const format = (mask) => {
    const d = (0 << 3) | mask; // 纠错等级 M 的格式位是 00
    let r = d;
    for (let i = 0; i < 10; i++) r = (r << 1) ^ ((r >>> 9) * 0x537);
    const b = ((d << 10) | r) ^ 0x5412;
    const bit = (i) => ((b >>> i) & 1) === 1;
    for (let i = 0; i <= 5; i++) set(8, i, bit(i));
    set(8, 7, bit(6)); set(8, 8, bit(7)); set(7, 8, bit(8));
    for (let i = 9; i < 15; i++) set(14 - i, 8, bit(i));
    for (let i = 0; i < 8; i++) set(size - 1 - i, 8, bit(i));
    for (let i = 8; i < 15; i++) set(8, size - 15 + i, bit(i));
    set(8, size - 8, true);
  };
  format(0);
  if (ver >= 7) {
    let r = ver;
    for (let i = 0; i < 12; i++) r = (r << 1) ^ ((r >>> 11) * 0x1f25);
    const b = (ver << 12) | r;
    for (let i = 0; i < 18; i++) { const dark = ((b >>> i) & 1) === 1, a = size - 11 + (i % 3), c = Math.floor(i / 3); set(a, c, dark); set(c, a, dark); }
  }
  // 放数据
  let i = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let v = 0; v < size; v++) for (let j = 0; j < 2; j++) {
      const x = right - j, up = ((right + 1) & 2) === 0, y = up ? size - 1 - v : v;
      if (!fn[y][x] && i < codewords.length * 8) { m[y][x] = ((codewords[i >>> 3] >>> (7 - (i & 7))) & 1) === 1; i++; }
    }
  }
  const MASKS = [(x, y) => (x + y) % 2 === 0, (x, y) => y % 2 === 0, (x) => x % 3 === 0, (x, y) => (x + y) % 3 === 0,
    (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0, (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
    (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0, (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0];
  const apply = (k) => { for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (!fn[y][x] && MASKS[k](x, y)) m[y][x] = !m[y][x]; };
  let best = 0, min = Infinity;
  for (let k = 0; k < 8; k++) { apply(k); format(k); const p = penalty(m, size); if (p < min) { min = p; best = k; } apply(k); }
  apply(best); format(best);
  return { version: ver, size, modules: m };
}

function penalty(m, size) {
  let p = 0;
  const line = (get) => {
    for (let a = 0; a < size; a++) {
      let run = 1;
      for (let b = 1; b <= size; b++) {
        if (b < size && get(a, b) === get(a, b - 1)) run++;
        else { if (run >= 5) p += 3 + run - 5; run = 1; }
      }
      const s = Array.from({ length: size }, (_, b) => (get(a, b) ? "1" : "0")).join("");
      const padded = "0000" + s + "0000";
      for (const pat of ["10111010000", "00001011101"]) for (let k = padded.indexOf(pat); k !== -1; k = padded.indexOf(pat, k + 1)) p += 40;
    }
  };
  line((a, b) => m[a][b]);
  line((a, b) => m[b][a]);
  let dark = 0;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    if (m[y][x]) dark++;
    if (x < size - 1 && y < size - 1 && m[y][x] === m[y][x + 1] && m[y][x] === m[y + 1][x] && m[y][x] === m[y + 1][x + 1]) p += 3;
  }
  const total = size * size;
  p += (Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1) * 10;
  return p;
}

export function toSvg({ size, modules }, { border = 4, scale = 8 } = {}) {
  const dim = size + border * 2;
  let d = "";
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (modules[y][x]) d += `M${x + border} ${y + border}h1v1h-1z`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${dim} ${dim}" width="${dim * scale}" height="${dim * scale}" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
}

/* ---------- 命令行 ---------- */
const USAGE = `用法：
  node qrcode.mjs "<手机版网址>" --out "<文件>.html|.svg" [--title "手机看板"] [--note "第一次打开先点“确定访问”"]

  .html 带网址和说明，电脑浏览器打开给老板扫；.svg 只有二维码图`;

// 直接运行时才执行命令行部分（测试会 import encode）。比较真实路径，Skill 文件夹是链接、Windows 盘符大小写不同也认得出
const real = (p) => { try { return realpathSync(p).toLowerCase(); } catch { return resolve(p).toLowerCase(); } };
if (process.argv[1] && real(process.argv[1]) === real(fileURLToPath(import.meta.url))) {
  const { values: o, positionals } = cli({ out: { type: "string" }, title: { type: "string" }, note: { type: "string" } }, USAGE, { maxPositionals: 1 });
  const url = positionals[0];
  if (!url || !o.out) die(USAGE, 2);
  if (!/^https:\/\/[^\s]+$/.test(url)) die("网址要以 https:// 开头、中间没有空格（复制完整的手机版链接）。", 2);
  let qr;
  try { qr = encode(url); } catch (e) { die(e.message, 2); }
  const svg = toSvg(qr);
  const out = resolve(o.out);
  const note = o.note ?? "第一次打开会先看到腾讯云的“访问提示”页，点“确定访问”就能进去。";
  const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light dark"><title>${escapeHtml(o.title ?? "手机版二维码")}</title>
<style>:root{--bg:#f3f1ea;--ink:#1c211e;--muted:#646b65;--card:#fffdf8}@media (prefers-color-scheme:dark){:root{--bg:#121513;--ink:#ebeae4;--muted:#a6aca6;--card:#1b1f1d}}
*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;background:var(--bg);color:var(--ink);font:16px/1.6 -apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei","Noto Sans SC",sans-serif;padding:16px;box-sizing:border-box}
main{background:var(--card);border-radius:18px;padding:24px;max-width:420px;width:100%;text-align:center;box-shadow:0 10px 30px -18px rgba(0,0,0,.5)}
h1{font-size:20px;margin:0 0 4px}.qr svg{width:min(300px,80vw);height:auto;border-radius:8px}p{margin:8px 0;color:var(--muted);font-size:14px}
code{display:block;word-break:break-all;font-size:13px;background:var(--bg);border-radius:8px;padding:8px;margin-top:12px;color:var(--ink)}</style></head>
<body><main><h1>${escapeHtml(o.title ?? "手机版")}</h1><p>用手机自带的相机扫，在手机浏览器里打开（微信里打开还没实测过）</p><div class="qr">${svg}</div><p>${escapeHtml(note)}</p><code>${escapeHtml(url)}</code></main></body></html>\n`;
  writeTextAtomic(out, extname(out).toLowerCase() === ".svg" ? svg + "\n" : html);
  console.log(`已生成二维码：${out}（版本 ${qr.version}，${qr.size}×${qr.size}）`);
}

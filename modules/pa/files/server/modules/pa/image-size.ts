// 图片的宽高：只读文件开头 64KB，认 PNG、GIF、WebP、JPEG、SVG。认不出、读不了给 null。
// 给产出页的瀑布流用：先按宽高留好位置，图片加载时不跳。
import { closeSync, openSync, readSync } from 'node:fs'

export type Size = { width: number; height: number }

function head(file: string): Buffer | null {
  try {
    const fd = openSync(file, 'r')
    try { const b = Buffer.alloc(65536); return b.subarray(0, readSync(fd, b, 0, b.length, 0)) } finally { closeSync(fd) }
  } catch { return null }
}

function svgSize(text: string): Size | null {
  const tag = text.match(/<svg\b[^>]*>/i)?.[0]
  if (!tag) return null
  const attr = (k: string) => tag.match(new RegExp(`\\s${k}\\s*=\\s*["']([^"']+)["']`, 'i'))?.[1]
  const w = parseFloat(attr('width') ?? ''); const h = parseFloat(attr('height') ?? '')
  if (w > 0 && h > 0 && !/%/.test(attr('width') ?? '')) return { width: Math.round(w), height: Math.round(h) }
  const vb = (attr('viewBox') ?? '').split(/[\s,]+/).map(Number)
  return vb.length === 4 && vb[2] > 0 && vb[3] > 0 ? { width: Math.round(vb[2]), height: Math.round(vb[3]) } : null
}

function jpegSize(b: Buffer): Size | null {
  let i = 2
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) { i++; continue }
    const m = b[i + 1]
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { width: b.readUInt16BE(i + 7), height: b.readUInt16BE(i + 5) }
    i += 2 + b.readUInt16BE(i + 2)
  }
  return null
}

export function imageSize(file: string): Size | null {
  const b = head(file)
  if (!b) return null
  if (b.length > 24 && b.readUInt32BE(0) === 0x89504e47) return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) }
  if (b.length > 10 && b.toString('ascii', 0, 3) === 'GIF') return { width: b.readUInt16LE(6), height: b.readUInt16LE(8) }
  if (b.length > 30 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') {
    const kind = b.toString('ascii', 12, 16)
    if (kind === 'VP8X') return { width: 1 + b.readUIntLE(24, 3), height: 1 + b.readUIntLE(27, 3) }
    if (kind === 'VP8 ') return { width: b.readUInt16LE(26) & 0x3fff, height: b.readUInt16LE(28) & 0x3fff }
    if (kind === 'VP8L') { const bits = b.readUInt32LE(21); return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 } }
  }
  if (b.length > 4 && b[0] === 0xff && b[1] === 0xd8) return jpegSize(b)
  if (/<svg\b/i.test(b.toString('utf8', 0, Math.min(b.length, 4096)))) return svgSize(b.toString('utf8'))
  return null
}

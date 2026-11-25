// 对象文件（约定第 3 节）：开头几行固定信息 + 现在 / 下一步 / 往来记录 / 来源 四个小节。项目和“我关注的”各类对象都是这一种格式。
import { bullets, front, list, sections, str, unlink } from './text.ts'
import { typeDef } from './type-library.ts'
import type { KbObject } from './types.ts'

export const REQUIRED = ['类型', '名称', '状态', '更新', '确认', '隐私', '来源']
const KNOWN = new Set([...REQUIRED, 'aliases', '别名', '关联', '工作文件夹'])

/** 对象叫什么：<文件夹>/<名称>.md 取文件名；<文件夹>/<名称>/README.md 取文件夹名 */
export function objectNameFromPath(path: string): string {
  const parts = path.split('/')
  const file = parts[parts.length - 1].replace(/\.md$/i, '')
  return /^readme$/i.test(file) && parts.length > 1 ? parts[parts.length - 2] : file
}

/** 往来记录的一行：“日期｜渠道｜内容”；竖线全角半角都认；带“待确认”的标出来 */
function logLine(text: string): KbObject['log'][number] {
  const m = text.match(/^(\d{4}-\d{2}-\d{2})\s*[｜|]\s*([^｜|]*?)\s*[｜|]\s*([\s\S]*)$/)
  const pending = /待确认/.test(text)
  return m ? { date: m[1], channel: m[2], text: m[3].trim(), pending } : { date: '', channel: '', text, pending }
}

export function parseObject(md: string, path: string): KbObject {
  const { meta, body } = front(md)
  const sec = Object.fromEntries(sections(body).map((s) => [s.title, s.text]))
  const fields = Object.fromEntries(Object.entries(meta).filter(([k]) => !KNOWN.has(k)).map(([k, v]) => [k, Array.isArray(v) ? v.map(unlink).join('、') : unlink(v)]))
  const warnings: string[] = []
  if (meta['别名'] !== undefined) warnings.push('“别名”要改成 aliases（Obsidian 只认这个名字）')
  if (['aliases', '别名', '关联', '工作文件夹', '来源'].some((k) => typeof meta[k] === 'string' && /[、,，]/.test(meta[k] as string))) warnings.push('多个值要写成列表（每行一个“  - ”），不用顿号')
  if (list(meta['关联']).some((v) => !/^\[\[.+\]\]$/.test(v))) warnings.push('关联要写成带引号的双链，比如 "[[02-项目/春节茶礼]]"')
  const type = str(meta['类型'])
  if (type && !typeDef(type)) warnings.push(`类型“${type}”不在类型库里`)
  // 开头没写“类型”的，是老板自己的写法（按对照表登记进来的，升级检查承诺不用搬、不用改名；2026-11-26 A梦 实测）：
  // 不报缺字段、不报写法要改；“现在”“下一步”读不到就留空，页面上不显示那一块（约定 9.4）
  const own = !type
  return {
    type, name: str(meta['名称']) || objectNameFromPath(path), path,
    status: str(meta['状态']), updated: str(meta['更新']), confirm: str(meta['确认']), privacy: str(meta['隐私']),
    source: list(meta['来源']).map(unlink), aliases: list(meta['aliases'] ?? meta['别名']).map(unlink),
    links: list(meta['关联']).map(unlink).map((l) => l.replace(/\.md$/i, '')), workdirs: list(meta['工作文件夹']),
    fields,
    now: sec['现在'] ?? '',
    next: bullets(sec['下一步'] ?? '').map((l) => { const m = l.match(/^\[( |x|X)\]\s*(.*)$/); return m ? { text: m[2], done: m[1] !== ' ' } : { text: l, done: false } }),
    log: bullets(sec['往来记录'] ?? '').map(logLine),
    sources: bullets(sec['来源'] ?? '').map(unlink),
    missing: own ? [] : REQUIRED.filter((k) => !str(meta[k])),
    warnings: own ? [] : warnings,
    own,
  }
}

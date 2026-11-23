// 对象文件（约定第 3 节）：开头几行固定信息 + 现在 / 下一步 / 往来记录 / 来源 四个小节。项目和“我关注的”各类对象都是这一种格式。
import { bullets, front, sections, splitList } from './text.ts'
import type { KbObject } from './types.ts'

export const REQUIRED = ['类型', '名称', '状态', '更新', '确认', '隐私', '来源']
const KNOWN = new Set([...REQUIRED, '别名', '关联', '工作文件夹'])

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
  const fields = Object.fromEntries(Object.entries(meta).filter(([k]) => !KNOWN.has(k)))
  return {
    type: meta['类型'] ?? '', name: meta['名称'] || objectNameFromPath(path), path,
    status: meta['状态'] ?? '', updated: meta['更新'] ?? '', confirm: meta['确认'] ?? '', privacy: meta['隐私'] ?? '',
    source: splitList(meta['来源']), aliases: splitList(meta['别名']), links: splitList(meta['关联']).map((l) => l.replace(/\.md$/i, '')), workdirs: splitList(meta['工作文件夹']),
    fields,
    now: sec['现在'] ?? '',
    next: bullets(sec['下一步'] ?? '').map((l) => { const m = l.match(/^\[( |x|X)\]\s*(.*)$/); return m ? { text: m[2], done: m[1] !== ' ' } : { text: l, done: false } }),
    log: bullets(sec['往来记录'] ?? '').map(logLine),
    sources: bullets(sec['来源'] ?? ''),
    missing: REQUIRED.filter((k) => !meta[k]),
  }
}

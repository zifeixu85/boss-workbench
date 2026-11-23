// 把一个对话归到知识库里的某个对象上（约定第 4 节），按顺序认，认到就停：
// 1. 对话所在的文件夹等于某个对象“工作文件夹”写的路径，或在它里面（几个都对得上时取最具体的那个）；
// 2. 标题或第一句里出现了某个对象的名称或别名（只认一个；出现两个以上就不猜）；
// 3. 都没有：未归类（页面上可以手动指）。
import { resolve, sep } from 'node:path'

export type MatchTarget = { path: string; name: string; aliases: string[]; workdirs: string[] }
export type Match = { path: string; by: '文件夹' | '名字' } | null

/** 比名字时不管空格、标点、全角半角和大小写（“航海家 AI 经典课”和“航海家AI经典课”算同一个） */
export const norm = (v: string) => v.normalize('NFKC').toLowerCase().replace(/[\s\p{P}\p{S}]/gu, '')

const expand = (p: string, home: string) => resolve(p.startsWith('~') ? home + p.slice(1) : p)

export function matchObject(s: { cwd: string; title: string; first: string }, objects: MatchTarget[], home: string): Match {
  if (s.cwd) {
    const cwd = resolve(s.cwd)
    let best: { path: string; len: number } | null = null
    for (const o of objects) for (const w of o.workdirs) {
      const dir = expand(w, home)
      if ((cwd === dir || cwd.startsWith(dir.endsWith(sep) ? dir : dir + sep)) && (!best || dir.length > best.len)) best = { path: o.path, len: dir.length }
    }
    if (best) return { path: best.path, by: '文件夹' }
  }
  const text = norm(`${s.title}\n${s.first}`)
  const hits = objects.filter((o) => [o.name, ...o.aliases].map(norm).some((n) => n.length >= 2 && text.includes(n)))
  return hits.length === 1 ? { path: hits[0].path, by: '名字' } : null
}

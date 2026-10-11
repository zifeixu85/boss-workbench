// Codex 写回来的文字，显示和写入前规整一次（第二轮修 #20、#25）：中文和数字、英文之间加空格（“约350份”→“约 350 份”），
// 长日期写成“1月10日”（跨年带年份）。Codex 返回的原文照存在提取记录里不动；引用的原话（quote）不改。归属：大客户模块。

const CJK = '\\u4e00-\\u9fff'
/** 数字后面紧跟这些字不加空格：10月26日、9点、3分 */
const UNIT_AFTER = '年月日点时分秒'
/** 这些字后面紧跟数字不加空格：2027年1月、月10日 */
const UNIT_BEFORE = '年月'

/** 2027-01-10 → 2027年1月10日；今年的 2026-11-10 → 11月10日 */
export function cnDate(iso: string, year: string) {
  const [y, m, d] = iso.split('-')
  return `${y === year ? '' : `${y}年`}${Number(m)}月${Number(d)}日`
}

export function tidy(text: string, year: string): string {
  if (!text) return text
  return text
    .replace(/(\d{4})-(\d{2})-(\d{2})/g, (_, y: string, m: string, d: string) => cnDate(`${y}-${m}-${d}`, year))
    .replace(new RegExp(`([${CJK}])([0-9A-Za-z])`, 'g'), (all, a: string, b: string) => (/[0-9]/.test(b) && UNIT_BEFORE.includes(a) ? all : `${a} ${b}`))
    .replace(new RegExp(`([0-9A-Za-z%])([${CJK}])`, 'g'), (all, a: string, b: string) => (/[0-9]/.test(a) && UNIT_AFTER.includes(b) ? all : `${a} ${b}`))
    .replace(/ {2,}/g, ' ')
}

/** 去掉标点和空格，比两句话是不是一回事用 */
export const plain = (s: string) => s.replace(/[\s，。；、“”‘’（）()：:,.;!！?？…—-]/g, '')

/** 两句话像不像（按相邻两个字算重合度，0—1） */
export function similar(a: string, b: string) {
  const grams = (s: string) => { const x = plain(s).replace(/\d/g, ''); return new Set(Array.from({ length: Math.max(0, x.length - 1) }, (_, i) => x.slice(i, i + 2))) }
  const A = grams(a)
  const B = grams(b)
  if (!A.size || !B.size) return 0
  let n = 0
  for (const g of A) if (B.has(g)) n++
  return n / Math.min(A.size, B.size)
}

/** 两条喜好说的是不是一件事：同一类，短句（12 个字以内）重合 0.4 就算，长句要 0.6（第三轮：“合伙人送客户”不再记两遍） */
export function sameTrait(a: { kind: string; text: string }, b: { kind: string; text: string }) {
  if (a.kind !== b.kind) return false
  const short = plain(a.text).length <= 12 && plain(b.text).length <= 12
  return similar(a.text, b.text) >= (short ? 0.4 : 0.6)
}

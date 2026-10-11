// 小红书发布前检查的规则引擎（前后端共用；归属：小红书内容模块 E3，2026-10-10 加）。
// 词表由服务端从知识库和工作台现读（server/modules/content/checks.ts），这里只管“怎么查”：
// 网页边改边查（不用每次请求服务端），服务端存版本、打开单篇时也用同一份。

export type CheckDraft = { title: string; titles: string[]; cover_text: string; pages: { text: string }[]; body: string; tags: string[] }
/** 一条词：level 是默认级别；blockIn 写了的话，出现在这几处算“要改”，别处算“提醒”；replace 用来给话题出替换建议 */
export type CheckRule = {
  word: string; category: string; level: 'warn' | 'block'; suggest?: string; until?: string; pattern?: string
  blockIn?: Place[]; replace?: string; relative?: boolean
}
export type Place = '标题' | '封面' | '图片' | '正文' | '话题'
export type CheckHit = { word: string; where: string; category: string; suggest?: string; level?: 'warn' | 'block' }
export type CheckItem = { key: string; label: string; level: 'ok' | 'warn' | 'block'; detail: string; hits?: CheckHit[] }
export type CheckSource = { label: string; path?: string; count: number; note?: string }
export type CheckResult = { items: CheckItem[]; blocks: number; warns: number; sources: CheckSource[]; on: string }

/** 字数：中文一个字算 1，英文字母和数字也算 1，空白不算（近似小红书后台） */
export const charCount = (s: string) => Array.from(s.replace(/[\s｜|]/g, '')).length

const AI_TONE: [RegExp, string][] = [
  [/不是[^。！？\n]{1,24}而是/, '不是……而是……'], [/总而言之|综上所述|总的来说/, '总而言之'], [/赋能/, '赋能'],
  [/值得一提的是/, '值得一提的是'], [/在这个快节奏的(时代|生活)/, '在这个快节奏的时代'], [/不仅[^。！？\n]{1,20}更/, '不仅……更……'],
  [/让我们一起/, '让我们一起'], [/(首先|第一)[，,][\s\S]{2,40}(其次|第二)[，,][\s\S]{2,40}(最后|第三)[，,]/, '首先……其次……最后'],
]
const BACKEND: [RegExp, string][] = [
  [/[\w一-龥-]+\/[\w一-龥-]+\.md|\.md\b/, '文件路径'], [/知识库/, '知识库'], [/skill/i, 'Skill'], [/工作台/, '工作台'],
  [/(?<![A-Za-z])AI(?![A-Za-z])/, 'AI'], [/codex/i, 'Codex'], [/\[K-\d+\]|参考了[:：]/, '出处编号'],
]

type Part = { where: string; place: Place; text: string }
function parts(d: CheckDraft): Part[] {
  const out: Part[] = [
    { where: '标题', place: '标题', text: d.title },
    ...d.titles.filter((t) => t !== d.title).map((t) => ({ where: '备选标题', place: '标题' as Place, text: t })),
    { where: '封面大字', place: '封面', text: d.cover_text },
    ...d.pages.map((p, i) => ({ where: i === 0 ? '封面页' : `第 ${i + 1} 张图`, place: (i === 0 ? '封面' : '图片') as Place, text: p.text })),
    { where: '正文', place: '正文', text: d.body },
    { where: '话题', place: '话题', text: d.tags.join(' ') },
  ]
  return out.filter((p) => p.text)
}

const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`
const day = (s: string) => new Date(`${s}T00:00:00`)
const WEEK = '日一二三四五六'

/** 上线日的各种写法：11/5、11月5日、11.5、11-05；按打算发的那天，再加“明天 / 后天 / 下周四”这类 */
export function datePattern(until: string, on: string) {
  const m = Number(until.slice(5, 7)), dd = Number(until.slice(8, 10))
  const words = [`(?<!\\d)${m}\\s*(?:/|／|月|\\.|-)\\s*0?${dd}(?:\\s*[日号])?(?!\\d)`]
  const gap = Math.round((day(until).getTime() - day(on).getTime()) / 864e5)
  if (gap === 1) words.push('明天上线|明天见')
  if (gap === 2) words.push('后天')
  if (gap > 0 && gap <= 13) {
    const wd = WEEK[day(until).getDay()]
    const monday = (s: string) => { const x = day(s); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x.getTime() }
    const weeks = Math.round((monday(until) - monday(on)) / (7 * 864e5))
    if (weeks === 0) words.push(`(?:这|本)(?:周|星期|礼拜)${wd}`)
    if (weeks === 1) words.push(`下(?:周|星期|礼拜)${wd}`)
    words.push(`${gap}\\s*天后`)
  }
  return words.join('|')
}

/** 查一篇稿子。on：打算哪天发（没排期按今天）；新品上线那天起可以说名字和日子 */
export function runChecks(d: CheckDraft, rules: CheckRule[], sources: CheckSource[], on: string): CheckResult {
  const ps = parts(d)
  const items: CheckItem[] = []
  const t = charCount(d.title), b = charCount(d.body), n = d.tags.length, pages = d.pages.length, ct = charCount(d.cover_text)

  items.push({ key: 'title', label: `标题 ${t}/20 字`, level: !t || t > 20 ? 'block' : 'ok', detail: !t ? '还没有标题' : t > 20 ? `多了 ${t - 20} 个字，小红书会截断` : '长度合适' })
  items.push({ key: 'body', label: `正文 ${b}/1000 字`, level: !b || b > 1000 ? 'block' : b < 120 ? 'warn' : 'ok', detail: !b ? '还没有正文' : b > 1000 ? '超过 1000 字发不出去' : b < 120 ? '有点短，读完记不住做法' : '长度合适' })
  items.push({ key: 'tags', label: `话题 ${n} 个`, level: n < 5 || n > 10 ? 'warn' : 'ok', detail: n < 5 ? '建议 5—8 个：品类词 + 场景词 + 人群词' : n > 10 ? '太多会显得杂，留 5—8 个' : '数量合适' })
  items.push({ key: 'cover', label: ct ? `封面大字 ${ct}/12 字` : '还没有封面大字', level: !ct ? 'block' : ct > 12 ? 'warn' : 'ok', detail: !ct ? '去“封面”写一句大字' : ct > 12 ? '大字有点长，手机上一眼看不完，压到 12 字以内' : '一眼看得完' })
  items.push({ key: 'pages', label: `图片 ${pages} 张`, level: pages === 0 ? 'block' : pages < 3 || pages > 9 ? 'warn' : 'ok', detail: pages < 3 ? '图文建议 3—6 张：封面一句大字，内页一页一个要点' : pages > 9 ? '超过 9 张，后面的很少有人翻到' : '封面 + 内页' })

  const hitsBy = (cat: (r: CheckRule) => boolean) => {
    const hits: (CheckHit & { level: 'warn' | 'block' })[] = []
    for (const r of rules.filter(cat)) {
      if (r.until && on >= r.until) continue
      const src = r.relative && r.until ? datePattern(r.until, on) : r.pattern
      const re = src ? new RegExp(src) : null
      for (const p of ps) {
        if (!(re ? re.test(p.text) : p.text.includes(r.word))) continue
        const level = r.blockIn ? (r.blockIn.includes(p.place) ? 'block' : 'warn') : r.level
        if (hits.some((h) => h.where === p.where && h.word !== r.word && h.word.includes(r.word))) continue // 全名已经报过，简称不重复
        let suggest = r.suggest
        if (p.place === '话题') {
          const tags = d.tags.filter((x) => (re ? re.test(x) : x.includes(r.word)))
          if (tags.length && r.replace != null) suggest = `把 ${tags.map((x) => `#${x}`).join('、')} 换成 ${tags.map((x) => `#${x.replace(r.word, r.replace!)}`).join('、')}`
        }
        hits.push({ word: r.word, where: p.where, category: r.category, suggest, level })
      }
    }
    return hits
  }
  const summarize = (key: string, label: string, okText: string, hits: (CheckHit & { level: 'warn' | 'block' })[]) => {
    const level = hits.some((h) => h.level === 'block') ? 'block' : hits.length ? 'warn' : 'ok'
    const words = [...new Set(hits.map((h) => `“${h.word}”`))].join('、')
    items.push({ key, label, level, detail: level === 'ok' ? okText : `${words} 出现在${[...new Set(hits.map((h) => h.where))].join('、')}`, hits })
  }
  summarize('voice', '不能说的话', '没有功效词、极限词，没贬低别家', hitsBy((r) => !['企业客户名字', '新品名字', '新品上线日'].includes(r.category)))
  summarize('client', '客户名字', '没有提到任何一家企业客户', hitsBy((r) => r.category === '企业客户名字'))

  const launchRules = rules.filter((r) => r.category === '新品名字' || r.category === '新品上线日')
  const open = launchRules.length > 0 && launchRules.every((r) => r.until && on >= r.until)
  const names = [...new Set(launchRules.filter((r) => r.category === '新品名字').map((r) => r.word))].join('、')
  const dates = [...new Set(launchRules.filter((r) => r.category === '新品上线日').map((r) => r.word))].join('、')
  summarize('launch', '新品名字和上线日', open ? `${md(on)} 已到上线日，可以说名字` : launchRules.length ? `标题、封面、图片、正文、话题里都没有：${names}${dates ? `；上线日 ${dates}` : ''}` : '清单里没有待上线的新品',
    hitsBy((r) => r.category === '新品名字' || r.category === '新品上线日'))

  const tone: CheckHit[] = []
  for (const p of ps) for (const [re, word] of AI_TONE) if (re.test(p.text)) tone.push({ word, where: p.where, category: 'AI 腔' })
  items.push({ key: 'tone', label: 'AI 腔', level: tone.length ? 'warn' : 'ok', detail: tone.length ? `${[...new Set(tone.map((h) => `“${h.word}”`))].join('、')}：换成同事聊天的说法` : '没有模板化句式', hits: tone })

  const back: CheckHit[] = []
  for (const p of ps) for (const [re, word] of BACKEND) if (re.test(p.text)) back.push({ word, where: p.where, category: '内部用词' })
  const todo = ps.filter((p) => /【待补/.test(p.text)).map((p) => ({ word: '【待补】', where: p.where, category: '还没补完' }))
  items.push({ key: 'backend', label: '内部用词', level: back.length ? 'block' : todo.length ? 'warn' : 'ok', detail: back.length ? `${[...new Set(back.map((h) => h.word))].join('、')}：发出去的稿子里不出现这些` : todo.length ? `还有 ${todo.length} 处【待补】没填` : '没有文件路径、编号、“AI”“工作台”这类内部用词', hits: [...back, ...todo] })

  return { items, blocks: items.filter((i) => i.level === 'block').length, warns: items.filter((i) => i.level === 'warn').length, sources, on }
}

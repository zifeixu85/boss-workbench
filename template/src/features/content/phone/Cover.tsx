// 封面和图片页：用模板实时画（大字 + 茶具垫图 + 品牌色，3:4），稿件一改就跟着变，不依赖生图。归属：小红书内容模块。
// 四个模板对应素材库：a_cover1 大字 + 实拍、a_cover2 三宫格步骤、a_cover3 左右对比、a_cover4 一周茶单日历。
// 同一张垫图在不同篇里换裁切位置和左右方向（按标题算，固定不变），内页按每页说的东西换垫图，不会一排缩略图都一个样。
// 同行的笔记（对标收藏）不套自家模板：中性底色、写对方账号名，没有 ABC茶社 的角标。
import type { CSSProperties, ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { Pad } from './pads'
import type { Cover as CoverT, PageLite } from '../types'
import './phone.css'

export const TEMPLATE_NAMES: Record<string, string> = { a_cover1: '大字 + 实拍', a_cover2: '三宫格步骤', a_cover3: '左右对比', a_cover4: '一周茶单' }
export const TONE_NAMES = ['米白', '茶绿', '暖棕', '雾蓝'] as const
const PADS = ['a_pad1', 'a_pad2', 'a_pad3', 'a_pad4', 'a_pad5'] as const
const TEA_COLOR: [RegExp, string][] = [
  [/银针/, '#EFE4B4'], [/白牡丹/, '#E6D296'], [/寿眉/, '#C99E58'], [/玫瑰/, '#E5A1A4'], [/桂花/, '#E8B44C'], [/水仙/, '#C27A35'], [/肉桂/, '#8F4B1D'], [/大红袍|岩茶/, '#7A3A16'], [/花草/, '#D99AB0'], [/白茶/, '#E2CB8C'],
]
const teaColor = (s: string) => TEA_COLOR.find(([re]) => re.test(s))?.[1] ?? '#C9A15C'
const lines = (s: string) => s.split(/[｜|\n]/).map((x) => x.trim()).filter(Boolean)

/** 固定的“随机”：同一段字每次算出来一样 */
function hash(s: string) {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) }
  return h >>> 0
}
const frac = (h: number, k: number) => ((h >>> (k * 4)) & 0xff) / 255

/** 垫图的裁切：放大一点、挪一挪、有的左右翻过来 */
function crop(seed: string): CSSProperties {
  const h = hash(seed)
  const s = 1.06 + frac(h, 0) * 0.32
  const x = (frac(h, 1) - 0.5) * 12, y = (frac(h, 2) - 0.5) * 8
  return { transform: `scale(${frac(h, 3) > 0.55 ? -s : s}, ${s}) translate(${x}%, ${y}%)`, transformOrigin: '50% 60%' }
}

/** 内页配哪张垫图：先看这页说的东西，再按页码轮着换 */
export function padFor(text: string, coverPad: string, index: number) {
  if (/公道杯|玻璃/.test(text)) return 'a_pad2'
  if (/保温杯|焖|加班|寿眉饼|夜/.test(text)) return 'a_pad3'
  if (/开会|会议|岩茶|肉桂|水仙/.test(text)) return 'a_pad4'
  if (/煮|炉|壶|冬天|降温/.test(text)) return 'a_pad5'
  if (/盖碗|工位|茶盘|白牡丹/.test(text)) return 'a_pad1'
  const at = Math.max(0, PADS.indexOf(coverPad as (typeof PADS)[number]))
  return PADS[(at + index) % PADS.length]
}

function Mark() {
  return (
    <span className="xc-mark">
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M3 6h8v3.5A3.5 3.5 0 0 1 7.5 13h-1A3.5 3.5 0 0 1 3 9.5z" /><path d="M11 7h1.2a1.6 1.6 0 0 1 0 3.2H11" /><path d="M6 2.5c-.6.8.6 1.2 0 2M8.5 2.5c-.6.8.6 1.2 0 2" /></svg>
      ABC茶社
    </span>
  )
}

function Frame({ cover, children, className, label }: { cover: CoverT; children: ReactNode; className?: string; label: string }) {
  return <div className={cn('xc', className)} data-tone={cover.tone} role="img" aria-label={label}>{children}</div>
}

function Title({ ls }: { ls: string[] }) {
  const long = ls.join('').length > 11
  return <div className={cn('xc-title', long && 'xc-long')}>{ls[0]}{ls[1] && <><br /><span className="l2">{ls.slice(1).join(' ')}</span></>}</div>
}

/** 同行笔记的封面：中性底色（按账号固定一种）、大字、对方账号名；不用自家垫图和角标 */
const PEER = [
  { bg: '#f3e9df', ink: '#3b2a20', acc: '#c8643b' }, { bg: '#e5edf1', ink: '#1d2b36', acc: '#3a7ca5' }, { bg: '#eee8f3', ink: '#2d2238', acc: '#8a5bb0' },
  { bg: '#e8efe2', ink: '#21301f', acc: '#5f8b3a' }, { bg: '#f4efe0', ink: '#2e2a1d', acc: '#b08a2e' },
]
function PeerCover({ text, account, className }: { text: string; account: string; className?: string }) {
  const h = hash(account)
  const c = PEER[h % PEER.length]
  const ls = lines(text || account)
  return (
    <div className={cn('xc xc-peer', className)} style={{ '--p-bg': c.bg, '--p-ink': c.ink, '--p-acc': c.acc } as CSSProperties} role="img" aria-label={`同行笔记封面：${ls.join(' ')}`}>
      <span className="xc-peer-blob" style={{ left: `${30 + frac(h, 1) * 40}%` }} />
      <span className="xc-peer-dots" />
      <div className="xc-peer-title">{ls[0]}{ls[1] && <span className="l2">{ls.slice(1).join(' ')}</span>}</div>
      <div className="xc-peer-by">@{account}</div>
    </div>
  )
}

/** 封面（第 1 张图）。peer：这是同行的笔记（写对方账号名）；seed：裁切按它算，默认按大字 */
export function CoverArt({ text, cover, pages = [], kicker, className, peer, seed }: {
  text: string; cover: CoverT | null; pages?: PageLite[]; kicker?: string; className?: string; peer?: string; seed?: string
}) {
  if (peer || !cover) return <PeerCover text={text} account={peer ?? '同行'} className={className} />
  const ls = lines(text || '还没有封面大字')
  const key = seed ?? text
  const inner = pages.slice(1)
  if (cover.template === 'a_cover2') {
    const steps = [0, 1, 2].map((i) => lines(inner[i]?.text ?? '')[0] ?? ['放茶', '注水', '出汤'][i])
    return (
      <Frame cover={cover} className={className} label={`封面：${ls.join(' ')}`}>
        <div className="xc-kicker">{kicker ?? '跟着做'}</div><Title ls={ls} />
        <div className="xc-steps">
          {steps.map((s, i) => (
            <div key={i} className="xc-step">
              <div className="xc-step-pic"><Pad pad={inner[i] ? padFor(inner[i].text, cover.pad, i) : cover.pad} align={(['xMin', 'xMid', 'xMax'] as const)[i]} /><span className="xc-step-no">{i + 1}</span></div>
              <div className="xc-step-cap">{s.replace(/【待补[^】]*】/, '（待补）')}</div>
            </div>
          ))}
        </div>
        <Mark />
      </Frame>
    )
  }
  if (cover.template === 'a_cover3') {
    const bad = lines(inner[0]?.text ?? '')[0] ?? '这样泡会苦'
    const good = lines(inner[1]?.text ?? '')[0] ?? '这样不苦'
    return (
      <Frame cover={cover} className={className} label={`封面：${ls.join(' ')}`}>
        <div className="xc-kicker">{kicker ?? '对比一下'}</div><Title ls={ls} />
        <div className="xc-vs">
          <div className="bad"><Pad pad={cover.pad} align="xMin" /><div className="lab">✕ {bad}</div></div>
          <div><Pad pad={cover.pad} align="xMax" /><div className="lab">✓ {good}</div></div>
        </div>
        <Mark />
      </Frame>
    )
  }
  if (cover.template === 'a_cover4') {
    // 五格从内页来；内页里取不到“周一 …”这种，就只画大字，不编一份默认茶单
    const days = inner.flatMap((p) => lines(p.text)).filter((t) => /^周[一二三四五六日]\s*\S/.test(t)).slice(0, 5)
    const cells = days.map((d) => { const m = d.match(/^(周.)\s*(.*)$/)!; return { w: m[1], t: m[2].split(/[：:｜\s]/)[0] || '—' } })
    return (
      <Frame cover={cover} className={className} label={`封面：${ls.join(' ')}`}>
        <div className="xc-kicker">{kicker ?? '一周喝茶搭配'}</div><Title ls={ls} />
        {cells.length ? (
          <div className="xc-week">
            {cells.map((c, i) => (
              <div key={`${c.w}-${i}`} className="xc-day"><span className="dot" style={{ background: teaColor(c.t) }} /><div><div className="d">{c.w}</div><div className="t">{c.t}</div></div></div>
            ))}
            <div className="xc-day brand">存下来照着喝</div>
          </div>
        ) : <div className="xc-pad xc-pad-card"><Pad pad={cover.pad} /></div>}
      </Frame>
    )
  }
  return (
    <Frame cover={cover} className={className} label={`封面：${ls.join(' ')}`}>
      <div className="xc-pad"><div className="xc-crop" style={crop(key)}><Pad pad={cover.pad} /></div></div>
      <div className="xc-fade" />
      <div className="xc-kicker">{kicker ?? 'ABC茶社'}</div><Title ls={ls} />
      <Mark />
    </Frame>
  )
}

/** 内页：一页一个要点（第一行大字，后面小字），右下角垫图（按这页说的东西挑） */
export function PageArt({ page, index, total, cover, className }: { page: PageLite; index: number; total: number; cover: CoverT; className?: string }) {
  const [a, ...rest] = lines(page.text)
  const todo = /【待补/.test(page.text)
  const pad = page.pad ?? padFor(page.text, cover.pad, index)
  return (
    <Frame cover={cover} className={className} label={`第 ${index + 1} 张图：${page.text}`}>
      <div className="xc-page-no">{String(index + 1).padStart(2, '0')} / {String(total).padStart(2, '0')}</div>
      {todo ? <div className="xc-todo">{page.text.replace(/[【】]/g, '')}<br />拍好换上</div> : (
        <>
          <div className="xc-page-text"><div className="a">{a}</div>{rest.length > 0 && <div className="b">{rest.join('\n')}</div>}</div>
          <div className="xc-page-pad"><div className="xc-crop" style={crop(`${page.text}${index}`)}><Pad pad={pad} /></div></div>
        </>
      )}
    </Frame>
  )
}

/** 一篇的全部图片：封面 + 内页 */
export function slidesOf(d: { cover_text: string; cover: CoverT; pages: PageLite[]; title?: string }, kicker?: string) {
  const total = Math.max(d.pages.length, 1)
  return [
    <CoverArt key="c" text={d.cover_text} cover={d.cover} pages={d.pages} kicker={kicker} seed={d.title} />,
    ...d.pages.slice(1).map((p, i) => <PageArt key={i} page={p} index={i + 1} total={total} cover={d.cover} />),
  ]
}

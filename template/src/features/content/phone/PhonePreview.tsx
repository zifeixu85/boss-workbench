// 单篇手机预览：照小红书的样子排——发现页（双列，这篇红框，旁边是自己最近的笔记和对标收藏）、图文笔记页（3:4 图片轮播、标题、正文、话题）。
// 创作页“预览”、单篇抽屉、今天页的缩略版都用它。归属：小红书内容模块。
import { useState } from 'react'
import { useApi } from '@/lib/api'
import { cn } from '@/lib/utils'
import { CoverArt, slidesOf } from './Cover'
import type { Comment, Cover, DraftPage, Feed, FeedItem } from '../types'
import './phone.css'

export type PhoneDraft = { title: string; body: string; tags: string[]; cover_text: string; cover: Cover; pages: DraftPage[] }
export type PhoneStats = { likes: number | null; saves: number | null; comments: number | null; date: string } | null
export type PhoneView = '发现页' | '笔记页'

/** 小红书的数：一万以上写“1.2万” */
export const xhsNum = (n: number | null | undefined) => (n == null ? '' : n >= 10000 ? `${(n / 10000).toFixed(1).replace(/\.0$/, '')}万` : String(n))

function Heart({ filled }: { filled?: boolean }) {
  return <svg viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2"><path d="M12 20s-7-4.4-9.2-8.6C1.2 8.2 3 4.8 6.4 4.5c2-.2 3.9 1 5.6 3 1.7-2 3.6-3.2 5.6-3 3.4.3 5.2 3.7 3.6 6.9C19 15.6 12 20 12 20z" /></svg>
}
function Star() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z" strokeLinejoin="round" /></svg>
}
function Bubble() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 12a8 7 0 1 1 3.4 5.8L4 19l1-3.2A6.8 6.8 0 0 1 4 12z" strokeLinejoin="round" /></svg>
}

function StatusBar() {
  return (
    <div className="xp-status">
      <span>9:41</span>
      <span className="flex items-center gap-1">
        <svg viewBox="0 0 18 12" fill="currentColor"><rect x="0" y="8" width="3" height="4" rx="1" /><rect x="5" y="5" width="3" height="7" rx="1" /><rect x="10" y="2.5" width="3" height="9.5" rx="1" /><rect x="15" y="0" width="3" height="12" rx="1" /></svg>
        <svg viewBox="0 0 26 12" fill="none" stroke="currentColor"><rect x="0.5" y="0.5" width="22" height="11" rx="3" opacity=".5" /><rect x="2" y="2" width="16" height="8" rx="2" fill="currentColor" stroke="none" /><path d="M24.5 4v4" opacity=".5" /></svg>
      </span>
    </div>
  )
}

function Card({ item, me, mine }: { item: FeedItem; me?: boolean; mine?: string }) {
  return (
    <div className={cn('xp-card', me && 'xp-this')}>
      {me && <span className="xp-this-tag">这篇</span>}
      {item.own
        ? <CoverArt text={item.cover_text ?? item.title} cover={item.cover ?? { template: 'a_cover1', pad: 'a_pad1', tone: '米白' }} pages={item.pages} seed={item.title} />
        : <CoverArt text={item.cover_text ?? item.title} cover={null} peer={item.account} />}
      <div className="xp-card-title">{item.title}</div>
      <div className="xp-card-foot">
        <span className={cn('xp-avatar', item.own ? 'abc' : 'other')}>{item.account.slice(0, 1)}</span>
        <span className="xp-name">{item.account}</span>
        <span className="xp-like"><Heart />{me ? (mine ?? '赞') : xhsNum(item.likes) || '赞'}</span>
      </div>
    </div>
  )
}

function Discover({ d, stats, selfNote }: { d: PhoneDraft; stats: PhoneStats; selfNote?: string | null }) {
  const { data: feed } = useApi<Feed>('/content/feed')
  const others: FeedItem[] = []
  const own = (feed?.own ?? []).filter((x) => x.id !== selfNote)
  const bench = feed?.bench ?? []
  for (let i = 0; i < 6; i++) { if (bench[i]) others.push(bench[i]); if (own[i]) others.push(own[i]) }
  const me: FeedItem = { id: 'me', piece_id: null, title: d.title || '（还没有标题）', cover_text: d.cover_text, cover: d.cover, pages: d.pages, likes: stats?.likes ?? null, own: true, account: 'ABC茶社' }
  const left = [me, ...others.filter((_, i) => i % 2 === 1)].slice(0, 4)
  const right = others.filter((_, i) => i % 2 === 0).slice(0, 4)
  return (
    <>
      <div className="xp-top">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#333" strokeWidth="2" strokeLinecap="round"><path d="M4 7h16M4 12h16M4 17h16" /></svg>
        <div className="xp-top-tabs"><span>关注</span><b>发现</b><span>杭州</span></div>
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#333" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="6.5" /><path d="M16 16l4 4" /></svg>
      </div>
      <div className="xp-channels"><b>推荐</b><span>视频</span><span>职场</span><span>喝茶</span><span>美食</span><span>家居</span><span>穿搭</span></div>
      <div className="xp-feed">
        <div className="xp-col">{left.map((x, i) => <Card key={`${x.id}-${i}`} item={x} me={x.id === 'me'} mine={stats ? xhsNum(stats.likes) : undefined} />)}</div>
        <div className="xp-col">{right.map((x, i) => <Card key={`${x.id}-${i}`} item={x} />)}</div>
      </div>
    </>
  )
}

function Comments({ total, items }: { total: number; items: Comment[] }) {
  return (
    <div className="xp-comments">
      共 {total} 条评论
      {items.map((c) => (
        <div key={c.id} className="xp-cmt">
          <span className="xp-avatar other">{c.author.slice(0, 1)}</span>
          <div className="xp-cmt-main">
            <div className="xp-cmt-name">{c.author}</div>
            <div className="xp-cmt-text">{c.text}</div>
            <div className="xp-cmt-meta">{Number(c.at.slice(5, 7))}-{Number(c.at.slice(8, 10))} 浙江 · 回复</div>
            {c.reply && <div className="xp-cmt-reply"><b>ABC茶社</b>{c.reply}</div>}
          </div>
          <span className="xp-cmt-like"><Heart />{c.likes}</span>
        </div>
      ))}
      {total > items.length && <div className="xp-cmt-more">{items.length ? `展开其余 ${total - items.length} 条（在小红书里看）` : '评论原文没导进工作台，在小红书里看'}</div>}
      <div className="xp-comment-input"><span className="xp-avatar abc">A</span><span>爱评论的人运气都不差</span></div>
    </div>
  )
}

function NotePage({ d, stats, comments }: { d: PhoneDraft; stats: PhoneStats; comments: Comment[] }) {
  const slides = slidesOf({ ...d, title: d.title })
  const [at, setAt] = useState(0)
  const n = slides.length
  const cur = Math.min(at, n - 1)
  return (
    <>
      <div className="xp-nav">
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#333" strokeWidth="2.2" strokeLinecap="round"><path d="M15 5l-7 7 7 7" /></svg>
        <span className="xp-avatar abc">A</span>
        <span className="xp-nav-name">ABC茶社</span>
        <span className="xp-follow">关注</span>
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#333" strokeWidth="2" strokeLinecap="round"><path d="M4 12v6a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-6M12 3v12M7 8l5-5 5 5" /></svg>
      </div>
      <div className="xp-gallery" onClick={() => setAt((cur + 1) % n)} title="点一下翻到下一张">
        <div className="xp-gallery-track" style={{ transform: `translateX(-${cur * 100}%)` }}>{slides}</div>
        {n > 1 && <span className="xp-count">{cur + 1}/{n}</span>}
      </div>
      {n > 1 && <div className="xp-dots">{slides.map((_, i) => <i key={i} className={i === cur ? 'on' : ''} />)}</div>}
      <div className="xp-note">
        <h3>{d.title || '（还没有标题）'}</h3>
        <p>{d.body || '正文还空着。'}</p>
        {d.tags.length > 0 && <div className="xp-tags">{d.tags.map((t) => <span key={t}>#{t}</span>)}</div>}
        <div className="xp-meta">{stats ? `${stats.date.slice(5).replace('-', '-')} 浙江` : '编辑于 刚刚 · 浙江'}</div>
      </div>
      {stats ? <Comments total={stats.comments ?? 0} items={comments} /> : (
        <div className="xp-comments">还没发，发出去以后评论会在这里<div className="xp-comment-input"><span className="xp-avatar abc">A</span><span>爱评论的人运气都不差</span></div></div>
      )}
    </>
  )
}

/** 手机：发现页 / 笔记页。stats 有值时按已发布显示真实的赞藏评 */
export function PhonePreview({ draft, view, stats = null, selfNote, comments = [], size = 'md', className }: {
  draft: PhoneDraft; view: PhoneView; stats?: PhoneStats; selfNote?: string | null; comments?: Comment[]; size?: 'md' | 'sm'; className?: string
}) {
  // 缩略版：按原尺寸画好再整体缩小，字和图标的比例和大图一样
  if (size === 'sm') {
    return (
      <div className={cn('xp-mini', className)}>
        <div className="xp-mini-inner"><PhonePreview draft={draft} view={view} stats={stats} selfNote={selfNote} comments={comments} /></div>
      </div>
    )
  }
  return (
    <div className={cn('xp xp-phone', className)}>
      <span className="xp-island" />
      <StatusBar />
      <div className="xp-body">{view === '发现页' ? <Discover d={draft} stats={stats} selfNote={selfNote} /> : <NotePage key={draft.cover_text + draft.pages.length} d={draft} stats={stats} comments={comments} />}</div>
      {view === '发现页' ? (
        <div className="xp-tabbar"><b>首页</b><span>购物</span><span className="xp-plus">+</span><span>消息</span><span>我</span></div>
      ) : (
        <div className="xp-bottom">
          <span className="xp-say">说点什么…</span>
          <span className="xp-act"><Heart />{stats ? xhsNum(stats.likes) : '赞'}</span>
          <span className="xp-act"><Star />{stats ? xhsNum(stats.saves) : '收藏'}</span>
          <span className="xp-act"><Bubble />{stats ? xhsNum(stats.comments) : '评论'}</span>
        </div>
      )}
    </div>
  )
}

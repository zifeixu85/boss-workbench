// 概况页签：客户信息 + 喜好卡 + 重要日子 + 背景笔记（知识库原文，只读）。归属：大客户模块
// 客户信息按老板跟进时会问的几句话排（Skill 配方“概况页签放什么”）：这家谁拍板、谁跟我对接；他们要什么、担心什么；
// 买过什么、我答应过什么；最近聊到哪；下一步做什么；交货、开票、收货地址这些硬条件。只改了展示，数据还是原来那几类（client_facts 的 kind 不变）。
// 每块都写从哪来：知识库客户档案（确认没有）、工作台记录、新材料提取（老板确认）。不知道的写“还不知道”，不编。
// 伙伴（供应商、物流、摄影）用简化版，不套客户的这几块；来源按有没有知识库档案来写；日期统一“10月26日”。
// “买过什么”只写买过哪些东西（累计在头部）；“下一步”写阶段怎么走到这的和接下来的日程；
// 一段话按分号拆成要点；来源行能换行；对方怎么定有新的，旧的灰掉、标“已被 X 更新”；喜好卡下的“习惯”和“谁拍板、谁对接”重复的不再写。
import { useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { BookOpen, Cake, CupSoda, Gift, Package, ShieldAlert, Sparkles } from 'lucide-react'
import { shortDate, todayStr, wan } from '@/lib/format'
import { StatusBadge } from '@/components/status'
import { KbDocDialog, SourceLink } from '@/features/crm/parts'
import { similar } from '@/features/crm/extract-utils'
import { toLocal } from '@/features/crm/rules'
import type { ClientProfile, Fact, FactKind, Talk, TraitKind } from '@/features/crm/types'
import { cn } from '@/lib/utils'
import { useIdentity } from '@/lib/identity'

type Item = { label: string; body: ReactNode; src: ReactNode; empty?: boolean }

/** 建库整理客户信息之后才记进来的往来：例如从收件箱提取、老板确认的新材料 */
const latestNewer = (talks: Talk[], facts: Fact[]) => {
  if (!facts.length) return talks
  const since = facts.reduce((a, f) => (f.created_at > a ? f.created_at : a), '')
  return talks.filter((t) => t.created_at > since)
}

function Src({ fact, children, owner }: { fact?: Fact; children?: ReactNode; owner: string }) {
  if (children) return <>{children}</>
  if (!fact) return <>工作台记录</>
  return <>{fact.author?.replace('知识库客户档案', '知识库档案').replace(/(\d{1,2})\/(\d{1,2}) ?/g, '$1月$2日') ?? owner}</>
}

/** 一块里分两小段时的小标题（“要什么”“担心”） */
function Part({ label, children, muted }: { label: string; children: ReactNode; muted?: boolean }) {
  return (
    <div className={cn('flex gap-2', muted && 'text-muted-foreground')}>
      <span className="w-[3.3em] shrink-0 text-[12px] leading-[22px] text-muted-foreground">{label}</span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  )
}

/** 一段话按分号拆成要点（只有一句就原样） */
function Points({ text, muted }: { text: string; muted?: boolean }) {
  const xs = text.split(/[；;]\s*/).map((x) => x.trim().replace(/[。]$/, '')).filter(Boolean)
  if (xs.length <= 1) return <>{text}</>
  return <ul className={cn('grid gap-1', muted && 'text-muted-foreground')}>{xs.map((x) => <li key={x} className="flex gap-1.5"><span className="text-muted-foreground">·</span><span className="min-w-0">{x}</span></li>)}</ul>
}

function clientItems(d: ClientProfile, owner: string): Item[] {
  const c = d.client
  const f = (k: FactKind) => d.facts.find((x) => x.kind === k)
  const fresh = latestNewer(d.interactions, d.facts)
  const freshLabel = (t: Talk) => `${shortDate(t.date)}${t.channel}${t.actor === 'Codex' ? `（Codex 提取，${owner}确认）` : ''}`
  const kb = !!d.kb_note.path
  // 顾虑：喜好表里记的 + 每次往来里听到的（第四轮：不只看新材料，禾木 10/24 电话里说的“不想要太甜”“礼盒要小”也算），说的是一件事只留一条
  const concerns = [
    ...d.traits.filter((t) => t.kind === '顾虑').map((t) => ({ text: t.text, src: t.source })),
    ...d.interactions.filter((t) => t.concerns).flatMap((t) => t.concerns!.split(/[；;]/).map((x) => ({ text: x.trim().replace(/[。]$/, ''), src: `${shortDate(t.date)}${t.channel}` }))),
  ].filter((x, i, a) => x.text && a.findIndex((y) => similar(y.text, x.text) >= 0.5) === i).slice(0, 4).map((x) => `${x.text}${x.src ? `（${x.src}）` : ''}`)
  const signalTalk = fresh.find((t) => t.their_status || t.signals)
  const open = d.promises.filter((p) => p.status === '待兑现')
  const openDeals = d.deals.filter((x) => !['已签约', '没成'].includes(x.stage))
  const text = (k: FactKind) => f(k)?.text
  const stageEdit = d.edits.find((e) => e.entity === '阶段')
  const t0 = todayStr()
  const soon = [
    ...d.events.filter((e) => e.start.slice(0, 10) >= t0).map((e) => ({ date: e.start.slice(0, 10), what: e.title })),
    ...d.todos.filter((x) => ['待办', '进行中', '等别人'].includes(x.status) && x.due).map((x) => ({ date: x.due!, what: x.title })),
  ].sort((a, b) => a.date.localeCompare(b.date)).filter((x, i, a) => a.findIndex((y) => y.date === x.date && similar(y.what, x.what) >= 0.5) === i).slice(0, 3)
  const items = d.stats.by_item.slice(0, 3)
  const want = text('真实诉求') ? <Points text={text('真实诉求')!} /> : c.note ?? '还不知道，聊的时候问一句“送给谁、想达到什么效果”'
  const wantEmpty = !f('真实诉求') && !c.note
  const worrySrc = fresh.some((t) => t.concerns) ? <>{kb ? '知识库档案 + ' : ''}{freshLabel(fresh.find((t) => t.concerns)!)}</> : concerns.length ? <>{kb ? '知识库档案和往来记录' : '工作台里记的顾虑和往来'}</> : <>工作台记录</>
  return [
    { label: '这家谁拍板、谁跟我对接', body: text('身份与决策') ? <Points text={text('身份与决策')!} /> : ([c.contact_name && `${c.contact_name}${c.contact_title ? `（${c.contact_title}）` : ''}对接`, c.decision_maker].filter(Boolean).join('；') || '还不知道谁拍板'), src: <Src owner={owner} fact={f('身份与决策')} />, empty: !f('身份与决策') && !c.contact_name },
    {
      label: '他们要什么、担心什么', empty: wantEmpty && !concerns.length,
      body: <div className="grid gap-1.5">
        <Part label="要什么" muted={wantEmpty}>{want}</Part>
        <Part label="担心" muted={!concerns.length}>{concerns.length ? <ul className="grid gap-1">{concerns.map((x) => <li key={x} className="flex gap-1.5"><span className="text-muted-foreground">·</span><span className="min-w-0">{x}</span></li>)}</ul> : '没听到过顾虑（不等于没有）'}</Part>
      </div>,
      src: <>要什么：<Src owner={owner} fact={f('真实诉求')} />；担心：{worrySrc}</>,
    },
    {
      label: '买过什么、我答应过什么', empty: !items.length && !open.length, src: <>工作台订单和答应的事</>,
      body: <>
        {items.length
          ? <span className="block">{items.map((x) => `${x.item} ${x.times} 次（${x.qty} ${x.unit}）`).join('、')}</span>
          : <span className="block">还没成交{openDeals.length ? `；在谈：${openDeals.map((x) => `${x.title}${x.amount ? `（${x.estimated ? '估 ' : ''}${wan(x.amount)}）` : ''}`).join('、')}` : ''}</span>}
        {open.length ? <span className="mt-1 block">答应了还没做的 {open.length} 件：{open[0].text}{open.length > 1 ? ' 等' : ''}（见“往来和答应”）</span> : <span className="mt-1 block text-muted-foreground">没有答应了还没做的事</span>}
      </>,
    },
    {
      label: '最近聊到哪', empty: !d.interactions.length && !f('决策信号'),
      body: <div className="grid gap-1.5">
        <div>{text('沟通摘要') ? <Points text={text('沟通摘要')!} /> : (d.interactions.length ? `${d.interactions.length} 次往来，第一次 ${shortDate(d.interactions.at(-1)!.date)}。` : '还没有往来记录')}{d.facts.length > 0 && fresh.length > 0 && <span className="mt-1 block">之后又有 {fresh.length} 次：{fresh.map((t) => `${shortDate(t.date)}${t.channel}`).join('、')}</span>}</div>
        <Part label="怎么定" muted={!f('决策信号') && !signalTalk}>
          {signalTalk && <span className="mb-1.5 block"><StatusBadge value={`${shortDate(signalTalk.date)} 最新`} tone="info" className="mr-1.5" /><Points text={[signalTalk.their_status, signalTalk.signals].filter(Boolean).map((x) => x!.trim().replace(/[。；;]+$/, '')).join('；')} /></span>}
          {f('决策信号') && (signalTalk
            ? <span className="block text-muted-foreground"><span className="mr-1.5 rounded border px-1 text-[12px]">已被 {shortDate(signalTalk.date)} 更新</span><s className="decoration-muted-foreground/40">{f('决策信号')!.text}</s></span>
            : <Points text={f('决策信号')!.text} />)}
          {!f('决策信号') && !signalTalk && '还不知道：谁拍板、哪天定、在跟谁比'}
        </Part>
      </div>,
      src: <>往来：<Src owner={owner} fact={f('沟通摘要')} />；怎么定：{signalTalk ? <>{freshLabel(signalTalk)}{f('决策信号') ? ' + 知识库档案（旧的）' : ''}</> : <Src owner={owner} fact={f('决策信号')} />}</>,
    },
    {
      label: '下一步做什么', src: <>工作台改动留痕、日程和待办</>, empty: !stageEdit && !soon.length,
      body: <>
        {stageEdit ? <span className="block">{shortDate(toLocal(stageEdit.at))}从“{stageEdit.old_value}”到“{stageEdit.new_value}”：{stageEdit.reason}</span> : <span className="block">现在是“{c.stage}”{c.since ? `，${shortDate(c.since)}开始往来` : ''}</span>}
        {soon.length ? <span className="mt-1 block">接下来：{soon.map((x) => `${shortDate(x.date)} ${x.what}`).join('；')}</span> : <span className="mt-1 block text-muted-foreground">日程和待办里没有排上的事</span>}
      </>,
    },
    { label: '交货、开票、收货地址', body: text('执行条件') ? <Points text={text('执行条件')!} /> : '还没问：哪天要、开不开票、送到哪（地址不记在这里）', src: <Src owner={owner} fact={f('执行条件')} />, empty: !f('执行条件') },
  ]
}

/** 伙伴（做礼盒、送货、拍图、供茶的）：不套客户的那几块，只写是谁、合作什么、最近在办的事 */
function partnerItems(d: ClientProfile): Item[] {
  const c = d.client
  const todos = d.todos.filter((t) => ['待办', '进行中', '等别人'].includes(t.status))
  const events = d.events.filter((e) => e.start.slice(0, 10) >= todayStr())
  return [
    { label: '是谁、合作什么', body: [c.label, c.note].filter(Boolean).join('；') || '还没写', src: <>工作台客户资料</> },
    { label: '对接的人', body: [c.contact_name && `${c.contact_name}${c.contact_title ? `（${c.contact_title}）` : ''}`, c.decision_maker].filter(Boolean).join('；') || '还没写', src: <>工作台客户资料</> },
    {
      label: '最近聊到哪', empty: !d.interactions.length, src: <>工作台往来记录</>,
      body: d.interactions.length ? `${shortDate(d.interactions[0].date)}${d.interactions[0].channel}：${d.interactions[0].summary}` : '还没有往来记录',
    },
    {
      label: '在办的事', empty: !todos.length && !events.length, src: <>工作台待办和日程</>,
      body: todos.length || events.length
        ? <ul className="grid gap-1">{[...todos.map((t) => `${t.title}${t.due ? `（${shortDate(t.due)}）` : ''}`), ...events.map((e) => `${shortDate(e.start.slice(0, 10))} ${e.title}`)].slice(0, 4).map((x) => <li key={x} className="flex gap-1.5"><span className="text-muted-foreground">·</span>{x}</li>)}</ul>
        : '没有在办的事',
    },
    {
      label: '下一步', src: <>工作台</>,
      body: <>{c.next_step ?? '没写下一步'}{c.next_follow && <span className="whitespace-nowrap text-muted-foreground">（下次联系 {shortDate(c.next_follow)}）</span>}</>,
    },
  ]
}

const PREFS: { kind: TraitKind; icon: typeof CupSoda; hint: string }[] = [
  { kind: '口味', icon: CupSoda, hint: '爱喝什么' }, { kind: '包装', icon: Package, hint: '包装要求' },
  { kind: '送礼对象', icon: Gift, hint: '送给谁' }, { kind: '禁忌', icon: ShieldAlert, hint: '别碰什么' },
]

export function ClientOverview({ d }: { d: ClientProfile }) {
  const [doc, setDoc] = useState(false)
  const { owner } = useIdentity()
  const partner = d.client.kind === '伙伴'
  const items = partner ? partnerItems(d) : clientItems(d, owner)
  // 习惯和“谁拍板、谁跟我对接”说的是一件事就不再写
  const who = d.facts.find((x) => x.kind === '身份与决策')?.text ?? ''
  const habits = d.traits.filter((t) => t.kind === '习惯' && !(who && similar(t.text, who) >= 0.5))
  const note = d.kb_note
  return (
    <div className="grid gap-5">
      <section>
        <h3 className="mb-2 flex flex-wrap items-center gap-x-2 text-[13px] font-semibold text-muted-foreground"><span className="whitespace-nowrap">{partner ? '伙伴信息' : '客户信息'}</span><span className="font-normal">· {partner ? '合作伙伴不是客户，不记消费和喜好' : '打开就知道他在意什么、上次聊到哪、答应了什么'}</span></h3>
        <ol className="grid gap-px overflow-hidden rounded-xl border bg-border sm:grid-cols-2">
          {items.map((it, i) => (
            <li key={it.label} className="min-w-0 bg-card px-4 py-3">
              <div className="flex items-center gap-2 text-[12px] font-medium text-muted-foreground"><span className="num grid size-[18px] place-items-center rounded-full bg-muted text-[12px]">{i + 1}</span>{it.label}</div>
              <div className={cn('mt-1.5 text-[13.5px] leading-relaxed', it.empty && 'text-muted-foreground')}>{it.body}</div>
              <div className="mt-1.5 text-[12px] leading-snug text-muted-foreground/80">来源：{it.src}</div>
            </li>
          ))}
        </ol>
      </section>

      {!partner && <div className="grid gap-5 sm:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        <section>
          <h3 className="mb-2 text-[13px] font-semibold text-muted-foreground">喜好卡</h3>
          <div className="grid grid-cols-2 gap-2">
            {PREFS.map(({ kind, icon: Icon, hint }) => {
              const xs = d.traits.filter((t) => t.kind === kind)
              return (
                <div key={kind} className={cn('min-w-0 rounded-lg border p-3', xs.length ? 'bg-card' : 'border-dashed bg-transparent')}>
                  <div className="flex items-center gap-1.5 text-[12px] text-muted-foreground"><Icon className={cn('size-3.5', xs.length && 'text-primary')} />{kind}</div>
                  {xs.length ? xs.map((t) => <p key={t.id} className="mt-1 text-[13px] leading-snug">{t.text}{t.source && <span className="ml-1 text-[12px] text-muted-foreground">{t.source}</span>}</p>)
                    : <p className="mt-1 text-[12.5px] text-muted-foreground">未知（{hint}，听到了再记）</p>}
                </div>
              )
            })}
          </div>
          {habits.length > 0 && <p className="mt-2 text-[12.5px] text-muted-foreground">习惯：{habits.map((h) => h.text).join('；')}</p>}
        </section>
        <section>
          <h3 className="mb-2 text-[13px] font-semibold text-muted-foreground">重要日子</h3>
          {d.dates.length ? (
            <ul className="divide-y rounded-lg border bg-card">
              {d.dates.map((x) => (
                <li key={x.id} className="flex items-center gap-2.5 px-3 py-2 text-[13px]">
                  <Cake className={cn('size-4 shrink-0', x.kind === '生日' ? 'text-primary' : 'text-muted-foreground')} />
                  <span className="min-w-0 flex-1"><span className="block truncate">{x.label}</span>{x.note && <span className="block truncate text-[12px] text-muted-foreground">{x.note}</span>}</span>
                  <span className="num shrink-0 text-right"><span className="block whitespace-nowrap">{shortDate(x.next)}</span><span className="block text-[12px] text-muted-foreground">{x.days_left === 0 ? '今天' : `${x.days_left} 天后`}</span></span>
                </li>
              ))}
            </ul>
          ) : <p className="rounded-lg border border-dashed px-3 py-4 text-[12.5px] text-muted-foreground">还不知道。生日、年会、合作纪念日，对方自己说了再记，不去查。</p>}
        </section>
      </div>}

      <section className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-muted/60 px-3 py-2.5 text-[12.5px]">
        <BookOpen className="size-4 text-muted-foreground" />
        <span className="text-muted-foreground">背景笔记</span>
        {note.path ? <>
          <button className="min-w-0 truncate text-primary hover:underline" onClick={() => setDoc(true)}>知识库原文 · {note.path}</button>
          <span className="text-muted-foreground">只读</span>
          <Link to={`/kb?path=${encodeURIComponent(note.path)}`} className="ml-auto text-muted-foreground hover:text-foreground">在知识库里打开 →</Link>
        </> : partner ? <SourceLink path="03-生意/团队与伙伴/合作伙伴.md" label="知识库里的说明 · 03-生意/团队与伙伴/合作伙伴.md" />
          : <span className="text-muted-foreground">知识库里没有这位客户的档案（普通客户只记在工作台）{note.expected ? `，预期在 ${note.expected}` : ''}</span>}
      </section>
      {d.facts.some((f) => f.author?.includes('待确认')) && (
        <p className="-mt-3 flex items-center gap-1.5 text-[12px] text-muted-foreground"><Sparkles className="size-3 text-info" />标“待确认”的是建库时 AI 从采访里整理的，{owner}还没逐条点头。</p>
      )}
      {doc && note.path && <KbDocDialog path={note.path} onClose={() => setDoc(false)} />}
    </div>
  )
}

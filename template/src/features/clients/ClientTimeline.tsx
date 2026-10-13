// “往来和答应”页签：最上面是还没做到的答应（标黄的当场能定），下面是往来时间线（日期、渠道、和谁、说了什么、答应了什么、对方的状态和顾虑），
// 最下面折起来的是做到了的答应和改动留痕。归属：大客户模块
// 第二轮：只有具体原件（电话纪要、聊天记录）才挂来源链接；建库导入的在时间线顶上说一句。
// 第三轮（产品评审 #10 #24）：页签里不再重复“记一笔跟进”“提取进来”两个按钮（头部、蓝条里有）；没有没做到的答应时收成一行灰字；
//   时间线里还没做到、上面已经列着的答应只写一句“见上方”，不再把日期、状态再说一遍。
import { shortDate, weekday } from '@/lib/format'
import { StatusBadge } from '@/components/status'
import { EmptyNote } from '@/components/chart-kit'
import { ChannelIcon, SourceLink } from '@/features/crm/parts'
import type { ClientProfile } from '@/features/crm/types'
import { similar } from '@/features/crm/extract-utils'
import { withoutDue } from '@/features/crm/rules'
import { OpenPromises, PromiseHistory } from './ClientPromises'
import { useIdentity } from '@/lib/identity'

const INTERVIEW = /建库采访/
const sourceLabel = (path: string) => path.split('/').pop()!.replace(/\.md$/, '').replace(/^\d{4}-\d{2}-\d{2}-/, '')

export function ClientTimeline({ d, openPromises }: { d: ClientProfile; openPromises: number }) {
  const { owner } = useIdentity()
  const partner = d.client.kind === '伙伴'
  const fromInterview = d.interactions.filter((i) => i.source_file && INTERVIEW.test(i.source_file))
  const lastInterview = fromInterview.reduce((a, i) => (i.date > a ? i.date : a), '')
  const sameYear = (date: string) => date.slice(0, 4) === d.interactions[0]?.date.slice(0, 4)
  return (
    <div className="grid gap-5">
      {!partner && (openPromises > 0 ? (
        <section>
          <h3 className="mb-2 text-[13px] font-semibold text-muted-foreground">还没做到的答应 <span className="num font-normal">{openPromises}</span></h3>
          <OpenPromises d={d} />
        </section>
      ) : <p className="text-[13px] text-muted-foreground">答应了还没做的事：没有。</p>)}

      <section>
        <div className="mb-3 flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <h3 className="text-[13px] font-semibold text-muted-foreground">往来记录 <span className="num font-normal">{d.interactions.length}</span></h3>
          <span className="text-xs text-muted-foreground">新的在上{lastInterview ? ` · ${shortDate(lastInterview)}以前的 ${fromInterview.length} 条来自建库采访（${owner}口述）` : ''}</span>
          {fromInterview[0]?.source_file && <SourceLink path={fromInterview[0].source_file} label="看采访原文" className="ml-auto" />}
        </div>
        {!d.interactions.length ? <EmptyNote>还没有往来记录。聊完随手“记一笔跟进”，或者把聊天、纪要丢进知识库收件箱让 Codex 提取。</EmptyNote> : (
          <ol className="relative ml-[68px] border-l pl-5">
            {d.interactions.map((i) => (
              <li key={i.id} className="relative mb-5 last:mb-1">
                <div className="absolute top-0 -left-[90px] w-[60px] text-right">
                  <div className="num text-[13px] font-semibold whitespace-nowrap">{shortDate(i.date).replace(/^\d{4}年/, '')}</div>
                  <div className="text-[12px] whitespace-nowrap text-muted-foreground">{sameYear(i.date) ? weekday(i.date) : `${i.date.slice(0, 4)}年`}</div>
                </div>
                <span className="absolute top-1 -left-[28px] grid size-3.5 place-items-center rounded-full border-2 border-card bg-primary" />
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-foreground/80"><ChannelIcon channel={i.channel} />{i.channel}</span>
                  {i.with_whom && <span>和 {i.with_whom}</span>}
                  {i.actor === 'Codex' && <StatusBadge value={i.source_file?.startsWith('00-收件箱') ? `Codex 提取 · ${owner}确认` : 'Codex 记的'} tone="info" />}
                  {i.source_file && !INTERVIEW.test(i.source_file) && <SourceLink path={i.source_file} label={`原件：${sourceLabel(i.source_file)}`} className="ml-auto" />}
                </div>
                <p className="mt-1.5 text-[14px] leading-relaxed">{i.summary}</p>
                {(i.their_status || i.signals || i.concerns || i.promises.length > 0 || (i.next_step && !i.promises.some((p) => similar(p.text, i.next_step!) >= 0.5))) && (
                  <dl className="mt-2 grid gap-1.5 rounded-lg bg-surface-2/60 px-3 py-2.5 text-[13px]">
                    {i.promises.map((p) => p.status === '待兑现' ? (
                      <div key={p.id} className="flex items-start gap-2">
                        <dt className="w-[4.5em] shrink-0 text-muted-foreground">{p.who}答应</dt>
                        <dd className="min-w-0 flex-1">{withoutDue(p)}<span className="ml-1 text-muted-foreground">（还没做到，见上方{p.conflict && !p.decision ? <span className="text-warn">，标黄等你定</span> : ''}）</span></dd>
                      </div>
                    ) : (
                      <div key={p.id} className="flex items-start gap-2">
                        <dt className="w-[4.5em] shrink-0 text-muted-foreground">{p.who}答应</dt>
                        <dd className="min-w-0 flex-1">{p.text}{p.conflict && p.decision && <span className="block text-[12px] text-muted-foreground">{owner}定了：{p.decision === '例外' ? '这次算例外' : '规则该改'}（{p.decision_note}）</span>}</dd>
                        <StatusBadge value={p.status === '已兑现' ? (p.done_at ? `${shortDate(p.done_at)}做到` : '已兑现') : '不做了'} tone={p.status === '已兑现' ? 'ok' : 'neutral'} />
                      </div>
                    ))}
                    {i.their_status && <div className="flex gap-2"><dt className="w-[4.5em] shrink-0 text-muted-foreground">对方状态</dt><dd className="min-w-0">{i.their_status}</dd></div>}
                    {i.signals && <div className="flex gap-2"><dt className="w-[4.5em] shrink-0 text-muted-foreground">怎么定</dt><dd className="min-w-0">{i.signals}</dd></div>}
                    {i.concerns && <div className="flex gap-2"><dt className="w-[4.5em] shrink-0 text-muted-foreground">顾虑</dt><dd className="min-w-0">{i.concerns}</dd></div>}
                    {i.next_step && !i.promises.some((p) => similar(p.text, i.next_step!) >= 0.5) && <div className="flex gap-2"><dt className="w-[4.5em] shrink-0 text-muted-foreground">下一步</dt><dd className="min-w-0">{i.next_step}</dd></div>}
                  </dl>
                )}
              </li>
            ))}
          </ol>
        )}
      </section>
      <PromiseHistory d={d} />
    </div>
  )
}

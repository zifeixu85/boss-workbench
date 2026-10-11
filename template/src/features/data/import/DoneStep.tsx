// 第 ④ 步：完成。导了多少行、哪几天（按实际天数写）、每天成交小图；右边“接下来做什么”：去渠道页看、再试缺列那份、看新存的规则、演示完怎么复原。
// 一个数都没变时，标题写“核对完了：30 行都一样，没改数”，不说“导入了 30 行”。撤销后示例数据又是清掉的，提示里直接给“放回示例数据”。归属：数据源与导入模块
import { Link } from 'react-router'
import { toast } from 'sonner'
import { ArrowRight, CheckCircle2, Equal, FilePlus2, History, ListChecks, Undo2 } from 'lucide-react'
import { api } from '@/lib/api'
import { useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog'
import { thousands } from '@/lib/format'
import { Badge, Note } from '../parts'
import { fullSpan, when } from '../labels'
import { useUndo } from '../use-draft'
import { ImportedChart } from './ImportedChart'
import type { DraftView } from '../types'

export function DoneStep({ v, onAgain }: { v: DraftView; onAgain: () => void }) {
  const r = v.result!
  const qc = useQueryClient()
  const undo = useUndo()
  const one = r.channels.length === 1 ? r.channels[0] : null
  const same = r.all_same
  const cleared = r.sample_cleared
  const sampleTmall = r.provenance === '样例表' && one?.id === 'tmall'
  const restore = (ch: { id: string; name: string }) => api.post<{ restored: number }>('/data/samples/restore', { channel: ch.id })
    .then((x) => { qc.invalidateQueries(); toast.success(`放回了${ch.name}的示例数据 ${x.restored} 行`) }).catch((e: Error) => toast.error(e.message))
  const afterUndo = () => {
    const ch = cleared[0]
    toast('这份文件回到“对字段”这一步', {
      description: ch ? `${ch.name}现在没有数了（示例数据之前清掉了）。演示完可以把示例数据放回去` : '可以改了对照再导，也可以放弃',
      duration: 12000, ...(ch ? { action: { label: `放回${ch.name}的示例数据`, onClick: () => { void restore(ch) } } } : {}),
    })
  }
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(280px,1fr)]">
      <section className="relative overflow-hidden rounded-2xl border bg-card p-6 shadow-paper sm:p-7">
        <div className="flex flex-wrap items-start gap-4">
          <span className={same ? 'grid size-11 place-items-center rounded-full bg-surface-2 text-muted-foreground' : 'grid size-11 place-items-center rounded-full bg-ok-soft text-ok'}>{same ? <Equal className="size-6" /> : <CheckCircle2 className="size-6" />}</span>
          <div className="min-w-0 flex-1">
            <h2 className="font-heading text-[26px] leading-tight font-semibold">{same ? <>核对完了：<span className="num">{r.rows}</span> 行都一样，没改数</> : <>导入了 <span className="num">{r.rows}</span> 行</>}</h2>
            <p className="mt-1 text-[14px] text-muted-foreground">{r.channels.map((c) => `${c.name} ${fullSpan(c.date_from, c.date_to)}`).join('，')}（<span className="num">{r.days}</span> 天）{!same && <>，成交合计 <span className="num">{thousands(r.gmv_total)}</span> 元</>}　·　{when(r.batch.created_at)}</p>
          </div>
        </div>
        {!same && (
          <dl className="mt-5 grid grid-cols-3 gap-3 sm:max-w-md">
            {[['新增', r.new], ['覆盖', r.update], ['和原来一样', r.same]].map(([k, n]) => (
              <div key={k} className="rounded-xl border bg-background/70 px-3 py-2.5"><dt className="text-xs text-muted-foreground">{k}</dt><dd className="num mt-0.5 font-heading text-xl font-semibold">{n}</dd></div>
            ))}
          </dl>
        )}
        {same && <p className="mt-4 text-[13.5px] text-muted-foreground">这份表和工作台里的数一模一样，这次只记了一次“核对”。想看“从无到有”，在预览那一步先清掉这个渠道的示例数据，再导一次。</p>}
        <div className="mt-5 flex flex-wrap gap-2">
          {one && <Button asChild><Link to={`/channel/${one.id}`}>去{one.name}页看<ArrowRight /></Link></Button>}
          {!one && <Button asChild><Link to="/biz">去经营汇总看<ArrowRight /></Link></Button>}
          <Button variant="outline" onClick={onAgain}><FilePlus2 />再导一份</Button>
          <AlertDialog>
            <AlertDialogTrigger asChild><Button variant="ghost" className="text-danger hover:text-danger" disabled={r.batch.status !== '有效' || undo.isPending}><Undo2 />撤销这次导入</Button></AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>撤销这次导入？</AlertDialogTitle>
                <AlertDialogDescription>这次写进去的 {r.rows} 行恢复成导入前的样子：覆盖的改回原来的数，新增的删掉。后来又被别的导入改过的行不动。导入记录会留着，标“已撤销”。{cleared.length > 0 && `${cleared.map((c) => c.name).join('、')}的示例数据之前清掉了，撤销后这个渠道先是空的，可以再放回示例数据。`}</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter><AlertDialogCancel>不撤销</AlertDialogCancel>
                <AlertDialogAction className="bg-danger hover:bg-danger/90" onClick={() => undo.mutate(r.batch.id, { onSuccess: afterUndo })}>撤销</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
        {r.problem_rows.length > 0 && (
          <div className="mt-4 rounded-xl border border-warn/30 bg-warn-soft/50 px-4 py-3 text-[13px]">
            <div className="font-medium text-warn">{r.problem_rows.length} 行没导</div>
            <ul className="mt-1 grid gap-0.5 text-muted-foreground">{r.problem_rows.slice(0, 4).map((p) => <li key={p.行}><span className="num">第 {p.行} 行</span>：{p.原因}</li>)}</ul>
            <p className="mt-1.5 text-muted-foreground">等平台把这几天的数补齐，再导一次就会补上；同一天同一渠道是覆盖，不会重复。</p>
          </div>
        )}
        {one && r.series.length > 1 && !same && <div className="mt-5 border-t pt-4"><ImportedChart series={r.series} channel={one.name} /></div>}
      </section>

      <div className="grid content-start gap-3">
        <div className="rounded-xl border bg-card p-4 shadow-paper">
          <div className="text-[14px] font-semibold">接下来做什么</div>
          <ol className="mt-2.5 grid gap-3 text-[13px]">
            {one && (
              <Step n={1} title={one.id === 'tmall' ? '去天猫页看推广 ROI 掉的那几天' : `去${one.name}页看导进来的数`}
                action={<Button size="sm" variant="outline" asChild><Link to={`/channel/${one.id}`}>去{one.name}页<ArrowRight /></Link></Button>}>
                {one.id === 'tmall' ? '10/22 万相台「秋冬白茶」出价 1.20 → 3.60，近 3 天天猫推广 ROI 从约 3.3 掉到约 1.6；天猫页的异常就是这份数算出来的。' : '经营页、今日页用的就是这份数。'}
              </Step>
            )}
            {sampleTmall && (
              <Step n={2} title="再拖“少了推广花费”那份" action={<Button size="sm" variant="outline" onClick={onAgain}><FilePlus2 />再导一份</Button>}>
                看工作台停下来：天猫每天都有推广花费，缺了这一列不能当 0。
              </Step>
            )}
            {r.rule && (
              <Step n={sampleTmall ? 3 : 2} title={r.rule.action === '新存' ? `存了新规则「${r.rule.name}」` : r.rule.action === '更新' ? `更新了规则「${r.rule.name}」` : `按规则「${r.rule.name}」导的`}
                action={<Button size="sm" variant="ghost" asChild><Link to={`/imports/rules?rule=${r.rule.id}`}><ListChecks />看规则</Link></Button>}>
                {r.rule.action === '沿用' ? '规则记了一次“用过”。' : '以后同一种表拖进来、或放进导入文件夹，直接按它对字段；表头变了会停下来提醒。'}
                {r.rule.action !== '沿用' && <Badge value={r.rule.action === '新存' ? '新存的' : '更新了'} tone="ok" className="ml-1.5" />}
              </Step>
            )}
          </ol>
          <Button size="sm" variant="ghost" className="mt-2 -ml-2" asChild><Link to="/imports/history"><History />导入记录</Link></Button>
        </div>
        {cleared.length > 0 && (
          <Note tone="muted" title="演示完怎么复原">
            {cleared.map((c) => c.name).join('、')}的示例数据刚才清掉了（{cleared[0].rows} 行放在一边）。先“撤销这次导入”，再点提示里的“放回{cleared[0].name}的示例数据”，经营页回到原来的样子。
          </Note>
        )}
        {r.provenance === '样例表' && !cleared.length && <Note tone="muted" title="这份是样例表">数字和预置的示例数据一样；记录是你 {when(r.batch.created_at)} 现场导的。要去掉这次写进去的数，用“撤销这次导入”。</Note>}
      </div>
    </div>
  )
}

function Step({ n, title, children, action }: { n: number; title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <li className="grid grid-cols-[22px_minmax(0,1fr)] gap-x-2.5">
      <span className="num grid size-[22px] place-items-center rounded-full border bg-background text-[11px] font-semibold text-muted-foreground">{n}</span>
      <div className="min-w-0">
        <div className="font-medium">{title}</div>
        <p className="mt-0.5 leading-relaxed text-muted-foreground">{children}</p>
        {action && <div className="mt-1.5">{action}</div>}
      </div>
    </li>
  )
}

// 助理：只读状态页。三种角色（总助、分身、合伙人）的角色文件放在知识库 01-关于我/助理/ 里，这里只看齐不齐、哪天更新的；不在这里改。
import { Link } from 'react-router'
import { Check, Minus } from 'lucide-react'
import { useApi } from '@/lib/api'
import { shortDate } from '@/lib/format'
import { PageHeader, PageBody, Panel } from '@/components/page'
import { StatusBadge } from '@/components/status'
import { EmptyNote, Failed } from '@/components/chart-kit'
import { Skeleton } from '@/components/ui/skeleton'
import { kbLink } from './parts'
import type { Role, Roles } from './types'

const ABOUT: Record<Role['role'], { tag: string; what: string }> = {
  总助: { tag: '懂我的事', what: '派活、汇总、写日报周报。' },
  分身: { tag: '懂我这个人', what: '拿我说过的话和定过的目标，对照现在的我。' },
  合伙人: { tag: '懂我不懂的', what: '有专业、知道我全部情况的内部专家。专业意见都带一句“重大事项请真人专业人士复核”。' },
}
const WHAT: Record<string, string> = { 角色: '一页纸：我是谁、管什么不管什么、怎么想、怎么说话、什么时候会反对你、不碰的', 记忆: '长期记住的事，按日期一行一条，只记你确认过的' }

function RoleCard({ r }: { r: Role }) {
  const n = r.files.filter((f) => f.exists).length
  const total = r.files.length
  return (
    <Panel title={<span className="flex flex-wrap items-center gap-2">{r.role === '合伙人' ? `合伙人 · ${r.name}` : r.role}{r.display && <span className="text-sm font-normal">（{r.display}）</span>}<span className="text-xs font-normal text-muted-foreground">{ABOUT[r.role].tag}</span></span>} desc={ABOUT[r.role].what}
      action={<StatusBadge value={r.legacy ? '旧格式' : n === total ? '两份都在' : n ? `缺 ${total - n} 份` : '还没生成'} tone={r.legacy ? 'warn' : n === total ? 'ok' : n ? 'warn' : 'neutral'} />}>
      <ul className="grid gap-2.5">
        {r.files.map((f) => (
          <li key={f.name} className="flex items-start gap-2.5 text-sm">
            <span className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-full ${f.exists ? 'bg-ok-soft text-ok' : 'bg-muted text-muted-foreground'}`}>{f.exists ? <Check className="size-3.5" /> : <Minus className="size-3.5" />}</span>
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-center gap-x-2">
                {f.exists ? <Link to={kbLink(f.path)} className="font-medium text-primary hover:underline">{f.name}</Link> : <span className="font-medium">{f.name}</span>}
                <span className="text-xs text-muted-foreground">{f.exists ? `更新 ${shortDate(f.updated)}${f.lines !== undefined ? ` · ${f.lines} 条` : ''}` : '没有这份文件'}</span>
                {f.exists && f.confirm && f.confirm !== '已确认' && <StatusBadge value={f.confirm} tone="warn" />}
              </span>
              <span className="block text-xs text-muted-foreground">{f.problems.length ? f.problems.join('；') : WHAT[f.name]}</span>
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-4 border-t pt-3 text-xs text-muted-foreground">放在知识库 {r.folder}/</p>
    </Panel>
  )
}

export default function RolesPage() {
  const { data: d, error, refetch } = useApi<Roles>('/m/pa/roles')
  const head = <PageHeader eyebrow="我的助理" title="助理" desc="角色文件放在知识库里，换工具带着走。这一页只看它们齐不齐、哪天更新的；要生成或改，在对话里说。" />
  if (error && !d) return <>{head}<PageBody><Failed message={error.message} onRetry={() => refetch()} /></PageBody></>
  if (!d) return <>{head}<PageBody className="grid gap-4 lg:grid-cols-3"><Skeleton className="h-64" /><Skeleton className="h-64" /><Skeleton className="h-64" /></PageBody></>
  const partners = d.roles.filter((r) => r.role === '合伙人')
  return (
    <>
      {head}
      <PageBody className="grid gap-4">
        {!d.exists && <Panel><EmptyNote>知识库里还没有 {d.base}/ 这个文件夹。在对话里让助理按角色文件的格式生成总助和分身，这里就会显示。</EmptyNote></Panel>}
        <div className="grid gap-4 lg:grid-cols-2">{d.roles.filter((r) => r.role !== '合伙人').map((r) => <RoleCard key={r.folder} r={r} />)}</div>
        <h2 className="mt-2 text-[13px] font-semibold text-muted-foreground">合伙人 · {partners.length ? `${partners.length} 位` : '还没有'}</h2>
        {partners.length ? <div className="grid gap-4 lg:grid-cols-2">{partners.map((r) => <RoleCard key={r.folder} r={r} />)}</div>
          : <Panel><EmptyNote>还没有合伙人。在知识库 {d.base}/ 下建“合伙人-名称”文件夹（角色.md、记忆.md 两份），这里就会多一张卡。</EmptyNote></Panel>}
      </PageBody>
    </>
  )
}

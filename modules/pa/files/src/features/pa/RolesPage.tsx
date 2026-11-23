// 助理：只读状态页（约定 v0.3 第 5 节）。知识库 01-关于我/助理/ 下一个角色一个文件夹（总助-小茶、分身-<名字>、合伙人-法务），
// 有几个列几个：总助一个，分身、合伙人可以有多个。每个角色看三份文件（角色、规矩、记忆）齐不齐、哪天更新、记忆几条；不在这里改。
import { Link } from 'react-router'
import { Check, Minus } from 'lucide-react'
import { useApi } from '@/lib/api'
import { shortDate } from '@/lib/format'
import { PageHeader, PageBody, Panel } from '@/components/page'
import { StatusBadge } from '@/components/status'
import { EmptyNote, Failed } from '@/components/chart-kit'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Skeleton } from '@/components/ui/skeleton'
import { kbLink } from './parts'
import type { Role, RoleKind, Roles } from './types'

const KINDS: { kind: RoleKind; tag: string; what: string; many: boolean }[] = [
  { kind: '总助', tag: '懂我的事', what: '派活、汇总、写日报周报、巡查各个对话。只有一个。', many: false },
  { kind: '分身', tag: '懂我这个人', what: '拿我说过的话和定过的目标，对照现在的我。可以有好几个。', many: true },
  { kind: '合伙人', tag: '懂我不懂的', what: '有专业、知道我全部情况的内部专家。专业意见都带一句“重大事项请真人专业人士复核”。', many: true },
]
const WHAT: Record<string, string> = { 角色: '人设：我是谁、管什么、怎么想、怎么说话、什么时候会反对你', 规矩: '这个角色怎么做事：先读什么、能自己做的、要先问的、不做的、定期做的', 记忆: '长期记住的事，一行一条，只记你确认过的' }

function RoleCard({ r }: { r: Role }) {
  const n = r.files.filter((f) => f.exists).length
  return (
    <Panel title={<span className="flex flex-wrap items-baseline gap-x-2">{r.display || r.name}{r.display && r.display !== r.name && <span className="text-xs font-normal text-muted-foreground">{r.name}</span>}</span>}
      desc={`放在知识库 ${r.folder}/`}
      action={<StatusBadge value={r.legacy ? '旧格式' : n === 3 ? '三份都在' : n ? `缺 ${3 - n} 份` : '还没生成'} tone={r.legacy ? 'warn' : n === 3 ? 'ok' : n ? 'warn' : 'neutral'} />}>
      {r.problems.length > 0 && <p className="mb-3 rounded-lg bg-warn-soft px-3 py-2 text-xs text-warn">{r.problems.join('；')}</p>}
      <ul className="grid gap-2.5">
        {r.files.map((f) => (
          <li key={f.name} className="grid grid-cols-[1.25rem_minmax(0,1fr)] gap-2.5 text-sm">
            <span className={`mt-0.5 grid size-5 place-items-center rounded-full ${f.exists ? 'bg-ok-soft text-ok' : 'bg-muted text-muted-foreground'}`}>{f.exists ? <Check className="size-3.5" /> : <Minus className="size-3.5" />}</span>
            <span className="min-w-0">
              <span className="flex flex-wrap items-center gap-x-2">
                {f.exists ? <Link to={kbLink(f.path)} className="font-medium text-primary hover:underline">{f.name}</Link> : <span className="font-medium">{f.name}</span>}
                <span className="text-xs text-muted-foreground">{f.exists ? `更新 ${shortDate(f.updated)}${f.lines !== undefined ? ` · ${f.lines} 条` : ''}` : '没有这份文件'}</span>
                {f.exists && f.confirm && f.confirm !== '已确认' && <StatusBadge value={f.confirm} tone="warn" />}
              </span>
              <span className={`block text-xs ${f.problems.length ? 'text-warn' : 'text-muted-foreground'}`}>{f.problems.length ? f.problems.join('；') : WHAT[f.name]}</span>
            </span>
          </li>
        ))}
      </ul>
    </Panel>
  )
}

export default function RolesPage() {
  const { data: d, error, refetch } = useApi<Roles>('/m/pa/roles')
  const head = <PageHeader eyebrow="我的助理" title="助理" desc="角色文件放在知识库里，换工具带着走。一个角色一个文件夹，三份文件：角色、规矩、记忆。这一页只看齐不齐、哪天更新的；要生成或改，在对话里说。" />
  if (error && !d) return <>{head}<PageBody><Failed message={error.message} onRetry={() => refetch()} /></PageBody></>
  if (!d) return <>{head}<PageBody className="grid gap-4 lg:grid-cols-3"><Skeleton className="h-64" /><Skeleton className="h-64" /><Skeleton className="h-64" /></PageBody></>
  return (
    <>
      {head}
      <PageBody className="grid grid-cols-[minmax(0,1fr)] gap-6">
        {d.problems.length > 0 && <Alert className="border-warn/30 bg-warn-soft/50"><AlertTitle>有几处要看一下</AlertTitle><AlertDescription>{d.problems.join('；')}</AlertDescription></Alert>}
        {!d.exists && <Panel><EmptyNote>知识库里还没有 {d.base}/ 这个文件夹。在对话里让助理生成总助（第一次会问你三件事：叫它什么、怎么称呼你、喜欢它怎么说话），这里就会显示。</EmptyNote></Panel>}
        {d.exists && KINDS.map((k) => {
          const list = d.roles.filter((r) => r.kind === k.kind)
          return (
            <section key={k.kind} className="grid gap-3">
              <div className="flex flex-wrap items-baseline gap-x-2">
                <h2 className="text-[15px] font-semibold">{k.kind}{k.many && <span className="ml-1 text-sm font-normal text-muted-foreground">{list.length} 位</span>}</h2>
                <span className="text-xs text-muted-foreground">{k.tag} · {k.what}</span>
              </div>
              {list.length ? <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">{list.map((r) => <RoleCard key={r.folder} r={r} />)}</div>
                : <Panel><EmptyNote>还没有{k.kind}。在知识库 {d.base}/ 下建“{k.kind}-名字”文件夹（角色.md、规矩.md、记忆.md 三份），这里就会多一张卡。</EmptyNote></Panel>}
            </section>
          )
        })}
      </PageBody>
    </>
  )
}

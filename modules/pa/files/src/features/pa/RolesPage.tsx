// 助理：只读状态页（约定 v0.5 第 5 节）。知识库 01-关于我/助理/ 下一个助理一个文件夹（总助-小茶、内容-小红、分身-<名字>、合伙人-法务），
// 有几个列几个：总助一个，内容助理、分身、合伙人可以有多个。每个看三份文件（IDENTITY、SOUL、MEMORY）齐不齐、哪天更新、几行几条；
// 深版分身多一份底稿。USER.md（你是谁）所有助理共用一份。旧的中文名（角色、规矩、记忆）还认，标“旧格式”。不在这里改。
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
import type { Role, RoleFile, RoleKind, Roles, UserFile } from './types'

const KINDS: { kind: RoleKind; label: string; tag: string; what: string; many: boolean }[] = [
  { kind: '总助', label: '总助', tag: '懂我的事', what: '派活、汇总、写日报周报、巡查各个对话。只有一个。', many: false },
  { kind: '内容', label: '内容助理', tag: '懂我的账号', what: '出选题、写稿，写完放进内容页给我看；不替我发布。可以有好几个。', many: true },
  { kind: '分身', label: '分身', tag: '懂我这个人', what: '拿我说过的话和定过的目标，对照现在的我。可以有好几个。', many: true },
  { kind: '合伙人', label: '合伙人', tag: '懂我不懂的', what: '有专业、知道我全部情况的内部专家。专业意见都带一句“重大事项请真人专业人士复核”。', many: true },
]
/** 文件名旁边带的中文说法（约定 v0.5：对用户说的时候带上中文） */
const CALL: Record<string, string> = { IDENTITY: '它是谁', SOUL: '它怎么想、怎么做事', MEMORY: '它记住的事', 底稿: '深版分身的底稿' }
const WHAT: Record<string, string> = {
  IDENTITY: '名字、怎么称呼你、管什么不管什么。十行左右',
  SOUL: '怎么想、怎么说话、会说和绝不说的、什么时候反对你，加上做事的规矩五节。从 30 行起步，不超过 60 行',
  MEMORY: '一条一行，带日期：“- 2026-11-24｜规矩；原因”。超过 60 行让总助提议归并',
  底稿: '两千到五千字，写透这个人；不限行数，不算在三份里',
  角色: '旧格式：前两节要挪进 IDENTITY.md，后四节挪进 SOUL.md',
  规矩: '旧格式：整份挪进 SOUL.md 的后半',
  记忆: '旧格式：改名 MEMORY.md',
}
const md = (d?: string) => (d ? shortDate(d) : '')

/** 文件旁边的一行小字：更新日期，人设几行，记忆几条、从哪天记到哪天 */
function fileMeta(f: RoleFile): string {
  if (!f.exists) return '没有这份文件'
  const parts = [`更新 ${shortDate(f.updated)}`]
  if ((f.name === 'SOUL' || f.name === '角色' || f.name === '底稿') && f.lines !== undefined) parts.push(`正文 ${f.lines} 行`)
  if ((f.name === 'MEMORY' || f.name === '记忆') && f.entries !== undefined) {
    parts.push(`${f.entries} 条`)
    if (f.first) parts.push(f.first === f.last ? `记于 ${md(f.first)}` : `${md(f.first)} 到 ${md(f.last)}`)
  }
  return parts.join(' · ')
}

function RoleCard({ r }: { r: Role }) {
  const required = r.files.filter((f) => !f.optional)
  const n = required.filter((f) => f.exists).length
  const fix = r.problems.length + r.files.reduce((k, f) => k + f.problems.length, 0)
  return (
    <Panel title={<span className="flex flex-wrap items-baseline gap-x-2">{r.display || r.name}{r.display && r.display !== r.name && <span className="text-xs font-normal text-muted-foreground">{r.name}</span>}</span>}
      desc={`放在知识库 ${r.folder}/`}
      action={<StatusBadge value={r.legacy ? '旧格式' : n === 0 ? '还没生成' : n < 3 ? `缺 ${3 - n} 份` : fix ? `${fix} 处要改` : '三份都在'} tone={r.legacy || (n > 0 && (n < 3 || fix > 0)) ? 'warn' : n === 3 ? 'ok' : 'neutral'} />}>
      {r.problems.length > 0 && <p className="mb-3 rounded-lg bg-warn-soft px-3 py-2 text-xs text-warn">{r.problems.join('；')}</p>}
      <ul className="grid gap-2.5">
        {r.files.map((f) => (
          <li key={f.name} className="grid grid-cols-[1.25rem_minmax(0,1fr)] gap-2.5 text-sm">
            <span className={`mt-0.5 grid size-5 place-items-center rounded-full ${f.exists ? 'bg-ok-soft text-ok' : 'bg-muted text-muted-foreground'}`}>{f.exists ? <Check className="size-3.5" /> : <Minus className="size-3.5" />}</span>
            <span className="min-w-0">
              <span className="flex flex-wrap items-center gap-x-2">
                {f.exists ? <Link to={kbLink(f.path)} className="font-medium text-primary hover:underline">{f.name}.md</Link> : <span className="font-medium">{f.name}.md</span>}
                {CALL[f.name] && <span className="text-xs text-muted-foreground">{CALL[f.name]}</span>}
                <span className="text-xs text-muted-foreground">· {fileMeta(f)}</span>
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

/** USER.md：你是谁，所有助理共用一份，只有总助能写 */
function UserCard({ u }: { u: UserFile }) {
  return (
    <Panel title="USER.md · 你是谁" desc={`放在知识库 ${u.path}，所有助理共用一份；只有总助能写，先列出来、你确认才写`}
      action={<StatusBadge value={!u.exists ? '还没有' : u.problems.length ? `${u.problems.length} 处要改` : '在'} tone={!u.exists ? 'neutral' : u.problems.length ? 'warn' : 'ok'} />}>
      {u.exists
        ? <p className="text-sm"><Link to={kbLink(u.path)} className="font-medium text-primary hover:underline">打开 USER.md</Link><span className="ml-2 text-xs text-muted-foreground">更新 {shortDate(u.updated)}</span>{u.confirm && u.confirm !== '已确认' && <span className="ml-2"><StatusBadge value={u.confirm} tone="warn" /></span>}
          {u.problems.length > 0 && <span className="block text-xs text-warn">{u.problems.join('；')}</span>}</p>
        : <EmptyNote>还没有。让总助在对话里起草：你是谁、做什么生意，现在最看重的两三件事，你的边界，说话习惯，详细资料在哪。</EmptyNote>}
    </Panel>
  )
}

export default function RolesPage() {
  const { data: d, error, refetch } = useApi<Roles>('/m/pa/roles')
  const head = <PageHeader eyebrow="我的助理" title="助理" desc="角色文件放在知识库里，换工具带着走。一个助理一个文件夹，三份文件：IDENTITY（它是谁）、SOUL（它怎么想、怎么做事）、MEMORY（它记住的事）；USER（你是谁）大家共用一份。这一页只看齐不齐、哪天更新的；要生成或改，在对话里说。" />
  if (error && !d) return <>{head}<PageBody><Failed message={error.message} onRetry={() => refetch()} /></PageBody></>
  if (!d) return <>{head}<PageBody className="grid gap-4 lg:grid-cols-3"><Skeleton className="h-64" /><Skeleton className="h-64" /><Skeleton className="h-64" /></PageBody></>
  return (
    <>
      {head}
      <PageBody className="grid grid-cols-[minmax(0,1fr)] gap-6">
        {d.problems.length > 0 && <Alert className="border-warn/30 bg-warn-soft/50"><AlertTitle>有几处要看一下</AlertTitle><AlertDescription>{d.problems.join('；')}</AlertDescription></Alert>}
        <UserCard u={d.user} />
        {!d.exists && <Panel><EmptyNote>知识库里还没有 {d.base}/ 这个文件夹。在对话里让助理生成总助（第一次会问你三件事：叫它什么、怎么称呼你、喜欢它怎么说话），这里就会显示。</EmptyNote></Panel>}
        {d.exists && KINDS.map((k) => {
          const list = d.roles.filter((r) => r.kind === k.kind)
          return (
            <section key={k.kind} className="grid gap-3">
              <div className="flex flex-wrap items-baseline gap-x-2">
                <h2 className="text-[15px] font-semibold">{k.label}{k.many && <span className="ml-1 text-sm font-normal text-muted-foreground">{list.length} 位</span>}</h2>
                <span className="text-xs text-muted-foreground">{k.tag} · {k.what}</span>
              </div>
              {list.length ? <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">{list.map((r) => <RoleCard key={r.folder} r={r} />)}</div>
                : <Panel><EmptyNote>还没有{k.label}。在对话里让助理生成，或在知识库 {d.base}/ 下建“{k.kind}-名字”文件夹（IDENTITY.md、SOUL.md、MEMORY.md 三份），这里就会多一张卡。</EmptyNote></Panel>}
            </section>
          )
        })}
      </PageBody>
    </>
  )
}

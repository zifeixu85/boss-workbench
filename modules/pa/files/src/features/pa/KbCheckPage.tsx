// 知识库检测（约定 v0.6 第 9.6 节）：一屏说清三件事：现在就能用的页面；要先做升级检查才能用的页面，各缺什么；下一步对 AI 说哪一句。
// 工作台不替用户改知识库的结构，这一页只看、只说。驾驶舱上“你的知识库还差几步”点进来就是这里。
import { Link } from 'react-router'
import { Check, CircleAlert } from 'lucide-react'
import { useApi } from '@/lib/api'
import { PageHeader, PageBody, Panel } from '@/components/page'
import { StatusBadge } from '@/components/status'
import { Failed } from '@/components/chart-kit'
import { Skeleton } from '@/components/ui/skeleton'

type CheckPage = { id: string; label: string; status: '能用' | '要升级检查' | '还没建助理'; does: string; where?: string; need?: string; classes?: { name: string; folder: string; ok: boolean; why?: string; custom?: boolean }[] }
type Check = { root: string; exists: boolean; profile: { path: string | null; kind: string | null }; pages: CheckPage[]; ready: boolean; kbReady: boolean; says: { say: string; for: '知识库' | '助理' }[]; next: string }

const LINK: Record<string, string> = { progress: '/progress', outputs: '/outputs', roles: '/roles', reports: '/reports', confirm: '/' }

function Row({ p }: { p: CheckPage }) {
  const ok = p.status === '能用'
  const bad = (p.classes ?? []).filter((c) => !c.ok)
  return (
    <li className="grid grid-cols-[1.25rem_minmax(0,1fr)] gap-2.5 text-sm">
      <span className={`mt-0.5 grid size-5 place-items-center rounded-full ${ok ? 'bg-ok-soft text-ok' : p.status === '还没建助理' ? 'bg-muted text-muted-foreground' : 'bg-warn-soft text-warn'}`}>{ok ? <Check className="size-3.5" /> : <CircleAlert className="size-3.5" />}</span>
      <span className="min-w-0">
        <span className="flex flex-wrap items-baseline gap-x-2">
          {ok && LINK[p.id] ? <Link to={LINK[p.id]} className="font-medium text-primary hover:underline">{p.label}</Link> : <span className="font-medium">{p.label}</span>}
          <span className="text-xs text-muted-foreground">{p.does}{p.where ? ` · ${p.where}` : ''}</span>
        </span>
        {p.need && <span className={`block text-xs ${p.status === '还没建助理' ? 'text-muted-foreground' : 'text-warn'}`}>{p.status === '还没建助理' ? p.need : `缺：${p.need}`}</span>}
        {p.classes && p.classes.length > 0 && <span className="block text-xs text-muted-foreground">{p.classes.map((c) => `${c.name}${c.custom ? '（自定义）' : ''}${c.ok ? '' : `（${c.why}）`}`).join('、')}</span>}
        {ok && bad.length > 0 && <span className="block text-xs text-warn">有 {bad.length} 类对不上，其余照常能用</span>}
      </span>
    </li>
  )
}

export default function KbCheckPage() {
  const { data: d, error, refetch } = useApi<Check>('/m/pa/check')
  const head = <PageHeader eyebrow="我的助理" title="知识库检测" desc="按你的知识库档案看：现在就能用哪些页面，哪些要先做一次升级检查。这里只看，不改你的知识库。" />
  if (error && !d) return <>{head}<PageBody><Failed message={error.message} onRetry={() => refetch()} /></PageBody></>
  if (!d) return <>{head}<PageBody><Skeleton className="h-64" /></PageBody></>
  const ok = d.pages.filter((p) => p.status === '能用')
  const need = d.pages.filter((p) => p.status === '要升级检查')
  const helper = d.pages.filter((p) => p.status === '还没建助理')
  return (
    <>
      {head}
      <PageBody className="grid gap-4 lg:grid-cols-2">
        <Panel title="现在就能用" desc="待办、日程、收件箱这些不靠知识库，也都能用" action={<StatusBadge value={`${ok.length} 页`} tone="ok" />}>
          <ul className="grid gap-2.5">{ok.map((p) => <Row key={p.id} p={p} />)}</ul>
        </Panel>
        <Panel title="要先做升级检查才能用" desc={d.profile.path ? `档案：${d.profile.path}${d.profile.kind ? `（${d.profile.kind}）` : ''}` : '还没有知识库档案'}
          action={<StatusBadge value={need.length ? `${need.length} 页` : '没有'} tone={need.length ? 'warn' : 'ok'} />}>
          {need.length ? <ul className="grid gap-2.5">{need.map((p) => <Row key={p.id} p={p} />)}</ul> : <p className="text-sm text-muted-foreground">知识库这一半都对得上{d.kbReady ? '' : '；“我关注的”里有几类待确认或对不上，见左边'}。</p>}
        </Panel>
        {helper.length > 0 && (
          <Panel title="还没建助理" desc="助理和知识库是分开的：没有助理不是知识库的问题" className="lg:col-span-2">
            <ul className="grid gap-2.5">{helper.map((p) => <Row key={p.id} p={p} />)}</ul>
          </Panel>
        )}
        <Panel title="下一步" className="lg:col-span-2">
          {d.ready ? <p className="text-sm">结构对得上，不用做什么。</p> : (
            <div className="grid gap-2 text-sm">
              <p>可以先用能用的部分。</p>
              {d.says.map((x) => (
                <p key={x.say}>{x.for === '知识库' ? '想把知识库这一半也用起来' : '想用助理'}，在 Codex 里对 AI 说：
                  <span className="mx-1 rounded-md bg-accent px-2 py-0.5 font-medium text-accent-foreground">{x.say}</span>
                  {x.for === '知识库' ? '知识库工具会读你的结构、列出差异，你确认了才改。' : '会问你几件事，建好第一个总助。'}</p>
              ))}
              <p className="text-muted-foreground">做完回到这里，刷新就能看到变化。</p>
            </div>
          )}
          <p className="mt-2 text-xs text-muted-foreground">知识库：{d.root}</p>
        </Panel>
      </PageBody>
    </>
  )
}

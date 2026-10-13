// 新材料提取：左边选知识库收件箱里的一份（或粘贴），右边看原文、让本机 Codex 提取、改一改、确认写入。归属：大客户模块
// 地址栏：?file=00-收件箱/xxx.md 选中的材料；?paste=1 粘贴；?run=提取ID 看某一次提取的结果
// 第二轮：提取中每 1.5 秒问一次结果（原来计时器把轮询清掉了，页面卡住）；“再试一次”直接新建一次提取；Codex 用不了可以换成预先跑好的结果（如实标注）；
//         写入后能撤销；左栏跟着滚；手机上选中材料后左栏折成一行。
// 第四轮（产品评审 #1 #14、数据评审 #3 #12 #19）：左栏锁在 320 宽里（“最近提取过的”名字截短、状态和时间不换行），不再盖住右边；
//   原件里的聊天排成“时间 / 说话人 / 内容”三栏、用正文字体，标题日期写“10月26日”不断行；工作台按字面先标出要核对的几句；
//   等 Codex 的那几十秒显示它真做到哪一步（运行和等待的部分在 extract-run.tsx）。
import { useState } from 'react'
import { useSearchParams } from 'react-router'
import { ChevronDown, ClipboardPaste, FileText, History, Inbox, LoaderCircle, Sparkles, TriangleAlert, UserRound } from 'lucide-react'
import { useApi } from '@/lib/api'
import { ago } from '@/lib/format'
import { useIsMobile } from '@/hooks/use-mobile'
import { PageBody, PageHeader, SubTabs } from '@/components/page'
import { StatusBadge } from '@/components/status'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import { ClientChoice } from '@/components/form'
import { CLIENT_TABS } from '@/features/clients/ClientsPage'
import { cn } from '@/lib/utils'
import { MaterialView, NiceTitle } from './extract-parts'
import { HintList, RunView } from './extract-run'
import { startPrepared, startRun } from './extract-api'
import type { CodexInfo, Extraction, ExtractionBrief, Hint, InboxFile } from './types'
import { useIdentity } from '@/lib/identity'

const RUN_TONE: Record<string, 'info' | 'warn' | 'ok' | 'danger' | 'neutral'> = { 提取中: 'info', 待确认: 'warn', 已写入: 'ok', 超时: 'warn', 出错: 'danger', 不可用: 'danger', 放弃: 'neutral' }
const SHOWN = new Set(['提取中', '待确认', '已写入'])
const shortName = (p: string) => p.split('/').pop()!.replace(/\.md$/, '').replace(/^\d{4}-\d{2}-\d{2}-/, '')

export default function ExtractPage() {
  const [sp, setSp] = useSearchParams()
  const mobile = useIsMobile()
  const [listOpen, setListOpen] = useState(false)
  const files = useApi<InboxFile[]>('/crm/materials')
  const codex = useApi<CodexInfo>('/crm/codex')
  const history = useApi<ExtractionBrief[]>('/crm/extractions')
  const paste = sp.get('paste') === '1'
  const runParam = sp.get('run')
  const fromRun = runParam ? history.data?.find((h) => h.id === runParam)?.source_path ?? null : null
  const file = sp.get('file') ?? fromRun ?? (paste || runParam ? null : files.data?.find((f) => f.client_id && f.extraction?.status !== '已写入')?.path ?? files.data?.[0]?.path ?? null)
  const current = files.data?.find((f) => f.path === file) ?? null
  // 选中一份材料时：最近那次是“提取中 / 待确认 / 已写入”就直接打开；超时、出错、放弃的不自动打开（回到原件，能再提取）
  const runId = runParam ?? (current?.extraction && SHOWN.has(current.extraction.status) ? current.extraction.id : null)
  const go = (p: Record<string, string | null>) => { setListOpen(false); setSp((prev) => { const n = new URLSearchParams(prev); for (const [k, v] of Object.entries(p)) { if (v === null) n.delete(k); else n.set(k, v) } return n }, { replace: true }) }
  const picked = !!(file || paste || runParam)
  const collapsed = mobile && picked && !listOpen
  return (
    <>
      <PageHeader eyebrow="客户" title="新材料提取"
        desc="聊天记录、通话纪要丢进知识库的收件箱后，在这里让 Codex 提取：你答应的、对方的状态、顾虑、怎么定（谁拍板、哪天定）、下一步。和判断规则对不上的标黄；你确认了才写进工作台。">
        <SubTabs items={CLIENT_TABS} />
      </PageHeader>
      <PageBody className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-[320px_minmax(0,1fr)]">
        {collapsed ? (
          <button type="button" onClick={() => setListOpen(true)} className="flex min-w-0 items-center gap-2 rounded-xl border bg-card px-4 py-3 text-left shadow-paper">
            <FileText className="size-4 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1"><span className="block text-[12px] text-muted-foreground">当前材料</span><span className="block truncate text-[13.5px] font-medium">{paste ? '粘贴一段聊天或纪要' : current ? <NiceTitle title={current.title} /> : file ? shortName(file) : '粘贴的文字'}</span></span>
            <ChevronDown className="size-4 text-muted-foreground" />
          </button>
        ) : (
          <aside className="grid min-w-0 grid-cols-[minmax(0,1fr)] content-start gap-4 lg:sticky lg:top-[calc(var(--sticky-top)+1rem)] lg:self-start">
            <section className="min-w-0 rounded-xl border bg-card shadow-paper">
              <div className="flex items-center gap-2 border-b px-4 py-3"><Inbox className="size-4 text-muted-foreground" /><h2 className="text-[14px] font-semibold">知识库收件箱</h2><span className="ml-auto text-xs text-muted-foreground">按日期，旧的在前</span></div>
              <div className="grid grid-cols-[minmax(0,1fr)] gap-1 p-2">
                {files.isLoading ? <Skeleton className="h-40" /> : files.error ? <p className="p-3 text-sm text-muted-foreground">没读到收件箱：{files.error.message}</p> : !files.data?.length ? <p className="p-3 text-sm text-muted-foreground">收件箱是空的。聊天、纪要丢进知识库的 00-收件箱 就会出现在这里。</p> : files.data.map((f) => (
                  <button key={f.path} onClick={() => go({ file: f.path, run: null, paste: null })}
                    className={cn('grid min-w-0 gap-1 rounded-lg px-3 py-2.5 text-left transition-colors', f.path === file && !paste ? 'bg-accent ring-1 ring-primary/30' : 'hover:bg-muted/60')}>
                    <span className="flex min-w-0 items-start gap-2"><FileText className="mt-0.5 size-4 shrink-0 text-muted-foreground" /><NiceTitle title={f.title} className="min-w-0 flex-1 text-[13.5px] leading-snug font-medium" /></span>
                    <span className="flex flex-wrap items-center gap-1.5 pl-6 text-[12px] text-muted-foreground">
                      {f.client_name ? <span className="inline-flex items-center gap-1"><UserRound className="size-3" />{f.client_name}</span> : <StatusBadge value="说话人不明" tone="warn" />}
                      {f.extraction ? <StatusBadge value={f.extraction.status === '待确认' ? '提取了，待确认' : f.extraction.status} tone={RUN_TONE[f.extraction.status]} /> : f.in_kb ? <StatusBadge value="已整理进知识库" tone="ok" /> : <StatusBadge value="还没提取" tone="neutral" />}
                      {f.recorder && <span className="w-full truncate">{f.recorder}</span>}
                    </span>
                  </button>
                ))}
                <button onClick={() => go({ paste: '1', file: null, run: null })} className={cn('flex items-center gap-2 rounded-lg px-3 py-2.5 text-left text-[13.5px] transition-colors', paste ? 'bg-accent ring-1 ring-primary/30' : 'text-muted-foreground hover:bg-muted/60')}>
                  <ClipboardPaste className="size-4" />粘贴一段聊天或纪要
                </button>
              </div>
            </section>
            <CodexCard info={codex.data} />
            {!!history.data?.length && (
              <section className="min-w-0 rounded-xl border bg-card p-2 shadow-paper">
                <h2 className="flex items-center gap-1.5 px-2 pt-1.5 pb-1 text-[12.5px] font-semibold text-muted-foreground"><History className="size-3.5" />最近提取过的</h2>
                {history.data.slice(0, 6).map((h) => (
                  <button key={h.id} onClick={() => go({ run: h.id, file: h.source_path, paste: h.source_path ? null : '1' })} className={cn('flex w-full min-w-0 items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-[12.5px] hover:bg-muted/60', h.id === runId && 'bg-muted')}>
                    <span className="min-w-0 flex-1 truncate">{h.client_name ?? '没选客户'} · {h.source_path ? shortName(h.source_path).split('-').pop() : '粘贴的文字'}</span>
                    {(h.engine ?? '').startsWith('预先') && <span className="shrink-0 rounded border px-1 text-[12px] text-muted-foreground">事先跑的</span>}
                    <StatusBadge value={h.status} tone={RUN_TONE[h.status]} className="shrink-0" />
                    <span className="shrink-0 text-[12px] whitespace-nowrap text-muted-foreground">{ago(h.started_at)}</span>
                  </button>
                ))}
              </section>
            )}
          </aside>
        )}
        <div className="min-w-0">
          {runId ? <RunView id={runId} onStarted={(id) => go({ run: id })} onBack={(p) => go({ run: null, ...(p ? { file: p } : {}) })} />
            : paste ? <PasteStart onStarted={(id) => go({ run: id })} codex={codex.data} />
              : file ? <FileStart file={current} path={file} codex={codex.data} onStarted={(id) => go({ run: id })} />
                : <p className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">左边选一份材料，或者粘贴一段聊天。</p>}
        </div>
      </PageBody>
    </>
  )
}

function CodexCard({ info }: { info?: CodexInfo }) {
  if (!info) return null
  return (
    <section className={cn('min-w-0 rounded-xl border px-4 py-3 text-[12.5px] leading-relaxed', info.available ? 'bg-card text-muted-foreground' : 'border-danger/30 bg-danger-soft text-danger')}>
      <div className="flex items-center gap-1.5 font-medium text-foreground"><Sparkles className="size-3.5 text-info" />谁来提取</div>
      {info.available
        ? <p className="mt-1">这台电脑上的 Codex 来读：只能看、不能改文件，最多等 {info.timeout_s} 秒，超时会直说。一般要半分钟到一分多钟。</p>
        : <p className="mt-1">这台电脑上没找到 Codex，现在提取不了。装好 Codex App 再试；有事先跑好结果的材料可以先用那份；也可以先“记一笔跟进”手动记。</p>}
    </section>
  )
}

function FileStart({ file, path, codex, onStarted }: { file: InboxFile | null; path: string; codex?: CodexInfo; onStarted: (id: string) => void }) {
  const doc = useApi<{ body: string; hints: Hint[] }>(`/crm/materials/file?path=${encodeURIComponent(path)}`)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const run = (fn: () => Promise<Extraction>) => { setBusy(true); setErr(null); fn().then((x) => onStarted(x.id)).catch((e: Error) => setErr(e.message)).finally(() => setBusy(false)) }
  const last = file?.extraction && !SHOWN.has(file.extraction.status) ? file.extraction : null
  const hints = doc.data?.hints ?? []
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
      <section className="min-w-0 rounded-xl border bg-card shadow-paper">
        <header className="grid gap-3 border-b px-5 py-3.5 sm:flex sm:flex-wrap sm:items-center">
          <div className="min-w-0 flex-1">
            <h2 className="text-[15px] font-semibold">{file ? <NiceTitle title={file.title} /> : shortName(path)}</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">知识库原件 · 只读，原样保存{file?.client_name ? ` · 看着是 ${file.client_name} 的（${file.guess_why}）` : file ? ` · ${file.guess_why}` : ''}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {codex?.available === false && file?.prepared && <Button variant="outline" disabled={busy} onClick={() => run(() => startPrepared(path))}>用事先跑好的结果</Button>}
            <Button disabled={busy || codex?.available === false} onClick={() => run(() => startRun({ source_path: path }))}>{busy ? <LoaderCircle className="animate-spin" /> : <Sparkles />}让 Codex 提取</Button>
          </div>
        </header>
        {last && <p className="border-b bg-warn-soft/60 px-5 py-2 text-[12.5px] text-warn">上次（{ago(last.started_at)}）{last.status === '放弃' ? '提取完没要' : `没提取成：${last.status}`}，什么都没写。可以再提取一次。</p>}
        <div className="max-h-[60vh] overflow-y-auto px-5 py-4">
          {doc.data ? <MaterialView body={doc.data.body} path={path} highlight={hints.map((h) => h.line)} /> : doc.error ? <p className="text-sm text-muted-foreground">{doc.error.message}</p> : <Skeleton className="h-48" />}
        </div>
      </section>
      {hints.length > 0 && <HintList hints={hints} />}
      {err && <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{err}</p>}
      {file && !file.client_id && <p className="flex items-start gap-2 rounded-lg border border-warn/30 bg-warn-soft px-3 py-2 text-[13px] text-warn"><TriangleAlert className="mt-0.5 size-4 shrink-0" />这份材料没写是谁。Codex 提取后你要自己选客户；对不上号的先问清楚，不往任何客户档案里写。</p>}
    </div>
  )
}

function PasteStart({ onStarted, codex }: { onStarted: (id: string) => void; codex?: CodexInfo }) {
  const { owner } = useIdentity()
  const [text, setText] = useState('')
  const [client, setClient] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const enough = text.replace(/\s/g, '').length >= 20
  const start = () => { setBusy(true); setErr(null); startRun({ text, client_id: client }).then((x) => onStarted(x.id)).catch((e: Error) => setErr(e.message)).finally(() => setBusy(false)) }
  return (
    <section className="grid min-w-0 gap-3 rounded-xl border bg-card p-5 shadow-paper">
      <h2 className="text-[15px] font-semibold">粘贴一段聊天或纪要</h2>
      <p className="-mt-1 text-xs text-muted-foreground">写清每句是谁说的、几点说的。粘贴的原文只存在工作台的提取记录里，不写进知识库；要长期留着的，丢进知识库的 00-收件箱。不要粘密码、手机号、地址。</p>
      <Textarea rows={12} value={text} onChange={(e) => setText(e.target.value)} placeholder={`14:02 客户：${owner}下午好，跟您同步一下这次的事\n14:03 客户：……\n14:11 ${owner}：……`} />
      <div className="flex flex-wrap items-center gap-2">
        <div className="w-full sm:w-64"><ClientChoice kind="客户" value={client} onChange={setClient} /></div>
        <span className="text-xs text-muted-foreground">{text.trim() && !enough ? '再多贴一点（至少 20 个字）：谁、哪天、说了什么' : '知道是谁就选上；不选，Codex 会猜，拿不准会说。'}</span>
        <Button className="ml-auto" disabled={busy || !enough || codex?.available === false} onClick={start}>{busy ? <LoaderCircle className="animate-spin" /> : <Sparkles />}让 Codex 提取</Button>
      </div>
      {err && <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{err}</p>}
    </section>
  )
}


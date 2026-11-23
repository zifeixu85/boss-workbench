// 一次对话的详情（右侧抽屉）：标题、在哪个文件夹、哪个工具、状态和推断的依据；可以打开对话、标已看、手动改状态、手动归到某个对象。
// 这里没有对话内容：工作台只存了标题、第一句的摘要、时间和写文件的路径。
import { Link } from 'react-router'
import { api, useApi, useWrite } from '@/lib/api'
import { DetailSheet, SheetSection } from '@/components/sheet-shell'
import { ReadRow } from '@/components/detail-parts'
import { Choice } from '@/components/form'
import { EmptyNote } from '@/components/chart-kit'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { OpenSession, SESSION_STATUSES, SessionBadge, when } from './parts'
import type { Session } from './types'

const AUTO = 'auto'
const TITLE_FROM: Record<string, string> = { 索引: 'Codex 自己起的标题', 文件: '对话记录里的标题', 桌面版: 'Claude 桌面版里的标题', 第一句: '没有标题，用的是你说的第一句' }

export function SessionSheet({ id, objects, onClose }: { id: string | null; objects: { path: string; name: string; type: string }[]; onClose: () => void }) {
  const base = id ? `/m/pa/sessions/${encodeURIComponent(id)}` : null
  const { data: s, error } = useApi<Session>(base)
  const read = useWrite(() => api.post(`${base}/read`, {}), '标成已看了')
  const status = useWrite((v: string | null) => api.post(`${base}/status`, { status: v }), '状态改好了')
  const object = useWrite((v: string | null) => api.post(`${base}/object`, { path: v }), '归好了')
  return (
    <DetailSheet open={!!id} onClose={onClose} eyebrow="对话" title={s?.title}
      meta={s && <><SessionBadge s={s} /><span>{s.tool_name}{s.kind !== '对话' ? ` · ${s.kind}` : ''}</span><span>最后活动 {when(s.last_at)}</span></>}
      actions={s && <><OpenSession s={s} />{s.status === '做完未读' && <Button size="sm" onClick={() => read.mutate(undefined)}>标成已看</Button>}</>}>
      {error && !s && <EmptyNote>没读到这次对话：{error.message}</EmptyNote>}
      {!s && !error && <div className="grid gap-3"><Skeleton className="h-16" /><Skeleton className="h-40" /></div>}
      {s && (
        <>
          <SheetSection title="状态">
            <p className="mb-3 rounded-lg bg-muted px-3.5 py-3 text-sm leading-relaxed">{s.inferred ? '推断：' : ''}{s.why}。{s.inferred && '不对的话在下面改；对话之后又有新动静时，会重新按推断来。'}</p>
            <Choice value={s.manual ? s.status : AUTO} onChange={(v) => status.mutate(!v || v === AUTO ? null : v)}
              options={[{ value: AUTO, label: s.inferred ? '按推断来' : '按应用自己的记录来' }, ...SESSION_STATUSES.map((k) => ({ value: k, label: `改成：${k}` }))]} />
          </SheetSection>

          <SheetSection title="归到哪个对象">
            <p className="mb-3 text-sm text-muted-foreground">{s.object ? `现在归在「${s.object.type} · ${s.object.name}」，是按${s.object.by}认的。` : '现在没归到任何对象。'}手动指的只记在工作台里，不改知识库。</p>
            <Choice value={s.object?.by === '手动' ? s.object.path : AUTO} onChange={(v) => object.mutate(!v || v === AUTO ? null : v)}
              options={[{ value: AUTO, label: '自动认（按文件夹、名字）' }, ...objects.map((o) => ({ value: o.path, label: `${o.type} · ${o.name}` })), { value: '-', label: '不归类' }]} />
          </SheetSection>

          <SheetSection title="这次对话">
            <dl>
              <ReadRow label="标题来源">{TITLE_FROM[s.title_from] ?? '—'}</ReadRow>
              {s.first && s.first !== s.title && <ReadRow label="第一句">{s.first}</ReadRow>}
              <ReadRow label="所在文件夹"><span className="break-all">{s.cwd || '—'}</span></ReadRow>
              <ReadRow label="开始">{when(s.started_at)}</ReadRow>
              <ReadRow label="你说了几轮">{s.turns || '—'}</ReadRow>
              <ReadRow label="产出">{s.outputs ? <Link className="text-primary hover:underline" to={`/outputs?session=${encodeURIComponent(s.id)}`}>{s.outputs} 个文件或图片</Link> : '没有记到写文件的动作'}</ReadRow>
              {s.resume && <ReadRow label="接着聊"><code className="rounded bg-muted px-1.5 py-0.5 text-xs break-all">{s.resume}</code></ReadRow>}
            </dl>
            <p className="mt-3 text-xs text-muted-foreground">{s.link ? `“在 ${s.tool_name} 里打开”用的是 ${s.tool === 'codex' ? 'codex://' : 'claude://'} 链接，要这台电脑装着${s.tool === 'codex' ? ' Codex' : ' Claude'} 桌面版。` : '这个对话不是在桌面版里开的，没有能直接跳回去的链接：到上面那个文件夹里，在终端运行“接着聊”那条命令。'}</p>
          </SheetSection>
        </>
      )}
    </DetailSheet>
  )
}

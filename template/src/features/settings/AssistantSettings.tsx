// 设置 → AI 助手（2026-10-15）：本机 Codex 找没找到、登没登录，开关，和它能做什么、不做什么
import { CircleAlert, CircleCheck } from 'lucide-react'
import { api, useApi, useWrite } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'

type Status = { ready: boolean; version: string | null; detail: string; fix: string | null; on: boolean }

export function AssistantSettings() {
  const { data, refetch } = useApi<Status>('/assistant/status')
  const save = useWrite((on: boolean) => api.patch('/settings', { assistant_on: on ? '1' : '0' }), 'AI 助手设置已保存')
  if (!data) return <p className="text-sm text-muted-foreground">检查本机 Codex…</p>
  return (
    <div className="grid gap-4">
      <div className="flex items-start gap-3">
        {data.ready ? <CircleCheck className="mt-0.5 size-5 shrink-0 text-ok" /> : <CircleAlert className="mt-0.5 size-5 shrink-0 text-warn" />}
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium">{data.detail}</div>
          {data.fix && <div className="mt-0.5 text-[13px] text-muted-foreground">{data.fix}</div>}
        </div>
        <Button size="sm" variant="outline" onClick={() => api.get('/assistant/status?refresh=1').then(() => refetch())}>重新检查</Button>
      </div>
      <label className="flex items-center gap-3 border-t pt-4">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium">每页右边的 AI 助手</div>
          <div className="text-xs text-muted-foreground">按 ⌘J（Windows 是 Ctrl+J）或右下角按钮打开。关掉后按钮还在，点开会提示到这里打开</div>
        </div>
        <Switch checked={data.on} disabled={save.isPending} aria-label="AI 助手" onCheckedChange={(c) => save.mutate(c)} />
      </label>
      <ul className="grid gap-1.5 border-t pt-4 text-[13px] text-muted-foreground">
        <li>· 用你自己电脑上的 Codex 和你的账号，资料不经过别的服务器。</li>
        <li>· 能读写工作台（待办、日程、项目、收件箱、客户跟进）和读知识库；它写的东西记在“最近改动”里，操作人是 Codex。</li>
        <li>· 报价、合同、收款、答应别人的事、改客户阶段，它会先问你。不发消息、不付款、不删东西。</li>
        <li>· 不用页面里的助手也可以：在 Codex 里直接说，它用同一套命令读写，页面会自动刷新。</li>
      </ul>
    </div>
  )
}

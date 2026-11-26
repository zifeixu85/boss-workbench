// 设置 → AI 助手（2026-10-15）：本机 Codex 找没找到、登没登录，页面里的对话栏的开关（默认关），和它能做什么、不做什么。
// 常驻对话的开关只在装了内嵌 Codex 模块时出现（2026-11-26）。日常用法是在 Codex 里说、工作台开在右侧面板（2026-11-12）；页面里的对话栏是可选的
import { CircleAlert, CircleCheck } from 'lucide-react'
import { api, useApi, useWrite } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'

type Status = { ready: boolean; version: string | null; detail: string; fix: string | null; on: boolean; engine?: 'simple' | 'codex'; persistent?: boolean }

export function AssistantSettings() {
  const { data, refetch } = useApi<Status>('/assistant/status')
  const save = useWrite((on: boolean) => api.patch('/settings', { assistant_on: on ? '1' : '0' }), 'AI 助手设置已保存')
  const engine = useWrite((codex: boolean) => api.patch<{ assistant_engine?: string }>('/settings', { assistant_engine: codex ? 'codex' : 'simple' }), (o) => (o.assistant_engine === 'codex' ? '换成常驻对话了：和在 Codex 里对话一样' : '换回一问一答了'))
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
          <div className="text-sm font-medium">页面里的 AI 助手</div>
          <div className="text-xs text-muted-foreground">默认关着。打开后每页右下角多一个按钮，也可以按 ⌘J（Windows 是 Ctrl+J）</div>
        </div>
        <Switch checked={data.on} disabled={save.isPending} aria-label="AI 助手" onCheckedChange={(c) => save.mutate(c)} />
      </label>
      {/* 装了内嵌 Codex 模块才有这个开关（没装就不出现：说“工作台装上内嵌 Codex”） */}
      {data.on && data.persistent && (
        <label className="flex items-center gap-3 border-t pt-4">
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium">常驻对话（内嵌 Codex）</div>
            <div className="text-xs text-muted-foreground">打开后和在 Codex 里开一个对话一样：用你的插件、技能和规矩，看得到你在看的页面和选中的字，能接着聊；对话也记在你的 Codex 里。Codex 要问“是否允许”时会弹在对话栏里。关掉是一问一答。</div>
          </div>
          <Switch checked={data.engine === 'codex'} disabled={engine.isPending} aria-label="常驻对话" onCheckedChange={(c) => engine.mutate(c)} />
        </label>
      )}
      <ul className="grid gap-1.5 border-t pt-4 text-[13px] text-muted-foreground">
        <li>· 使用本机 Codex 和你的账号。文件保存在本机，AI 处理时会把用到的内容发给模型服务商。</li>
        <li>· 能读写工作台（待办、日程、项目、收件箱、客户跟进）和读知识库；它写的东西记在“最近改动”里，操作人是 Codex。</li>
        <li>· 报价、合同、收款、答应别人的事、改客户阶段，它会先问你。不发消息、不付款、不删东西。</li>
        <li>· 平时不用开它：在 Codex 里直接说就行，工作台会开在 Codex 右边，读写的是同一份数据，页面自动刷新。</li>
      </ul>
    </div>
  )
}

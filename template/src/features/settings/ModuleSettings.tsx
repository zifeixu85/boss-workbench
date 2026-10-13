// 设置页的“模块”：每个模块一个开关。关掉只是从导航、今日页、提醒里收起来，代码和数据都留着（规则见 shared/modules.ts、server/services/modules.ts）。
import type { Settings } from '@/lib/types'
import { api, useWrite } from '@/lib/api'
import { MODULES, moduleName } from '@/lib/modules'
import { Switch } from '@/components/ui/switch'

export function ModuleSettings({ settings }: { settings: Settings }) {
  const on = settings.modules ?? MODULES.map((m) => m.id)
  const save = useWrite(
    (p: { id: string; open: boolean }) => api.patch('/modules', p.open ? { on: [p.id] } : { off: [p.id] }),
    '模块已更新',
  )
  return (
    <div className="grid gap-x-8 sm:grid-cols-2">
      {MODULES.map((m) => {
        const checked = on.includes(m.id)
        const note = m.required ? '一定开着' : m.needs?.length ? `打开时会带上${m.needs.map(moduleName).join('、')}` : null
        return (
          <label key={m.id} className="flex items-center gap-3 border-b py-3 last:border-b-0 sm:[&:nth-last-child(2)]:border-b-0">
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium">{m.name}</div>
              {note && <div className="text-xs text-muted-foreground">{note}</div>}
            </div>
            <Switch checked={checked} disabled={m.required || save.isPending} aria-label={m.name}
              onCheckedChange={(c) => save.mutate({ id: m.id, open: c })} />
          </label>
        )
      })}
    </div>
  )
}

// 路由守门（模块开关，shared/modules.ts）：模块没打开时不显示页面，说明怎么打开。代码和数据都还在。
import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { useModules, moduleName } from '@/lib/modules'
import { Button } from '@/components/ui/button'

export function ModuleGate({ id, children }: { id: string; children: ReactNode }) {
  const m = useModules()
  if (!m.ready || m.on(id)) return <>{children}</>
  const name = moduleName(id)
  return (
    <div className="p-10 text-center">
      <h1 className="font-heading text-2xl">“{name}”还没打开</h1>
      <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
        这个模块收起来了，代码和数据都还在。要用的话，在“设置”的“模块”里打开，或者对 Codex 说“工作台打开{name}”。
      </p>
      <div className="mt-4 flex justify-center gap-2">
        <Button variant="outline" asChild><Link to="/settings">去设置</Link></Button>
        <Button asChild><Link to="/">回到今日</Link></Button>
      </div>
    </div>
  )
}

// 设置：导航样式、基本信息、数据放在哪里、快捷键
import type { Settings } from '@/lib/types'
import { useApi } from '@/lib/api'
import { fullDate } from '@/lib/format'
import { PageBody, PageHeader, Panel } from '@/components/page'
import { Skeleton } from '@/components/ui/skeleton'
import { NavStylePicker } from './NavStylePicker'
import { MobileNavPicker, ThemePicker } from './LookPickers'
import { BasicInfoForm, DataLocations, Shortcuts } from './sections'

export default function SettingsPage() {
  const { data, error } = useApi<Settings>('/settings')
  return (
    <>
      <PageHeader eyebrow="系统" title="设置" desc="风格、导航、怎么称呼你，以及数据都放在哪里。" />
      <PageBody className="grid max-w-5xl gap-5">
        {error && <p className="rounded-lg bg-danger-soft px-4 py-3 text-sm text-danger">设置没取到：{error.message}。确认本地服务开着，再刷新一下页面。</p>}
        {data?.demo && (
          <p className="rounded-lg border border-primary/25 bg-accent/50 px-4 py-3 text-[13px] leading-relaxed text-accent-foreground">
            演示日期：现在按 <b className="num">{data.today ? fullDate(data.today) : "—"}</b> 算“今天”，所有页面的数都按这一天对齐。换回真实日期：让 Codex 关掉演示日期、重启工作台。
          </p>
        )}
        <Panel title="风格" desc="颜色、字体一起换。建台时可以按行业推荐一个，之后随时换">
          <ThemePicker value={data?.theme} />
        </Panel>
        <Panel title="电脑上的导航" desc="三种布局，选好马上生效。规则：左侧菜单已有子页面时，页面里不再重复放切换标签">
          <NavStylePicker value={data?.nav_mode} />
        </Panel>
        <Panel title="手机上的导航" desc="手机或窄窗口时生效">
          <MobileNavPicker value={data?.mobile_nav} />
        </Panel>
        <Panel title="基本信息">
          {data ? <BasicInfoForm key={`${data.owner}|${data.business}`} settings={data} /> : <div className="grid gap-4 sm:grid-cols-2"><Skeleton className="h-16" /><Skeleton className="h-16" /></div>}
        </Panel>
        <div className="grid gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:items-start">
          <Panel title="数据在哪里" desc="都是普通文件，放在你自己的电脑上">
            <DataLocations />
          </Panel>
          <Panel title="快捷键">
            <Shortcuts />
          </Panel>
        </div>
      </PageBody>
    </>
  )
}

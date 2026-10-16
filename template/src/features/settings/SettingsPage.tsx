// 设置：我的资料、风格、导航样式、模块开关、提醒、数据放在哪里、快捷键
import type { Settings } from '@/lib/types'
import { useApi } from '@/lib/api'
import { fullDate } from '@/lib/format'
import { PageBody, PageHeader, Panel } from '@/components/page'
import { Skeleton } from '@/components/ui/skeleton'
import { NavStylePicker } from './NavStylePicker'
import { MobileNavPicker, ThemePicker } from './LookPickers'
import { DataLocations, Shortcuts } from './sections'
import { ProfilePanel } from './ProfilePanel'
import { AssistantSettings } from './AssistantSettings'
import { ReminderSettings } from './ReminderSettings'
import { ModuleSettings } from './ModuleSettings'

export default function SettingsPage() {
  const { data, error } = useApi<Settings>('/settings')
  return (
    <>
      <PageHeader className="max-w-5xl" eyebrow="系统" title="设置" desc="你的资料、风格、导航、什么时候提醒你，以及数据都放在哪里。" />
      <PageBody className="grid max-w-5xl gap-5">
        {error && <p className="rounded-lg bg-danger-soft px-4 py-3 text-sm text-danger">设置没取到：{error.message}。确认本地服务开着，再刷新一下页面。</p>}
        {data?.demo && (
          <p className="rounded-lg border border-primary/25 bg-accent/50 px-4 py-3 text-[13px] leading-relaxed text-accent-foreground">
            演示日期：现在按 <b className="num">{data.today ? fullDate(data.today) : "—"}</b> 算“今天”，所有页面的数都按这一天对齐。换回真实日期：让 Codex 关掉演示日期、重启工作台。
          </p>
        )}
        <section id="profile" className="scroll-mt-20"><Panel title="我的资料" desc="怎么称呼你、工作台叫什么，以及 AI 读到的你">
          {data ? <ProfilePanel settings={data} /> : <div className="grid gap-4 sm:grid-cols-2"><Skeleton className="h-16" /><Skeleton className="h-16" /></div>}
        </Panel></section>
        <Panel title="AI 助手" desc="每页右边的对话栏，用你电脑上的 Codex 读写工作台">
          <AssistantSettings />
        </Panel>
        <Panel title="风格" desc="颜色、字体一起换。建台时可以按行业推荐一个，之后随时换">
          <ThemePicker value={data?.theme} />
        </Panel>
        <Panel title="电脑上的导航" desc="三种布局，选好马上生效。规则：左侧菜单已有子页面时，页面里不再重复放切换标签">
          <NavStylePicker value={data?.nav_mode} />
        </Panel>
        <Panel title="手机上的导航" desc="手机或窄窗口时生效">
          <MobileNavPicker value={data?.mobile_nav} />
        </Panel>
        <Panel title="模块" desc="关掉的模块从导航、今日页和提醒里收起来，代码和数据都留着，随时能打开">
          {data ? <ModuleSettings settings={data} /> : <Skeleton className="h-48" />}
        </Panel>
        <Panel title="提醒" desc="待办到期前 1 小时、日程开始前 15 分钟、该跟进的客户、数据异常、每天看汇总。页面关着时由电脑系统通知提醒，电脑要开着、不合盖">
          {data ? <ReminderSettings key={JSON.stringify(data.reminders ?? {})} settings={data} /> : <Skeleton className="h-48" />}
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

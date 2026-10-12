// 页面登记。每个页面按需加载（日历、图表这些大组件只在用到时下载）
// 4 个业务模块的页面在各自的 features 文件夹里：经营 biz、小红书 content、数据源与导入 data、大客户 crm（客户列表和抽屉在 clients）
import { lazy, Suspense, type ComponentType } from 'react'
import { createBrowserRouter, Link, Navigate } from 'react-router'
import { AppShell, EmbedShell } from './AppShell'
import { Skeleton } from '@/components/ui/skeleton'

const page = <P extends object>(load: () => Promise<{ default: ComponentType<P> }>) => {
  const C = lazy(load)
  return (props: P) => (
    <Suspense fallback={<div className="grid gap-3 p-7"><Skeleton className="h-9 w-48" /><Skeleton className="h-40" /><Skeleton className="h-64" /></div>}>
      <C {...props} />
    </Suspense>
  )
}

// 公共
const Today = page(() => import('@/features/today/TodayPage'))
const Calendar = page(() => import('@/features/calendar/CalendarPage'))
const Todos = page(() => import('@/features/todos/TodosPage'))
const Projects = page(() => import('@/features/projects/ProjectsPage'))
const Inbox = page(() => import('@/features/inbox/InboxPage'))
const Reminders = page(() => import('@/features/reminders/RemindersPage')) // 提醒（10-12）
const Kb = page(() => import('@/features/kb/KbPage'))
const SettingsPage = page(() => import('@/features/settings/SettingsPage'))
const Design = page(() => import('@/features/design/DesignPage'))
// 客户与跟进（大客户模块）
const Clients = page(() => import('@/features/clients/ClientsPage'))
const Follow = page(() => import('@/features/clients/FollowPage'))
const Pipeline = page(() => import('@/features/clients/PipelinePage'))
const Receivables = page(() => import('@/features/clients/ReceivablesPage'))
const ClientPage = page(() => import('@/features/clients/ClientPage'))
const KeyAccounts = page(() => import('@/features/crm/KeyAccountsPage'))
const Care = page(() => import('@/features/crm/CarePage')) // 关怀与回访（E5）
const Extract = page(() => import('@/features/crm/ExtractPage')) // 新材料提取（E5）
// 经营
const BizSummary = page(() => import('@/features/biz/BizSummaryPage'))
const Channel = page(() => import('@/features/biz/ChannelPage'))
// 小红书内容中心（今天 / 内容 / 创作 / 数据 / 复盘；旧地址 /content/schedule、/content/notes 跳到新页）
const XhsToday = page(() => import('@/features/content/TodayPage'))
const XhsPieces = page(() => import('@/features/content/PiecesPage'))
const XhsStudio = page(() => import('@/features/content/StudioPage'))
const XhsData = page(() => import('@/features/content/DataPage'))
const XhsReview = page(() => import('@/features/content/ReviewPage'))
// 数据源与导入
const Sources = page(() => import('@/features/data/SourcesPage'))
const Imports = page(() => import('@/features/data/ImportsPage'))
const ImportHistory = page(() => import('@/features/data/ImportHistoryPage'))
const ImportRules = page(() => import('@/features/data/ImportRulesPage'))

function NotFound() {
  return <div className="p-10 text-center"><h1 className="font-heading text-2xl">这个页面不存在</h1><p className="mt-2 text-sm text-muted-foreground">可能是模块没有安装，或者地址写错了。</p><Link to="/" className="mt-4 inline-block text-primary underline">回到今日</Link></div>
}

export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true, element: <Today /> },
      { path: 'calendar', element: <Calendar /> },
      { path: 'todos', element: <Todos /> },
      { path: 'projects', element: <Projects /> },
      { path: 'inbox', element: <Inbox /> },
      { path: 'reminders', element: <Reminders /> },
      { path: 'clients', element: <Clients /> },
      { path: 'clients/follow', element: <Follow /> },
      { path: 'clients/pipeline', element: <Pipeline /> },
      { path: 'clients/key', element: <KeyAccounts /> },
      { path: 'clients/care', element: <Care /> },
      { path: 'clients/extract', element: <Extract /> },
      { path: 'clients/receivables', element: <Receivables /> },
      { path: 'clients/:id', element: <ClientPage /> },
      { path: 'biz', element: <BizSummary /> },
      { path: 'channel/:id', element: <Channel /> },
      { path: 'content', element: <XhsToday /> },
      { path: 'content/pieces', element: <XhsPieces /> },
      { path: 'content/studio', element: <XhsStudio /> },
      { path: 'content/studio/:id', element: <XhsStudio /> },
      { path: 'content/data', element: <XhsData /> },
      { path: 'content/review', element: <XhsReview /> },
      { path: 'content/schedule', element: <Navigate to="/content/pieces?view=calendar" replace /> },
      { path: 'content/notes', element: <Navigate to="/content/data" replace /> },
      { path: 'sources', element: <Sources /> },
      { path: 'imports', element: <Imports /> },
      { path: 'imports/history', element: <ImportHistory /> },
      { path: 'imports/rules', element: <ImportRules /> },
      { path: 'kb', element: <Kb /> },
      { path: 'settings', element: <SettingsPage /> },
      { path: 'design', element: <Design /> },
      { path: '*', element: <NotFound /> },
    ],
  },
  { path: '/embed/clients/:id', element: <EmbedShell><ClientPage embed /></EmbedShell> },
])

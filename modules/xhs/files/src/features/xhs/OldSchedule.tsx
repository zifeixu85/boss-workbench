// 旧地址 /content/schedule（以前的“排期”页）跳到内容页的日历视图。归属：小红书内容模块。
import { Navigate } from 'react-router'

export default function OldSchedule() {
  return <Navigate to="/content/pieces?view=calendar" replace />
}

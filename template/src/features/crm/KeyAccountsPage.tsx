// 大客户档案（旧地址 /clients/key）：现在就是客户列表打开“只看大客户”开关的卡片视图。旧链接跳过去。归属：大客户模块
import { Navigate } from 'react-router'

export default function KeyAccountsPage() {
  return <Navigate to="/clients?key=1&view=cards" replace />
}

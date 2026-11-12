// 旧地址 /content/notes（以前的“笔记数据”页）跳到数据页。归属：小红书内容模块。
import { Navigate } from 'react-router'

export default function OldNotes() {
  return <Navigate to="/content/data" replace />
}

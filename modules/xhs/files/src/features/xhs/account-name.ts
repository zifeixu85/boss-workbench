// 小红书账号名：这个模块自己的设置项（module.json 的 settings 里登记的 xhs_name）。没设就用店名（和服务端 account-name.ts 一致）。 预览内优先显示稿件账号。
import { createContext, useContext } from 'react'
import { useIdentity, useModuleSetting } from '@/lib/identity'

export const XhsPreviewName = createContext('')

export function useXhsName(): string {
  const { shop } = useIdentity()
  const preview = useContext(XhsPreviewName)
  const configured = useModuleSetting('xhs_name')
  return preview || configured || shop
}

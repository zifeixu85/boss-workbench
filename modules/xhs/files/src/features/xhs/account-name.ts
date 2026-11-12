// 小红书账号名：这个模块自己的设置项（module.json 的 settings 里登记的 xhs_name）。没设就用店名（和服务端 account-name.ts 一致）。
import { useIdentity, useModuleSetting } from '@/lib/identity'

export function useXhsName(): string {
  const { shop } = useIdentity()
  return useModuleSetting('xhs_name') || shop
}

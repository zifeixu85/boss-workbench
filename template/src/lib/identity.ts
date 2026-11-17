// 老板怎么称呼、店名、“知识库”这一页叫什么：从设置读（服务端 services/identity.ts 算好，没设置时是“老板”“我的店”）。
// 页面文案里要写老板的称呼、店名时都用这里，不要写死。装进来的模块自己登记的设置项用 useModuleSetting 读。
import { useApi } from './api'
import type { Settings } from './types'

/** kb：“知识库”这一页在菜单和页面上叫什么（设置 kb_name，比如先叫“资料”）；没设置时“知识库” */
export type Identity = { owner: string; shop: string; kb: string }

export const DEFAULT_IDENTITY: Identity = { owner: '老板', shop: '我的店', kb: '知识库' }

export function useIdentity(): Identity {
  const { data } = useApi<Settings>('/settings')
  return {
    owner: data?.owner || DEFAULT_IDENTITY.owner,
    shop: data?.shop || DEFAULT_IDENTITY.shop,
    kb: data?.kb || DEFAULT_IDENTITY.kb,
  }
}

/** 模块在 module.json 的 settings 里登记的设置项现在的值；没设、模块没开、还没取到都是空字符串（模块自己决定空着时用什么） */
export function useModuleSetting(key: string): string {
  const { data } = useApi<Settings>('/settings')
  return data?.module_settings?.find((d) => d.key === key)?.value ?? ''
}

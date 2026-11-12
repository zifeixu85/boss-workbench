// 老板怎么称呼、店名、小红书账号名、“知识库”这一页叫什么：从设置读（服务端 services/identity.ts 算好，没设置时是“老板”“我的店”“我的账号”）。
// 页面文案里要写老板的称呼、店名、账号名时都用这里，不要写死。
import { useApi } from './api'
import type { Settings } from './types'

/** kb：“知识库”这一页在菜单和页面上叫什么（设置 kb_name，比如先叫“资料”）；没设置时“知识库” */
export type Identity = { owner: string; shop: string; xhs: string; kb: string }

export const DEFAULT_IDENTITY: Identity = { owner: '老板', shop: '我的店', xhs: '我的账号', kb: '知识库' }

export function useIdentity(): Identity {
  const { data } = useApi<Settings>('/settings')
  return {
    owner: data?.owner || DEFAULT_IDENTITY.owner,
    shop: data?.shop || DEFAULT_IDENTITY.shop,
    xhs: data?.xhs || DEFAULT_IDENTITY.xhs,
    kb: data?.kb || DEFAULT_IDENTITY.kb,
  }
}

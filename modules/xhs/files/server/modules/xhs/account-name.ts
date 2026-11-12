// 小红书账号名：这个模块自己的设置项（module.json 的 settings 里登记的 xhs_name），设置页“基本信息”里能改，
// 命令行 settings-set --set xhs_name=…。没设就用店名，店名也没设就写“我的账号”。归属：小红书内容模块。
import { identity, moduleSetting } from '../../services/identity.ts'

export function xhsName(): string {
  return moduleSetting('xhs_name') || identity().brand || '我的账号'
}

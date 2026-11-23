// 往核心登记的接入点（module.json 的 server.hooks）：今日页三张卡的数、“总助的话”、“我关注的”有几类出几项菜单、进展的角标。
// 服务端和命令行启动时就加载，所以这里只转一手，实际的代码在 home.ts。
export { paHooks } from './home.ts'

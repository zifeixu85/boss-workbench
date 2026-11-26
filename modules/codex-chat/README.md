# 内嵌 Codex（模块包 codex-chat）

装上以后，页面里的 AI 助手（右下角按钮、⌘J）换成**常驻对话**：和你在 Codex 里开一个对话是同一个东西。

- 用你自己的 Codex：`~/.codex` 里的设置、登录、插件、技能、全局规矩都照常生效；工作目录是知识库根目录，知识库的 AGENTS.md、助理的角色文件也生效。
- 每句话都带上你在看的页面、打开的对象和选中的字。
- 能接着聊：一个工作台对话对应你 Codex 里的一个对话，历史在两边都看得到。
- Codex 要跑命令、改文件、要权限时，对话栏里弹“允许 / 这次对话都允许 / 不允许”，你点了它才接着做；权限照你自己 Codex 的设置，不另加沙箱。
- 没测过的 Codex 版本（现在测过 0.166、0.171）不用常驻对话，自动退回一问一答，对话里说一句原因。

不装：AI 助手是一问一答（每问一次跑一次 Codex，互相不记得），“设置 → AI 助手”里没有“常驻对话”这个开关。

## 怎么装、怎么拿掉

在 Codex 里说“工作台装上内嵌 Codex”，或在程序文件夹里运行：

```bash
node scripts/module.mjs add codex-chat
node scripts/module.mjs remove codex-chat   # 拿掉：回到一问一答，对话记录留着
```

装好后到“设置 → AI 助手”确认“页面里的 AI 助手”打开着；“常驻对话”默认开，关掉就换回一问一答。

## 里面有什么

| 文件 | 做什么 |
|---|---|
| `files/server/modules/codex-chat/hooks.ts` | 往核心登记接入点 `assistantHost`（核心不写模块的名字） |
| `files/server/modules/codex-chat/host.ts` | 引擎：起一个 `codex app-server`，一行一条 JSON-RPC；开对话、逐字收回答、挂起审批、生成的图记下位置 |
| `tests/host.test.ts` | 拿一个假的 app-server 测握手、开对话、审批、版本兜底 |

运行测试（仓库根目录）：`node --test modules/codex-chat/tests/*.test.ts`

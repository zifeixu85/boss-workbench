# AI 助手：工作台接入 Codex

工作台和 Codex 是一体的：老板在哪儿说都行，读写的是同一份数据，写完页面自动刷新。分两层，搭建时都装好。

## 第一层：在 Codex 里说，右边开着工作台

老板在 Codex 里对话（“刚和某某聊了……”“工作台加一条待办……”），Codex 用工作台命令（`server/cli.ts`）读写；工作台页面开着的话，几秒内自己刷新，不用点。

- 打开工作台时，用 Codex 的 `open_in_codex`（浏览器、放右侧）打开工作台地址，老板一边说一边看；地址加 `?embed=1` 不显示左侧导航（例：`http://127.0.0.1:4517/projects?embed=1`），这个标签页里之后换页也保持；`?embed=0` 恢复导航。
- 知识库根目录 `AGENTS.md` 的工作台那一段写上这一句（见 `搭建步骤.md` 第 6 步）。
- 老板也可以在自己的 Codex 里挂上工作台工具（和第二层同一套）：`codex mcp add workbench -- node "<工作台位置>/程序/server/assistant/mcp.ts"`。这是改老板的 Codex 设置，先问他，他说要再加；不加也能用命令行。

## 第二层：工作台每一页右边的 AI 助手

每页右下角“AI 助手”按钮（⌘J / Ctrl+J）打开对话栏。它知道老板正在看哪一页，后台调**老板自己电脑上的 Codex**（用他自己的账号），只挂工作台工具（`server/assistant/mcp.ts`），只开白名单：

- 读：今日、待办、日程、项目、客户、应收、模块……（`workbench_read`）和知识库（`kb_list`、`kb_read`、`kb_search`，只读）。
- 写：待办、日程、项目和里程碑、收件箱、跟进、答应的事、关怀草稿（`workbench_write`），一张清单一次写（`workbench_apply`，先预演）。导入、撤销、改设置、备份、提醒设置不开放。
- Codex 那边只读沙箱、关掉命令行、浏览器、插件和技能，不读老板 Codex 的个人配置；用了没开放的能力就停。写入记进“最近改动”，操作人是 Codex。
- 规矩写在提示词里（`server/assistant/runner.ts`）：普通的事直接写；待办问清谁做、哪天前；报价、合同、收款、承诺、改阶段先问，点头再写；改知识库原文不在这里做，交给 Codex 用 boss-kb。

设置页“AI 助手”一栏：显示本机 Codex 的情况，可以关掉。

## 搭建时先查本机 Codex

在程序文件夹里运行（`npm run doctor` 第 ④ 项也会查）：

```bash
node scripts/codex-check.mjs
```

它先找命令行 `codex`，再找 Codex 桌面版自带的那一个（Mac：`/Applications/Codex.app/Contents/Resources/codex-cli/bin/codex`；Windows 的位置还没在真机上核对，找不到时可以设环境变量 `WORKBENCH_CODEX_BIN` 指过去），再看有没有登录。按结果跟老板说一句：

| 结果 | 跟老板说 |
|---|---|
| `ready: true` | “页面里的 AI 助手能用了：每页右下角，或者按 ⌘J。” |
| 找到了但没登录 | “Codex 装好了但还没登录。打开 Codex 登录你的 ChatGPT 账号，再刷新工作台就能用。” |
| 没找到 | “页面里的 AI 助手要靠这台电脑上的 Codex，现在还用不了，其他功能照常。装好 Codex 并登录以后，刷新一下就能用。” |
| 不是用 Codex 在搭（比如用别的 AI 工具） | 先跑一下 `codex-check.mjs`：电脑上有 Codex 并登录了，AI 助手照样能用；没有，就照上一行说，并告诉他“你现在用的工具也能读写工作台：让它用工作台命令（`node 工作台/程序/server/cli.ts`），页面会自动刷新”。 |

不替老板装 Codex、不替他登录、不改他的 Codex 设置。

## 已经验证的和还没验证的（2026-10-15）

- 已在 Mac 上实测：命令行版 `codex-cli 0.159.3` 和 Codex 桌面版自带的 `0.162.0-alpha` 都能用（只装桌面版也行）；读待办、读知识库、新加待办、加里程碑都跑通，页面自动刷新。
- 现在的模型只在“代码模式”里调工具，所以要打开 `code_mode_host`；不同版本的功能开关名单不一样，程序先 `codex features list`，只传这台 Codex 认识的开关。
- 还没测：Windows（桌面版自带命令行的位置、沙箱）；学员账号的额度够不够天天在工作台里问。

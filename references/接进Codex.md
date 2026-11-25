# 接进 Codex：在 Codex 里说，工作台开在右边

日常用法只有一种（2026-11-12 定）：**老板在 Codex 里说，工作台通过一个本地插件接进 Codex，页面开在 Codex 右侧面板**（侧边栏模式，不显示导航）。读写的是同一份数据，写完页面自己刷新。页面里的 AI 助手对话栏默认关着，不作为主用法（见 [AI助手.md](AI助手.md)）。

## 老板说“把工作台接进 Codex”

在工作台的程序文件夹里运行（搭建时也跑这一条，见 `搭建步骤.md` 第 7 步）：

```bash
node scripts/codex-plugin.mjs install
```

它做三件事：生成插件目录 → 加成 Codex 的本地插件市场 → 装上插件。跑完跟老板说一句：“接好了。把 Codex 关掉重开一次，新开一个对话，说‘今天我先做哪件事？’试试，工作台会开在右边。”

| 命令 | 用在什么时候 |
|---|---|
| `node scripts/codex-plugin.mjs install [--port 4527]` | 第一次接；工作台文件夹挪了地方、换了端口、电脑上的 Node 换了版本、工作台模板更新过，再跑一次就是重新接 |
| `node scripts/codex-plugin.mjs status` | 看接上没有、接的是不是这一个工作台、工作台在不在运行；有问题会写“怎么办” |
| `node scripts/codex-plugin.mjs uninstall` | 从 Codex 里拿掉。工作台和数据不动 |
| `node scripts/codex-plugin.mjs build` | 只生成插件目录，不动 Codex（`install.mjs` 装工作台时会顺手跑） |

- 这是在改老板的 Codex 设置（只经 `codex plugin` 命令加一个本地插件，不直接改它的配置文件）。搭工作台时一起做，做之前说一声“我把工作台接进你的 Codex”；老板明确说不要就跳过，以后他说“把工作台接进 Codex”再跑。
- 程序放在知识库外面的（知识库在云盘里），第一次接要带上 `WORKBENCH_ROOT`、`WORKBENCH_DB`（和安装时一样）；以后重新接不用再带，上次的位置记在插件目录里。
- 找 Codex 的顺序：环境变量 `WORKBENCH_CODEX_BIN` → Codex 桌面版自带的命令行（2026-11 起桌面版叫 ChatGPT.app，包名还是 `com.openai.codex`，命令在 `ChatGPT.app/Contents/Resources/codex-cli/bin/codex`；老的 Codex.app、改了名但包里带 `codex-cli` 的也认）→ `PATH` 里的 `codex`。找到的位置记在工作台 `数据/codex-bin.txt`，页面里的 AI 助手照它用。太老的 Codex 没有 `plugin` 命令，脚本会跳过它往下找；都不行就说“把 Codex 桌面版更新到最新”。
- 一台电脑的 Codex 只接一个工作台。接第二个时脚本会说“原来接的是另一个工作台”，换成新的这一个。

## 插件里有什么

插件目录在 `程序/Codex插件/`（它就是一个本地插件市场，里面是这台电脑的绝对路径，不进版本库、不随知识库同步出去也没关系，重新 `install` 就有）：

| 文件 | 作用 |
|---|---|
| `.agents/plugins/marketplace.json` | 市场清单，名字 `boss-workbench` |
| `plugins/boss-workbench/.codex-plugin/plugin.json` | 插件清单：显示名“老板工作台”、三条示例提示、版本号（带内容指纹，内容变了 Codex 才重新缓存） |
| `plugins/boss-workbench/.mcp.json` | 工作台工具：用这台电脑的 node（绝对路径）跑 `程序/server/assistant/mcp.ts`，带上知识库位置、数据库位置、端口 |
| `plugins/boss-workbench/skills/workbench/SKILL.md` | 一个短技能：什么时候用、先调哪个工具、更新进展先给老板核对。源头是 `程序/scripts/codex-plugin-skill.md` |

**插件只是外壳。** 现在有哪些页面、能读什么、能写什么、地址是什么，都由工作台当场给：

- `workbench_capabilities`：页面来自菜单（`src/app/nav.ts`），模块的页面、对象和命令来自模块的 `module.json`；模块开关收起来的不列，它的命令也不读不写（要用先请老板打开模块开关）。
- `workbench_open`：把页面或对象换成带 `?embed=1` 的地址（例：`http://127.0.0.1:4517/projects?embed=1&project=p_spring`）。项目、客户先核对存在再给地址（认名字和简称）；工作台没在运行会先在后台拉起来（日志在 `程序/日志/服务.log`）。
- `workbench_edit_mode`：切换“只改内容 / 放开改”，要带老板的原话（见下面“只改内容”）。
- `workbench_read`、`workbench_write`、`workbench_apply`、`workbench_help`、`kb_list`、`kb_read`、`kb_search`：读写工作台（走命令行 `server/cli.ts`，和网页同一套规则，记进“最近改动”，操作人是 Codex）、只读查知识库。

所以**工作台装了新模块、加了新页面，不用重装插件**：新开一个对话就带上了。怎么登记见 [加减模块.md](加减模块.md) 的“让 Codex 也会用”。

## 只改内容（默认带上）

搭建时最后写上 `settings-set --edit content`（2026-11-17 定，课上第一天就是这样）：Codex 只更新工作台里的内容（进展、待办、日程、项目、收件箱、资讯），不动工作台本身，不装、不换、不拿掉模块，不开关模块，不改页面、菜单、功能和程序文件。`workbench_capabilities` 里的 `edit_mode` 是 `content` 就是这个状态；命令行 `modules --on/--off`、`settings-set --modules`、`node scripts/module.mjs add/update/remove` 这时会停下并说怎么放开。

- 老板说“工作台放开改页面”：Codex 调 `workbench_edit_mode`（`mode="open"`，带他的原话），或在程序文件夹里运行 `node server/cli.ts settings-set --edit open`，再去装模块、改页面。
- 老板说“工作台回到只改内容”：`mode="content"`（`--edit content`）。
- 以前搭的工作台没写过这一项，算放开。老板自己在网页“设置 → 模块”里开关模块不受它管。

## 更新进展：先拆给老板核对，确认后再写

老板在 Codex 里说一段进展（“刚和锦川的孙蕾通了电话……”），Codex 按技能做：

1. 读现状（哪个客户、哪个项目、现在到哪一步）。
2. 拆成清单，调 `workbench_apply`（`yes=false`）预演：照样跑一遍所有规则，什么都不写。
3. 用人话把清单列给老板核对；缺的（谁做、哪天前）一次问清。
4. 老板确认后，原样的清单再发一次 `yes=true`，带上他确认的原话（`confirmation`）。老板要改，就改完重新预演、重新给他看。
5. 写完打开对应的页面（比如那个项目）给他看。

这条规矩有程序兜底（防的是 AI 跳步骤、改了清单不说，不是防人故意绕过；老板确认的原话目前只做检查，没有存进“最近改动”）：**没预演过的清单、预演以后改过的清单、没带老板原话的，`workbench_apply` 都不收**（预演过的清单记一个指纹，在数据库旁边的 `预演记录.json`，留 24 小时）。老板明说的单条小事（“加一条待办：周五前给林总寄样品”）可以直接用 `workbench_write`。报价、合同、收款、对外承诺、改客户阶段、改项目状态先问老板。细则见 [进内容.md](进内容.md)。

不用插件、用别的 AI 工具时，同样的事用命令行做：`node server/cli.ts capabilities`、`open <页面>`、`open project <项目>`、`apply 清单.json`（先不加 `--yes`）。

## 搭建时先查本机 Codex

装好依赖后在程序文件夹里运行（`npm run doctor` 第 ⑤ 项也会查，并报告接没接进 Codex）：

```bash
node scripts/codex-check.mjs
```

| 结果 | 做什么、跟老板说什么 |
|---|---|
| `ready: true` | 运行 `node scripts/codex-plugin.mjs install`，说“接好了，重开 Codex 试试” |
| 找到了但没登录 | 插件照样能装；说“Codex 装好了但还没登录。打开 Codex 登录你的 ChatGPT 账号，就能在里面用工作台” |
| 没找到 | 在用 Codex（有 `~/.codex`）：说“工作台没认出 Codex 的命令在哪，我现在把工作台接进 Codex，它会记下位置”。真没装：说“这台电脑上还没有 Codex（现在装在 ChatGPT 应用里），工作台网页照常能用。装好 ChatGPT 应用并登录以后，跟我说‘把工作台接进 Codex’” |
| 不是用 Codex 在搭（用别的 AI 工具） | 电脑上有 Codex 就照样接；没有就告诉他“你现在用的工具也能读写工作台：让它用工作台命令（`node 工作台/程序/server/cli.ts`），页面会自动刷新” |

不替老板装 Codex、不替他登录。

## 出问题时

| 现象 | 怎么办 |
|---|---|
| Codex 里说到工作台，它不用工作台工具 | 先 `status`。没接上就 `install`；接上了就重开 Codex、新开对话（已经开着的对话不会重新读插件） |
| 工具报“端口上开着的不是这个工作台” | 那个端口被别的程序或另一个工作台占着，或者是更新前就开着的旧版工作台：旧版关掉重开；别的程序就 `install --port <空的端口>` |
| 工具报“工作台没能启动起来” | 看 `程序/日志/服务-错误.log`；跑 `node scripts/install.mjs --check` 体检 |
| 以前按老说明跑过 `codex mcp add workbench …` | 和插件重复了，拿掉旧的：`codex mcp remove workbench` |

## 已经验证的和还没验证的（2026-11-12）

- 已在 Mac 上实测（Codex 桌面版自带的 `codex-cli 0.164`，临时 `CODEX_HOME`，没动真实的 Codex 配置）：`install` / `status` / `uninstall` 跑通，路径带中文和空格也行；在一个和工作台无关的文件夹里用 `codex exec` 说一句进展 → 拆成清单预演 → 改一处 → 重新预演 → 确认 → 项目页的下一步、待办、往来记录都更新 → 工作台没开自己拉起来 → 拿到 `…/projects?embed=1&project=…`；装上行业资讯模块后不重装插件，新对话里能读资讯、拿到 `/news?embed=1`。
- 全新的 Codex 环境里，第一次查全部插件清单要先同步远程目录，实测 71 秒；脚本只查本地这一个市场，不等它。
- 2026-11-26 A梦 在 Mac mini 的 ChatGPT 应用（Codex）里验证过：`open_in_codex` 把待办、客户详情开在右侧面板。
- 还没验证：桌面版对写入工具会不会再弹一次“是否允许”；Windows（桌面版自带命令行的位置、`.cmd` 的调用、后台拉起工作台）。

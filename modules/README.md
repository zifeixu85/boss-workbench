# 模块包

这里的每个文件夹是一个可以“一句话装进工作台”的模块（2026-10-18 起）。工作台模板（`template/`）只带基础版和核心模块：**基础版只带每个人都用得上的**（2026-11-12 A梦 定）；别的业务模块做成模块包，老板要用时 AI 在程序文件夹里运行：

```bash
node scripts/module.mjs list               # 有哪些模块包、装了哪些；还有哪些另外发的模块没拿到模块包
node scripts/module.mjs add <编号>          # 装（--from <文件夹或 .zip> 指定模块包在哪）
node scripts/module.mjs update <编号>       # 换成新版（装好后被改过的文件默认不盖，--force 先挪进备份）
node scripts/module.mjs remove <编号>       # 拿掉（代码和菜单拿掉，数据留着）
```

装的时候把 `files/` 里的代码按原来的相对位置拷进程序，在 `modules.lock.json` 里记下每个文件的指纹，生成四份清单（`shared/modules.gen.ts`、`server/modules.gen.ts`、`src/app/modules.nav.gen.ts`、`src/app/modules.routes.gen.tsx`），核心只读清单，不写模块的名字。装完打开模块开关、重新构建网页；工作台开着也不用重开。

## 基础模块、进阶模块；lite 版、pro 版

| | 基础模块 | 进阶模块 |
|---|---|---|
| 是什么 | 谁都用得上、课上会讲的 | 跟具体业务有关的、进阶课程的内容（课上时间够再讲） |
| 基础模板带不带 | 不带（基础模板只带核心） | 不带 |
| 现在有 | `news` 行业资讯 | `xhs` 小红书内容中心 |
| 怎么装 | “工作台装上行业资讯” | “工作台装上小红书模块” |

两种模块的模块包现在都放在这个 Skill 的 `modules/` 里，学员一句话就能装（2026-11-12 A梦 定）。小红书内容中心是一个引子：以后更多更有价值的模块，**可能会分 lite 版和 pro 版**：

| | lite 版 | pro 版 |
|---|---|---|
| 模块包放哪 | 这个 Skill 的 `modules/<编号>/` | 另外发（不放在这个 Skill 里） |
| 学员怎么拿 | 装了老板工作台 Skill 就有 | 拿到文件夹或压缩包，放进知识库的 `工作台/模块包/` |
| 怎么装 | “工作台装上××” | 同一句话 |

格式、装法、升级、拿掉，lite 和 pro 完全一样，差别只在模块包从哪来。`catalog.json` 是模块目录：每个模块一行，写 `tier`（基础 / 进阶）；分档的写 `edition`（lite / pro）；模块包另外发的写 `get`（怎么拿）。AI 找不到模块包时，就照目录告诉老板“去哪拿、拿到放哪”，不会自己去网上找，也不会照旧版本重写。

## 一个模块包里有什么

```text
<编号>/
├── module.json      编号、名字、版本、依赖、菜单、页面、接口、定时任务、命令，以及 Codex 能读能写的命令、能打开的对象
├── 需求文档.md       给老板和 Codex 看：为什么做、流程、页面、验收（装的时候拷到 程序/modules/<编号>/）
├── README.md
├── files/           要拷进程序的代码，路径和程序里一样（只能放 src/、server/、shared/、public/ 下）
└── tests/           模块自己的测试（不拷进程序）
```

`module.json` 的写法看 `news/module.json`（最简单的）和 `tests/fixtures/pack-memo/module.json`（测试用的假模块，下面这些接入点都用了一遍）：

- `id`：小写英文、数字、短横线；不能和核心模块重名。
- `needs`：要先有哪些模块（核心的或装进来的）。打开这个模块时自动带上它们；它们被关掉前会先提醒。
- `nav`：菜单项，`section` 只能是 今日 / 我关注的 / 客户 / 经营 / 内容 / 我的助理 / 数据 / 资料 / 系统，`icon` 写 lucide 图标名。
- `pages`：地址（不带开头的 /）和页面文件（`src/` 下的 `.tsx`）。
- `server.api`：`server/…/routes.ts#导出名`，是一个 Hono（用 `server/module-kit.ts` 的 `moduleApp()`），挂在 `/api/m/<编号>/`。
- `server.jobs`：每天几点跑一次的事，交给模板的公共调度（`server/jobs/`，没赶上补跑、失败了隔 15 分钟再试）。
- `server.cli`：命令行，`commands` 写命令名（写 `news` 就认 `news` 和 `news-` 开头的）。
- `server.read`：Codex 能用的只读命令（`workbench_read`）。每项写命令名，或 `{ "command": "news", "what": "一句话说它做什么" }`。
- `server.write`：Codex 能用的写入命令（`workbench_write`），写法同上。只能登记这个模块自己的命令（`server.cli.commands` 里的名字，或它加 `-` 开头的）；同一个命令不能既在 `read` 又在 `write`。要老板拍板的（报价、收款、改阶段）不要登记成能直接写的。
- `open`：菜单以外能让 Codex 打开的东西（`workbench_open`）。每项写 `key`、`label`、`to`；地址里带 `{id}` 的是具体对象，要再写一个 `id` 说清它是什么，例：`{ "key": "news-day", "label": "某一天的资讯", "to": "/news?day={id}", "id": "日期，如 2026-11-12" }`。菜单里的页面不用登记，自动能打开；`embed=1` 不用写，打开时自动带上。
- 上面三样登记了就自动出现在 Codex 插件的 `workbench_capabilities` 里，不用改插件（见 `references/接进Codex.md`）。
- 数据库：迁移文件放 `files/server/migrations/`，名字写成 `m-<编号>-001-说明.sql`；拿掉模块时表和数据都留着。

### 接入点（2026-11-12 加）

模块要往核心里放东西，用下面这几个接入点。核心不写任何一个模块的名字；接入点不够用时，先在模板里补一个通用的，再让模块用，不为某个模块写特例。

- `home`：今日页顶上的重点卡。每项写 `id`、`name`（老板在“最想先看到”里看到的名字）、`file`（`src/` 下的 `.tsx`，默认导出一个收 `data` 的组件）。卡片的数由 `server.hooks` 的 `home` 给。模块的卡算业务卡，没设过首页时排在经营、客户后面；老板用 `settings-set --home` 排。
- `settings`：模块自带的设置项。每项写 `key`（必须用 `<编号>_` 开头）、`label`、可选的 `hint`、`placeholder`、`max`（最多几个字，默认 30）。设置页“基本信息”里自动多一个输入框；命令行 `settings-set --set <key>=<值>`；模块里用 `moduleSetting(key)`（服务端）、`useModuleSetting(key)`（网页）读，空着时用什么由模块自己定。
- `server.hooks`：`server/…/hooks.ts#导出名`，导出一个 `ModuleHooks`（类型在 `server/module-types.ts`）。服务端和命令行启动时就加载，所以这个文件要小。里面可以有：
  - `home`：`{ <卡片 id>: (day) => 这张卡要的数 }`。出错只影响这一张卡。
  - `today`：`(day) => { title, lines, brief }`，今日概况里这个模块的一段：命令行 `today`、快照 `今日概况.md`、今日页页头那句话都用它。
  - `importTargets`：往“数据源与导入”登记导入目标（`needs` 要写 `data`）：模块说清自己的数据源、对字段时能选的字段、能整批写和撤销的表、怎么导；数据源页、字段对照、导入规则、导入记录、整批撤销都用现成的。类型在 `server/modules/data/targets.ts`。
  - `seed`：示例数据（`{ tables, seed }`，只能动模块自己的表）。只在示例库里写：`seed --demo --reset` 时排在核心后面；往示例库里装模块、模块的表又都还空着时自动写；老板自己的库从不写。
  - `nav`（2026-11-24 加）：`() => ModuleNavItem[]`，运行时的菜单项：页面有几个要看数据才知道的（个人助理模块按知识库“我关注的”有几类出几页）。每项写 `key`、`to`、`label`、`section`，可选 `icon`（lucide 名字，网页只认 `src/app/nav-icons.ts` 登记的，不认识的用文件夹图标）、`sub`、`badge`。跟着 `/api/overview` 的 `nav_extra` 传到网页，所以要快。
  - `badges`（2026-11-24 加）：`() => { 菜单项 key: 数 }`，给菜单项加“要你处理”的角标（自己写过角标的项不盖）。
  - `note`（2026-11-24 加）：`(day) => { title, lines, by?, foot?, to? } | null`，今日页重点卡上面的一段话（个人助理模块用来放“总助的话”）。
- 模块收起来（模块开关）时，上面这些核心都不调：卡、今日概况、设置项都不出现。

### 把模板自带的功能改成模块包（接手）

以后再把某个自带功能从模板里拿出来（像 2026-11-12 的小红书内容中心），已经在用它的老工作台不能丢数据和页面：

- 迁移：模块的迁移文件第一行写 `-- 接手：旧文件名.sql`。老数据库里旧的那份跑过，就只登记、不再建一遍；新装的照常建（`server/db.ts`）。
- 文件：`module.json` 写 `"replaces": { "module": "旧的模块编号", "files": ["旧版模板带的文件或文件夹（文件夹以 / 结尾）"] }`。装的时候程序里还留着的那批先挪进备份，再放模块包里的。
- 模板这边：删掉的文件路径加进 `template/scripts/retired-files.json`；`catalog.json` 里这个模块写 `was`（旧的模块编号和表），升级脚本靠它判断老工作台在不在用。
- 设置项、重点卡的 id、页面地址尽量不改名，老数据直接接上。

## 进阶模块：怎么做、放哪、怎么发、怎么装、怎么升级

**怎么做。** 和基础模块一样做：先立项对焦、写需求文档，代码放 `files/`，用上面的接入点，不改核心文件。`module.json` 里加 `"tier": "进阶"`。测试照 `news`、`xhs` 和 `tests/module-hooks.test.mjs` 的样子写：装上、用一遍、类型检查、拿掉数据还在。

**放哪。** lite 版（和现在的小红书内容中心）放这个 Skill 的 `modules/<编号>/`，`catalog.json` 里加一行。pro 版的模块包不放在这里，单独保管；`catalog.json` 里只加一行目录（名字、一句话、`edition: "pro"`、`get` 写怎么拿），不放代码。同一个模块有两档时，编号分开（比如 `xxx` 和 `xxx-pro`），pro 版的 `needs` 可以写上 lite 版，只放多出来的部分。

**怎么发。** lite 版跟着老板工作台 Skill 走，不用另外发。pro 版发给有权限的学员一个文件夹或压缩包（里面是 `<编号>/module.json` 这一层，多套一层文件夹也认），渠道由课程方定（课程群文件、网盘、给学员开一个私有仓库的读权限都行）；发之前跑一遍模块包自己的测试。

**学员怎么装。** 在 Codex 里说“工作台装上××”。AI 运行 `node scripts/module.mjs add <编号>`，按这个顺序找模块包：知识库的 `工作台/模块包/` → 环境变量 `BOSS_WORKBENCH_MODULES` 指的文件夹 → 装在本机的 `boss-workbench-modules`（`~/.agents/skills/`、`~/.claude/skills/`、`~/.codex/skills/` 下）→ 老板工作台 Skill 自带的 `modules/`。放在别处就 `--from <文件夹或 .zip>`。pro 版还没放进来就说了这句话：AI 照 `catalog.json` 告诉老板“这台电脑上还没有模块包；去哪拿；拿到放哪”，然后停下。

**怎么升级。** 模块有新版：lite 版跟着 Skill 更新，pro 版换掉 `工作台/模块包/` 里旧的那份；然后说“把××模块更新一下”：`node scripts/module.mjs update <编号>`。老板让 Codex 改过的文件默认不盖，会列出来。整个工作台换新版模板用 `template/scripts/upgrade.mjs`（见 `references/加减模块.md` 的“升级已经搭好的工作台”）：装着的模块不动；老工作台在用“以前自带、现在是模块包”的功能时，升级会从新版 Skill 的 `modules/` 里把模块包装上、数据接着用；找不到模块包就停下不改。

**加一个新模块，要动的地方：**

1. lite 版：这个 Skill 新建 `modules/<编号>/`（`module.json`、`需求文档.md`、`README.md`、`files/`、`tests/`）；pro 版：放在单独保管的地方。
2. `modules/catalog.json`：加一行（`id`、`name`、`tier`、`summary`；分档的写 `edition`；另外发的写 `get`）。
3. `references/模块目录.md`：写上它适合谁、什么时候推荐。
4. 缺接入点：先改 `template/`，补成通用的，写进本页“接入点”一节，再让模块用。

## 规矩

- 不改核心文件：要核心多一个接入点，先改模板（`template/`），模块只用接入点。
- 程序里已经有、又不是这个模块装的文件，装的时候一律不碰（列出来停下）；`replaces` 里写明的旧版自带文件除外（挪进备份，不删）。
- 公开仓库：模块包里不能有任何真实个人或客户资料、密钥；样例写虚构的（ABC茶社·林总），链接指向 example.com。另外发的 pro 版模块包也照这条。
- 不删用户数据：拿掉模块、升级、接手旧表，表和数据都留着。

## 现有的

| 编号 | 名字 | 种类 | 说明 |
|---|---|---|---|
| `pa` | 个人助理 | 基础 | 我关注的（知识库里有几类出几页）+ 我的助理（进展、产出、报告、助理）；只读本机对话记录的元信息。2026-11-24 第一版，在 A梦 本机试用 |
| `news` | 行业资讯 | 基础 | 来源自己开关、说一句话加（预设生财有术、AI HOT），都由 Codex 取了写进来；每条摘要、能看全文，每天一份 Codex 写的总结；第二天课上那个模块的参考答案 |
| `xhs` | 小红书内容中心 | 进阶（模块包就在这里） | 今天发什么、选题到发布一条线、和本机 Codex 一起写稿、笔记数据、每周复盘。2026-11-12 以前是模板自带的 `content` 模块 |

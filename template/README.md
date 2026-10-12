# 老板工作台 · 空模板

老板工作台 Skill 搭工作台时用的程序模板：React + shadcn 的网页，Node 自带的 SQLite 存数据，服务端直接运行 TypeScript，不用编译原生模块。

这是**空模板**：不带数据库、依赖包（`node_modules`）、构建好的网页（`dist`）、日志和截图。装好以后是一个空工作台，没有客户、项目、待办，等 Skill 从老板的知识库导进来。示例数据（一家虚构的茶社，人名、客户、数字全部虚构）只有加 `--demo` 才会写入。

> 不要在模板文件夹里直接安装或启动。先按 `references/搭建步骤.md` 第 1 步把整个文件夹复制到 `<工作台位置>/程序`，再在那里装。

## 需要什么

- Node 22.18 以上（用到 Node 自带的 SQLite 和直接运行 `.ts`）。下载：nodejs.org 的长期支持版（LTS）；国内慢可以用 npmmirror.com/mirrors/node/。
- 第一次装依赖要联网（官方源和国内镜像自动选快的，一个不行换另一个）。

## 安装

在复制好的 `<工作台位置>/程序` 里：

```bash
node scripts/install.mjs            # 体检（Node、端口、知识库）→ 选下载源 → 装依赖 → 构建网页 → 建空数据库
node scripts/install.mjs --check    # 只体检，不改任何东西（= npm run doctor）
# 可选：--mirror 直接用国内镜像；--registry=<地址> 指定源；--skip-build 已有网页时不重新构建
```

日志写在 `install.log`。装不上先跑 `--check`，把日志给帮你装的人看。

**位置**：默认程序在 `<知识库>/工作台/程序`，数据库在 `<知识库>/工作台/数据/workbench.db`，知识库根目录按“程序文件夹往上两层”算。知识库在 iCloud、OneDrive、网盘这类同步目录里时，程序和数据库要放到知识库外面，这时安装、启动、命令行都要带两个环境变量：

```bash
WORKBENCH_ROOT="<知识库根目录>" WORKBENCH_DB="<工作台位置>/数据/workbench.db" node scripts/install.mjs
```

**端口**：默认 4517。体检会说端口有没有被占；被占了就换一个，启动时加 `PORT=4527`，并写进 `工作台/README.md` 和开机自启的配置里。

## 启动和命令行

```bash
node server/index.ts                 # 网页：http://127.0.0.1:4517（npm start 一样）
node server/cli.ts --help            # Codex 用的命令行：全部命令和参数
node server/cli.ts today             # 今天的情况
```

搭建时先写设置，再从知识库导入（和网页走同一套规则，都记进“最近改动”；不要直接写数据库）。下面的名字都是举例：

```bash
node server/cli.ts settings-set --owner 张总 --business 张记花店 --xhs 张记花事 --theme jade --nav simple   # 称呼、店名、小红书账号名、配色、导航
node server/cli.ts client-add 星禾科技 --label "科技公司 · 年节礼品" --stage 待复购 --next 2026-11-20 --kb 04-客户/企业客户/星禾科技.md
node server/cli.ts client-set 星禾科技 --note "喜欢素雅包装；送礼对象是员工；去年 120 份"
node server/cli.ts project-add "新店开业" --stage 进行中 --due 2026-12-15 --owner "店长小王" --kb 06-项目/新店开业.md \
  --milestone "2026-11-30 装修完工" --milestone "2026-12-15 开业"
node server/cli.ts todo-add "给星禾出两版礼盒方案" --due 2026-11-18 --client 星禾科技 --priority 紧急 --note "来源：06-项目/近期要事.md"
node server/cli.ts todo-add "定开业活动" --project 新店开业 --status 进行中
node server/cli.ts inbox "收件箱里的新材料：2026-11-10-星禾科技-电话纪要.md"
node server/cli.ts backup                                   # 改功能、换数据前先备份数据库
```

**称呼、店名、小红书账号名**：网页文案、给 Codex 的提示词、小红书手机预览、写回知识库的话里，老板的称呼、店名和小红书账号名都从设置读（`settings` 表的 `owner`、`business`、`xhs_name`；代码在 `server/services/identity.ts`、`src/lib/identity.ts`）。搭建时用上面的 `settings-set` 按知识库写进去（称呼看 `02-关于我/`，店名看 `03-生意/`，账号名看 `11-内容与作品/` 的小红书账号定位）；网页“设置 → 基本信息”也能改。没写时用中性说法：“老板”“我的店”，小红书账号名没写就跟店名。改功能时不要在代码里写死某位老板的称呼或店名。

**备份**：都放在数据库旁边的 `备份/`（默认 `<知识库>/工作台/数据/备份/`；程序和数据库放在知识库外面时，就在库外那份数据库旁边，不随知识库同步）。`node server/cli.ts backup` 把数据库存成 `备份/workbench-<日期>T<时分秒>.db`（工作台开着也能备份）；工作台往知识库文件里写之前，原文件先存到 `备份/知识库/<日期时间>-<文件名>`。要回到某个备份：先停掉工作台，把现在的 `workbench.db` 挪开（旁边的 `workbench.db-wal`、`workbench.db-shm` 一起挪），再把那份备份复制回去、改名成 `workbench.db`，然后启动。

客户阶段只能是：新线索、需求确认、方案中、报价中、待签约、交付中、售后、待复购、合作中、维护中、暂停、流失。项目阶段：筹备、进行中、收尾、已完成、暂停。待办状态：待办、进行中、等别人、完成、取消。配色：jade（松石）、wood（原木）、navy（墨蓝）、mono（素白）、night（夜墨）。写错了命令会说“没办成：……只能是……”。

## 示例数据（--demo）

```bash
node scripts/install.mjs --demo      # 装好后写入示例数据
npm run seed                         # = node server/seed/index.ts --demo --reset：删掉数据库，从零重灌示例数据
node server/seed/index.ts --only biz # 只重灌一个模块（biz、content、data、crm-follow）
```

- 不加 `--demo`，种子脚本不会写示例数据；`--only` 只在示例库上能用。已经有老板自己的数据库时，`install.mjs --demo` 会停下，请你先把数据库挪走备份，不会覆盖。
- 示例库的“今天”固定在 2026-10-27（存在数据库 `settings` 的 `demo_today`），网页、命令行都按这一天算。启动时加 `DEMO_TODAY=off` 换回真实日期，`DEMO_TODAY=2026-11-01` 换成别的一天。老板自己的数据库没有这个设置，按真实日期。
- 示例数据是一家虚构的茶社（老板、客户、团队、数字都是编的），写在 `server/seed/`，只有加 `--demo` 才写进数据库；称呼、店名、小红书账号名也由种子写进设置。
- 有几处演示要配合示例知识库里的文件：客户档案、`00-收件箱` 里的新材料、小红书创作 Skill（`.agents/skills/xhs-creator/`）。没有示例知识库时，这些地方提示“找不到原文”，不会报错。

## 模块

| 模块 | 网址 | 网页 | 服务端 | 数据库升级文件 |
|---|---|---|---|---|
| 公共：今日、日程、待办、项目、收件箱、知识库、设置、组件规范 | `/` `/calendar` `/todos` `/projects` `/inbox` `/kb` `/settings` `/design` | `src/features/today` 等 | `server/services/`、`server/routes.ts` | `001_init.sql` |
| 客户与跟进（大客户：客户列表、跟进看板、关怀与回访、新材料提取、跟进清单、应收款） | `/clients…` | `src/features/clients`、`src/features/crm` | `server/modules/crm` | `002_crm.sql`、`015_crm_*.sql` |
| 经营（汇总 + 每个渠道一页、经营早报、异常） | `/biz`、`/channel/<渠道>` | `src/features/biz` | `server/modules/biz` | `003_biz.sql`、`012_biz_reports.sql` |
| 小红书内容中心（今天、内容、创作、数据、复盘） | `/content…` | `src/features/content` | `server/modules/content` | `004_content.sql`、`013_content_center*.sql` |
| 数据源与导入（导入文件、对字段、导入记录、导入规则） | `/sources`、`/imports…` | `src/features/data` | `server/modules/data` | `005_data.sql`、`014_data_import*.sql` |

- 菜单只有一个来源：`src/app/nav.ts`；页面登记在 `src/app/router.tsx`。没选的模块从 `nav.ts` 拿掉就行，代码留着，以后加回来。
- 数据库升级文件（`server/migrations/`）只加不改，程序打开数据库时自动执行没跑过的。
- 改界面先读 `规范/README.md` 和另外 6 篇，对照网页里的“组件规范”页（`/design`）；加减模块按 Skill 里的 `references/加减模块.md`。
- 检查：`npm run build`（网页）、`npm run lint`、`npm run check:server`（服务端严格类型检查）、`npm run doctor`。

## 和示例数据（--demo）的关系

- 模板和带示例数据的那份工作台是同一套代码；默认端口 4517，不带数据库、依赖包、构建好的网页和截图。
- 经营、客户、小红书、数据源四个模块是照着示例里那家茶社做出来的：称呼、店名、小红书账号名已经从设置读，但有些用词还是茶社的（茶礼、门店品鉴、礼盒……）。给别的行业的老板搭时，按他的行业改这些说法，改法按 Skill 的 `references/加减模块.md`。
- 经营模块要先有渠道：空库里没有渠道时，渠道页显示“没有这个渠道”。渠道、商品和每天的数，按 Skill 的 `references/配方-多平台经营.md` 和 `references/配方-数据导入与对字段.md` 接。

<!-- 由 导出工作台模板.mjs 生成 -->

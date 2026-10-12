# 工作台界面规范（AI 改功能前必读）

给 Codex / Claude 看的：加模块、改页面之前，先读这份和下面几篇，再打开网页里的 **组件规范页 `/design`** 对照着看（每个积木都有活的示例）。规范页和这几篇文档说的是同一套东西，改了一边要同步另一边。

> 三条硬规矩：标题和正文都用黑体，网页里不用宋体；看板卡片上不放改状态的下拉（拖动或在抽屉里改）；列表可以用状态页签筛选。细节见各篇。
>
> 范围说明：本规范只管“怎么做”（长相、交互、代码放哪），不管“做哪些模块”。做哪些模块由老板选；现有模块（今日、日程、待办、项目、客户与跟进、经营、小红书、数据源……）是一套参考实现，不是必须全有的清单。

## 读哪篇

| 文档 | 管什么 | 对应规范页 |
|---|---|---|
| [设计令牌与风格.md](设计令牌与风格.md) | 5 套风格、颜色令牌、状态色、涨跌色、图表色、字体字号 | `/design?s=style`、`?s=type` |
| [导航与Tab.md](导航与Tab.md) | 3 种电脑布局 + 2 种手机布局、菜单唯一来源、Tab 和左侧导航怎么分工 | `?s=nav`、`?s=tabs` |
| [展示方式.md](展示方式.md) | 表格 / 卡片 / 看板 / 清单 / 时间线 / 日历怎么选，吸顶规则 | `?s=display` |
| [详情与表单.md](详情与表单.md) | 抽屉只读→编辑、弹窗新建、删除确认、地址栏参数、快捷键 | `?s=detail` |
| [图表.md](图表.md) | 什么问题用什么图、图表规则 | `?s=charts` |
| [组件清单.md](组件清单.md) | 共用组件在哪个文件、干什么用 | 全部 |

空状态、加载、出错的写法见规范页 `?s=states`，要点也写在各篇里。

## 改动边界

| 区 | 哪些文件 | 规矩 |
|---|---|---|
| 绿区：放心改 | `src/features/<你的模块>/` 下的页面和小组件；`app/nav.ts` **追加**一项菜单；`app/router.tsx` **追加**一个页面 | 只用共用组件和令牌拼页面；文件 400 行以内，超了就拆 |
| 黄区：先说再改 | `src/components/*`（共用组件）、`src/index.css`（令牌和风格）、`components/status.tsx` 加状态词、`app/overlay.ts` + `app/Overlays.tsx` 加抽屉或弹窗类型、`features/forms/dialogs.tsx`、`components/detail-parts.tsx`、`lib/format.ts`、`lib/types.ts`、`shared/schema.ts`、`server/services` 和 `server/routes.ts`（新接口、新字段）、本文件夹的规范和 `/design` 页 | 先写清楚改什么、为什么、影响哪些页面，老板确认后再改；改完把受影响的页面都看一遍，并更新规范 |
| 红区：不要动 | `src/components/ui/*`（shadcn 原件）、外壳 `app/AppShell.tsx` `SimpleShell.tsx` `ComplexShell.tsx` `TopShell.tsx` `shell-parts.tsx`、`server/db.ts` `server/clock.ts` 和已有的数据库迁移、`工作台/数据/workbench.db`、`scripts/install.mjs`、`node_modules/`、`dist/` | 除非老板明确点名要改这一处。数据只能走 `server/cli.ts` 命令或网页接口写，不直接写 SQL |

知识库根目录的 `AGENTS.md` 说过：改功能走“老板工作台”Skill 的“加模块”路线（模块卡 → 设计稿 → 网页里确认样张 → 开发），改前快照，改后在 `工作台/程序/` 下运行 `npm run doctor`。本规范是那条路线里“开发”这一步的细则。

## 加一个模块，最少要做到

1. 页面用 `PageHeader` + `PageBody`，内容块用 `Panel`；眉题写菜单分组名。
2. 在 `app/nav.ts` 加一项、`app/router.tsx` 登记页面；不在别处手写菜单。
3. 展示方式按 [展示方式.md](展示方式.md) 选；要切换看法用 `ViewTabs`，选中的视图写进地址栏。
4. 详情放右侧抽屉、默认只读；新建用弹窗；删除二次确认（[详情与表单.md](详情与表单.md)）。
5. 只用令牌类名（`bg-card`、`text-muted-foreground`…），组件里不写色值；状态一律 `StatusBadge`。
6. 图表按 [图表.md](图表.md)：标题写问题、一根纵轴、固定配色、图下写截至日期和来源。
7. 空 / 加载 / 出错三种样子都要有；空状态写清下一步。
8. 手机 375 宽没有横向滚动；夜墨风格下也看得清。
9. 检查：`npx tsc -p tsconfig.app.json --noEmit`、`npx vite build` 通过，再截桌面 1440 和手机 375 两张图看一眼。

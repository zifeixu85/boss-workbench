# 模块包

这里的每个文件夹是一个可以“一句话装进工作台”的模块（2026-10-18 起）。工作台模板（`template/`）只带基础版和核心模块；别的业务模块做成模块包放在这里，老板要用时 AI 在程序文件夹里运行：

```bash
node scripts/module.mjs list               # 有哪些模块包、装了哪些
node scripts/module.mjs add <编号>          # 装
node scripts/module.mjs update <编号>       # 换成新版（装好后被改过的文件默认不盖，--force 先挪进备份）
node scripts/module.mjs remove <编号>       # 拿掉（代码和菜单拿掉，数据留着）
```

装的时候把 `files/` 里的代码按原来的相对位置拷进程序，在 `modules.lock.json` 里记下每个文件的指纹，生成四份清单（`shared/modules.gen.ts`、`server/modules.gen.ts`、`src/app/modules.nav.gen.ts`、`src/app/modules.routes.gen.tsx`），核心只读清单，不写模块的名字。装完打开模块开关、重新构建网页；工作台开着也不用重开。

## 一个模块包里有什么

```text
modules/<编号>/
├── module.json      编号、名字、版本、依赖、菜单、页面、接口、定时任务、命令、AI 助手能读的命令
├── 需求文档.md       给老板和 Codex 看：为什么做、流程、页面、验收（装的时候拷到 程序/modules/<编号>/）
├── README.md
├── files/           要拷进程序的代码，路径和程序里一样（只能放 src/、server/、shared/、public/ 下）
└── tests/           模块自己的测试（不拷进程序）
```

`module.json` 的写法看 `news/module.json`：

- `id`：小写英文、数字、短横线；不能和核心模块重名。
- `nav`：菜单项，`section` 只能是 今日 / 客户 / 经营 / 内容 / 数据 / 资料 / 系统，`icon` 写 lucide 图标名。
- `pages`：地址（不带开头的 /）和页面文件（`src/` 下的 `.tsx`）。
- `server.api`：`server/…/routes.ts#导出名`，是一个 Hono（用 `server/module-kit.ts` 的 `moduleApp()`），挂在 `/api/m/<编号>/`。
- `server.jobs`：每天几点跑一次的事，交给模板的公共调度（`server/jobs/`，没赶上补跑、失败了隔 15 分钟再试）。
- `server.cli`：命令行，`commands` 写命令名（写 `news` 就认 `news` 和 `news-` 开头的）。
- `server.read`：AI 助手能用的只读命令；写的命令不开放给模块。
- 数据库：迁移文件放 `files/server/migrations/`，名字写成 `m-<编号>-001-说明.sql`；拿掉模块时表和数据都留着。

## 规矩

- 不改核心文件：要核心多一个接入点，先改模板（`template/`），模块只用接入点。
- 程序里已经有、又不是这个模块装的文件，装的时候一律不碰（列出来停下）。
- 公开仓库：模块包里不能有任何真实个人或客户资料、密钥；样例写虚构的，链接指向 example.com。

## 现有的

| 编号 | 名字 | 说明 |
|---|---|---|
| `news` | 行业资讯 | 每天 08:30 取一份 AIHOT 日报，标出关注词；第二天课上从零做的那个模块的参考答案 |

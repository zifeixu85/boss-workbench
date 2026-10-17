# 老板工作台（boss-workbench）

在你自己的电脑上搭一个个人工作台网页，把今天要做的、该跟进的人、生意数据、内容汇到一处。有[老板知识库](https://github.com/zifeixu85/boss-kb)，就按知识库识别该放哪些模块、把数据准备好；没有也能先搭一个空白的通用版。搭好以后，加模块、减模块、改功能、换配色、把只读版放到手机上看，都还在这个 Skill 里做。

> An Agent Skill that builds a local personal workbench (web app + SQLite) from a business owner's knowledge base, then keeps evolving it: add/remove modules, re-theme, publish a read-only mobile view. Docs are in Chinese.

## 能做什么

- **按知识库搭**：先读知识库的地图，在本机打开一个四步确认页：
  1. 核对我读到的你；
  2. 工作台放什么（左边列表，右边大预览，用你自己的数据）；
  3. 挑配色；
  4. 使用方式与确认：默认手动打开、不提醒、不自启；想要提醒或开机自启，自己勾上。

  确认后按模板搭出工作台，带数据库；提醒和开机自启按你的选择设。
- **基础版每个都有**：今日、日程、待办、项目、收件箱、知识库、设置（我的资料、配色、四种导航、模块开关、提醒），没数据也在。客户跟进你确实在跟客户才加，按你的做法加；经营、内容以后要用再加。
- **AI 助手**：每一页右边都能打开（⌘J），用你自己电脑上的 Codex 读写工作台；在 Codex 里直接说也行，页面自动刷新。电脑上没有 Codex 的，其他功能照常。
- **空白起步**：还没有知识库，先搭一个基础版。以后说“工作台接上我的知识库”，客户和项目会自动对上。
- **加模块、改功能**：新做一块业务前，先和你“立项对焦”：谁用、什么流程、有哪些状态节点、AI 帮什么，写成一份需求文档，你确认后再按设计规范开发、验收、留改动记录。带七份写好的案例需求文档：
  - 客户跟进（线索、报价、成交、售后、复购，谁跟到哪了）；
  - 多平台经营（汇总 + 各平台、异常、AI 日报）；
  - 小红书内容中心（选题到复盘，含模块自带的写作规则）；
  - 门店订单与取件、报价到回款、项目交付与验收（来自五轮行业模拟，虚构）；
  - 行业资讯（每天定时取一份日报、关注词、没取到如实说）。
  前三份模板里有参考实现；行业资讯做成了可以直接装的模块包。五种行业的工作台各长什么样，见 `references/行业样板.md`。
- **装现成的模块**：做好的模块放在 `modules/` 里（现在有行业资讯），说一句“工作台装上行业资讯”，AI 用 `node scripts/module.mjs add news` 装进你的工作台：菜单、页面、每天定时去取都带上，工作台开着也不用重开。不要了可以拿掉，数据留着。
- **你已经有自己的一套资料**（Obsidian、按客户分的文件夹、Notion 或飞书导出）：先用 boss-kb 梳理（不搬不改，只写地图），按你的习惯出一份工作台结构草案，再照它搭。

  模块用开关打开、收起，代码和数据都留着。另有一份“数据导入时 AI 怎么对字段”的说明。
- **上线只读手机版**：导出一份打过码的快照，做成一个只读网页，放到腾讯云开发（CloudBase）的静态网站托管，手机扫码就能看。
  - 客户默认用代号，金额默认不放。
  - 上传清单要你在对话里说“确认上传”才传。
  - 数据库、源代码、知识库原文都不上云。
- **知识库原文不改**：往知识库写回只做三种追加：往来记录加一条、收件箱放新材料、待确认的发现加一条。

## 安装

要求：Node.js 18 以上能跑脚本；搭工作台要 Node.js 22.18 以上；还要 git。

**Codex**：

```bash
git clone https://github.com/zifeixu85/boss-workbench.git "$HOME/.agents/skills/boss-workbench"
```

**Claude Code**：

```bash
git clone https://github.com/zifeixu85/boss-workbench.git "$HOME/.claude/skills/boss-workbench"
```

建议同时装上[老板知识库](https://github.com/zifeixu85/boss-kb)。装好以后**新开一个对话**，在知识库文件夹里输入 `$boss-workbench`（Claude Code 里是 `/boss-workbench`），说“帮我搭工作台”。

> **工作台模板（`template/`，React + SQLite）是测试版**：老板称呼、店名、账号名从设置里读（`node server/cli.ts settings-set --owner … --business …`）；`--demo` 演示模式带一套虚构的示例茶社数据。不含依赖包和构建产物，安装时自动装、自动构建。模板会继续更新。

## 常用说法

| 你说 | 它做什么 |
|---|---|
| 帮我搭工作台 | 读知识库 → 确认页 → 按模板搭好 |
| 我还没有知识库，先搭个工作台 | 空白起步 |
| 工作台接上我的知识库 | 对照、导入、在知识库入口加一小段工作台说明 |
| 工作台加个××模块 / 我想管好大客户 | 立项对焦 → 需求文档 → 样张 → 开发 → 验收 |
| 工作台装上行业资讯 / 有哪些现成的模块 | 装 Skill 里做好的模块包（`modules/`），工作台开着也不用重开 |
| 这个模块用不上了 / 把经营打开 | 模块开关，不删代码和数据 |
| 换个配色 / 重新选模块 | 重开确认页，只改要改的 |
| 上线 / 手机上看工作台 / 更新手机版 / 撤掉手机版 | 只读手机版，走腾讯云开发 |

## 现在的状态

- 自动测试：脚本和确认页 `node --test scripts/tests/*.test.mjs scripts/deploy/tests/*.test.mjs`；经营数据的缺值、迁移、撤销 `node --test tests/*.test.ts`，装模块的整体测试 `node --test tests/module-news.test.mjs`（都要先在 `template/` 装好依赖）；模块包自己的 `node --test modules/*/tests/*.test.ts`；模板在 `template/` 里 `npm test`。
- 真正上传到腾讯云开发的流程、Windows、干净电脑都**还没实测**；工作台模板是测试版，会继续更新。

## 搭配使用

[老板知识库（boss-kb）](https://github.com/zifeixu85/boss-kb)：一问一答建出你自己的知识库，工作台从它读你的客户、项目和做事方法。

## 许可与署名

[Apache License 2.0](LICENSE)。转发、修改或二次分发时请保留 [NOTICE.md](NOTICE.md)，注明出处：A梦 · <https://ameng.blog>。腾讯云开发是第三方服务，以它的官方说明和收费规则为准。

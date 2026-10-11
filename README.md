# 老板工作台（boss-workbench）

在你自己的电脑上搭一个个人工作台网页，把今天要做的、该跟进的人、生意数据、内容汇到一处。有[老板知识库](https://github.com/zifeixu85/boss-kb)，就按知识库识别该放哪些模块、把数据准备好；没有也能先搭一个空白的通用版。搭好以后，加模块、减模块、改功能、换配色、把只读版放到手机上看，都还在这个 Skill 里做。

> An Agent Skill that builds a local personal workbench (web app + SQLite) from a business owner's knowledge base, then keeps evolving it: add/remove modules, re-theme, publish a read-only mobile view. Docs are in Chinese.

## 能做什么

- **按知识库搭**：先读知识库的地图，在本机打开一个四步确认页：
  1. 核对 AI 读懂的你；
  2. 选模块（左边列表，右边大预览，用你自己的数据）；
  3. 挑配色；
  4. 定每天几点整理好、几点提醒。

  确认后按模板搭出工作台，带数据库、提醒和开机自启。
- **空白起步**：还没有知识库，先搭一个通用的：今日、待办、收件箱、客户、项目。以后说“工作台接上我的知识库”，客户和项目会自动对上。
- **加模块、减模块、改功能**：先把你的一句话整理成“三行需求”（要什么、不能动什么、怎么算好），写模块卡、出样张给你看，再按设计规范开发、验收、留改动记录。带三个案例配方：
  - 小红书内容中心（含模块自带的写作规则）；
  - 多平台经营；
  - 大客户跟进。

  另有一份“数据导入时 AI 怎么对字段”的说明。
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

> **工作台模板稍后发布**：搭工作台要用的模板（`template/`，React + SQLite）还在整理，这个仓库暂时没有。没有模板时，Skill 会停下来告诉你“工作台模板还没装好”。确认页、知识库读取、加模块的说明、上线手机版的脚本，现在都能用。

## 常用说法

| 你说 | 它做什么 |
|---|---|
| 帮我搭工作台 | 读知识库 → 确认页 → 按模板搭好 |
| 我还没有知识库，先搭个工作台 | 空白起步 |
| 工作台接上我的知识库 | 对照、导入、在知识库入口加一小段工作台说明 |
| 工作台加个××模块 / 导入这份抖店导出表 | 三行需求 → 模块卡 → 样张 → 开发 → 验收 |
| 换个配色 / 重新选模块 | 重开确认页，只改要改的 |
| 上线 / 手机上看工作台 / 更新手机版 / 撤掉手机版 | 只读手机版，走腾讯云开发 |

## 现在的状态

- 自动测试 60 项（含上线脚本 24 项、确认页 10 项）：`node --test scripts/tests/*.test.mjs scripts/deploy/tests/*.test.mjs`。
- 真正上传到腾讯云开发的流程、Windows、干净电脑都**还没实测**；工作台模板稍后发布。

## 搭配使用

[老板知识库（boss-kb）](https://github.com/zifeixu85/boss-kb)：一问一答建出你自己的知识库，工作台从它读你的客户、项目和做事方法。

## 许可与署名

[Apache License 2.0](LICENSE)。转发、修改或二次分发时请保留 [NOTICE.md](NOTICE.md)，注明出处：A梦 · <https://ameng.blog>。腾讯云开发是第三方服务，以它的官方说明和收费规则为准。

# CloudBase 接入与开通

> 截至 2026-10-10，依据腾讯云 / CloudBase 官网和官方文档；插件（0.2.0）自带的说明文件作补充，标“插件文档”；MCP 2.34.8（2026-10-07 取到的版本）的源码作补充，标“MCP 源码”；作者在自己电脑上试过的，标“作者实测（2026-10）”。查不到的标**未核实**，还没试过的标**还没实测**。插件每次启动都下最新版，工具名和参数会变：**用之前按 1.6 核对一次工具写法**。套餐、兑换码、续期活动 2026 年都调整过，以控制台实际显示为准。

## 1. Codex 接入 CloudBase

前置条件（官方）：Node.js **18.15.0 或更高**（终端输入 `node --version` 看），并且开通了云开发环境。推荐说法：“**在 Codex 里装 CloudBase 插件**”（有人会说成“接入 cloudbase cli”，官方那一页其实是 AI 工具包，也就是插件；`tcb` 命令行在本 Skill 里只是备用，插件可能会顺带装上它）。

### 1.1 推荐：插件市场（Codex App 图形界面，官方步骤；第 6 步按作者实测（2026-10）改）

| 步 | 做什么 | 填什么 / 点什么 |
|---|---|---|
| 1 | 打开插件目录 | Codex App 右上角的 **+** |
| 2 | 添加插件市场 | 菜单里选“添加插件市场” |
| 3 | 填市场信息 | 来源：`TencentCloudBase/CloudBase-MCP`；Git 引用：`main`；稀疏路径：**留空** |
| 4 | 点“添加市场” | 插件列表里出现“Tencent CloudBase”市场 |
| 5 | 安装插件 | 点 `cloudbase` 旁边的安装（**不要装 `cloudbase-sites`**，见 1.5） |
| 6 | **完全退出 Codex 再打开** | 官方写“新开一个线程”；作者实测（2026-10）同一个对话里没加载出工具，重启 Codex 才出现。重开后在**同一个知识库项目**里新开对话，否则找不到工作台 |

一次装齐：CloudBase 的 MCP 工具、30 多个技能、4 个斜杠命令（`/cloudbase-env`、`/cloudbase-status`、`/cloudbase-init`、`/cloudbase-deploy`）。装好后 `~/.codex/config.toml` 会自动多出 `[marketplaces.tencent-cloudbase]` 和 `[plugins."cloudbase@tencent-cloudbase"]` 两段，不用手写。插件启动 MCP 的方式是 `npx -y @cloudbase/cloudbase-mcp@latest`，每次启动都去 npm 查最新版，所以要联网（插件文档）。第一次用时 Codex 会弹几次“是否允许联网 / 运行命令”，插件还可能装 `tcb` 命令行走备用登录，提前告诉老板点允许。

终端等价写法（插件文档，Codex CLI 用）：

```bash
codex plugin marketplace add TencentCloudBase/CloudBase-MCP --ref main --sparse .agents/plugins --sparse plugin
codex plugin add cloudbase@tencent-cloudbase
codex plugin list --marketplace tencent-cloudbase   # 看装上没有
codex plugin marketplace upgrade tencent-cloudbase  # 以后升级
```

装完跑一次装机检查：`node "<boss-workbench 文件夹>/scripts/deploy/preflight.mjs"`（只读、不联网）。

### 1.2 备用：只接 MCP

只装 MCP 工具，没有插件技能、没有每轮自动注入的提示。要在终端敲命令（官方命令）：

```bash
npm i @cloudbase/cloudbase-mcp -g
# Mac：
codex mcp add cloudbase --env INTEGRATION_IDE=CodeX -- cloudbase-mcp
# Windows PowerShell：
codex mcp add cloudbase --env INTEGRATION_IDE=CodeX -- cmd /c cloudbase-mcp
```

什么时候用：拉不下 GitHub、插件市场添加失败；Windows 上插件起不来（`npx` 实际是 `npx.cmd`，旧版 Codex 直接启动会报 program not found，上游已修，哪个版本带上了没查到）；插件技能干扰了别的项目（见 1.5）。

npm 慢、报 `-32001 Request timed out`、工具数量为 0（官方 FAQ 归到同一个原因：npx 现下载太慢）：终端运行 `npm config set registry https://mirrors.cloud.tencent.com/npm/`（腾讯镜像，官方 FAQ 给的；**会改这台电脑所有 npm 的下载源**），再重启 Codex。Mac 用 nvm 装 Node 的，先设好默认版本（官方 FAQ 单独提了）。“托管模式”（配置里只填一个网址）要把 SecretId/SecretKey 写进配置，而且不能上传本地文件，部署静态网站用不了，**不用**。

### 1.3 登录与选环境

| 项 | 怎么做 | 来源 |
|---|---|---|
| 一句话 | 对 Codex 说“**$boss-workbench 登录云开发，帮我选好我的免费环境，告诉我环境名和地域。**” | 官方快速上手（加了 Skill 名） |
| 查登录 | `auth(action="status")` | MCP 源码 |
| 登录方式 | **设备码**：`auth(action="start_auth")` 给一个授权网址，Codex 把 `verification_uri_complete` **整段原样**给老板（工具自己也提示“不要截断”）；老板用 **Chrome 或 Edge** 打开、登录腾讯云（可以微信扫码）、点授权，回到 Codex 再查一次 status | 官方“连接方式”；MCP 源码；作者实测（2026-10） |
| Safari | 官方 FAQ：“Safari 浏览器无法完成授权登录”，建议换 Chrome。Mac 老板默认多半是 Safari，登录前先提醒换浏览器 | 官方 FAQ；Mac + Safari **还没实测** |
| 密钥 | SecretId/SecretKey、API Key 是给自动化用的，**这里用不上，也别贴进对话** | 官方 |
| 没有环境时 | 登录后账号下一个环境都没有，插件会**自动开通云开发服务、尝试建一个免费环境（别名 `ai-native`）**，提示写“免费活动赠送，创建过程不会产生费用”；不符合条件就提示手动创建 | MCP 源码（`CreateFreeEnvByActivity`）；**还没实测**：会不会跳过兑换码、地域是不是上海、控制台显示的套餐是什么 |
| 选环境 | 账号下只有一个环境会自动绑定（作者实测，2026-10）；有多个要用 `auth(action="set_env", envId=…)` 选，默认选免费的 | 官方、作者实测（2026-10）、MCP 源码 |
| 列环境 | `queryEnv(action="list")` **只查当前地域**（官方原文：“DescribeEnvs 按地域查询；未传 region 时使用当前地域”）；查别的地域加 `region="ap-guangzhou"` 这类参数 | MCP 源码 |
| 站点 | 必须是**国内站**（cloud.tencent.com）；登录成功却“没有环境”，多半是站点选错或地域不对 | 插件文档 |
| 地域 | 默认上海；**静态网站托管只支持上海** | 官方静态托管快速开始 |
| 联网权限 | 在受限网络下报过 `ENOTFOUND registry.npmjs.org`，给了联网权限才成功。Codex 问“要不要允许”时点允许 | 作者实测（2026-10） |
| 登录凭据 | 存在 `~/.config/.cloudbase/auth.json`（Codex 沙箱外，写的时候会弹允许）。`preflight.mjs` 只看它在不在 | 作者实测（2026-10） |

### 1.4 老板用的提示词（都以 `$boss-workbench` 开头）

老板只说“部署 / 上线”、不点名 Skill 时，Codex 可能走插件自己的技能（插件技能写着“新前端首次部署必须用 deployApp”，会把项目根目录整个传上去；工作台搭在知识库里时，项目根目录就是知识库，里面有原文和 `工作台/数据/workbench.db`）。所以所有口令都点名 Skill：

| 时机 | 说什么 |
|---|---|
| 装好插件、重开 Codex 后 | “$boss-workbench 先做装机检查，再登录云开发，帮我选好我的免费环境，告诉我环境名和地域。” |
| 第一次上线（一句话版） | “$boss-workbench 把工作台做成只读手机版放到云开发上：放默认的几块，客户用代号，金额不放，加口令锁，口令是‘<一句只有你知道的短话>’，标题叫‘手机看板’。先给我看上传清单里最该看的几处，我说‘确认上传’再传，最后给我链接和二维码。” |
| 更新 | “$boss-workbench 更新手机版。” |
| 撤下 | “$boss-workbench 把手机版撤掉。”（会删云上的文件，执行前会再问一次） |

### 1.5 插件要注意的

- **部署方式**：插件的技能给新项目默认用“应用部署”（`manageApps` 的 `deployApp`，把项目根目录传上去在云端构建），会连源代码和 SQLite 数据库一起传。插件的 `/cloudbase-deploy` 会自己找 `dist/` 传到网站根目录（工作台程序里就有完整前端的 `dist/`），文档里还写着旧名 `uploadFiles`。本 Skill **只用** `manageHosting(action="upload")` 上传打包好的 `dist-mobile/`（插件文档）。
- 两种部署方式拿到的都是默认域名，打开都会先出提示页；换成独立子域名也跳不过。
- `cloudbase-sites`（测试版）是同一市场的另一个插件，给新建的 Vite 项目用，一开会话就自动起开发服务器，**不装**，免得和工作台冲突。
- 插件带轻量的使用统计（只报日活和首次使用），环境变量 `CLOUDBASE_PLUGIN_TELEMETRY=off` 可以关。插件还带**每轮对话自动注入 CloudBase 技能的钩子**，Codex 会不会执行这些钩子**未核实**（还没实测）。如果确实会执行、又干扰了别的项目：不部署的日子在插件列表里先停用，部署那天再打开；或者改用 1.2 的“只接 MCP”。
- 环境绑定的优先级（MCP 源码）：本次对话里绑过的 > 环境变量 `CLOUDBASE_ENV_ID` > 项目里的 `.cloudbase/project.json`、`cloudbaserc.json` > 登录账号默认的。所以上传前一定用 `auth(action="status")` 看当前绑定的是哪个。`set_env` 时显式传了地域、站点，MCP 会在项目根目录（知识库根）写一个 `.cloudbase/project.json`，不含密钥。

### 1.6 现行工具写法（MCP 2.34.8；插件会自动升级，用之前核对一次）

| 用途 | 写法 | 说明 |
|---|---|---|
| 查登录、看当前环境 | `auth(action="status")` | |
| 登录 | `auth(action="start_auth")` | 设备码；网址整段给老板 |
| 选环境 | `auth(action="set_env", envId="<环境ID>")` | 上传、查文件只认“当前绑定的环境” |
| 列环境 | `queryEnv(action="list")`，别的地域加 `region` | 只返回摘要，没有到期日 |
| 环境详情、到期日 | `queryEnv(action="info", envId="<环境ID>")` | **必须带 envId**；计费信息 BillingInfo 里有 ExpireTime |
| 静态托管开了没有 | `queryHosting(action="status")` | 看 `enabled`，状态变成 online 才能传 |
| 开通静态托管 | `manageHosting(action="enableService")` | **老板同意后**才调；异步，隔一两分钟再查 status。会不会收费：还没实测 |
| 上传 | `manageHosting(action="upload", localPath="<dist-mobile 完整路径>", cloudPath="m-xxxxxxxx")` | **没有 `uploadFiles`**（旧文档的写法，现在报参数错）；**没有 envId 参数**，多传的会被悄悄丢掉；结果里带 `accessUrl` |
| 核对文件 | `queryHosting(action="findFiles", prefix="m-xxxxxxxx/")` | 比 `listFiles`（全量、每页 100 条）合适 |
| 默认域名 | `queryHosting(action="websiteConfig")` | 上传结果里没有 accessUrl 时才用 |
| 删除 | `manageHosting(action="delete", cloudPath="m-xxxxxxxx", isDir=true, confirm=true)` | 不传 `confirm=true` 会被拒。**路径开头的 `/` 会被去掉，传 `"/"` 等于删整个网站** |

云上路径一律写 `m-xxxxxxxx`，**不带开头和结尾的斜杠**：源码注释写明静态托管的对象 key 一律不带前导斜杠；删除和查找会去掉开头的 `/`，上传不去，带了斜杠传上去是什么样子没实测；Windows 上 Codex 用 Git Bash 时，`/m-xxx/` 这种参数会被改写成 `C:/Program Files/Git/m-xxx/`。

**不调用的工具**（会花钱或会动整个环境）：`manageEnv` 的 create、modifyPlan、renew（create 可以传 `packageId="baas_personal"` 建付费环境，工具只要求 `confirm="yes"`，老板随口一句“好”就过了）；`manageApps`、`manageCloudRun`、`manageFunctions`；`manageHosting` 的 bindDomain、unbindDomain、updateDomain、setWebsiteDocument；`manageGateway`。

## 2. 注册、实名、开免费环境

### 2.1 老板照做（约 15—20 分钟，估计值；建议在要上线之前找时间先做完）

1. 电脑浏览器（**Chrome 或 Edge**）打开 https://tcb.cloud.tencent.com/ → 右上角“**控制台**” → 用微信扫码登录或注册腾讯云。（注册入口 https://cloud.tencent.com/register ；注册页细节**未逐项核实**）
2. 按页面提示做**个人实名认证**：选“微信扫码”，用自己的手机完成。
3. 回到云开发，**勾选服务条款**，完成**服务授权**。
4. 打开定价页 https://tcb.cloud.tencent.com/pricing ，在 FREE 档点“**创建免费环境**”，按页面说明用兑换码创建环境：
   - **地域选上海**（静态网站托管只支持上海）。**选错了先别动，不要删了重建**：每个账号只能有 1 个免费环境，兑换码是一次性的，删了可能建不回来；先到控制台看这个环境能不能开静态网站托管，开不了就停下，别再建第二个（第二个要花钱）。
   - **环境名别用店名或真名**：网址形如 `<环境ID>-xxx.tcloudbaseapp.com`，环境 ID 由环境名派生，会出现在链接里。用 `shouji`、`demo` 这类就行。
   - **看到要付钱的页面就停下，不要付款**；旁边的“购买新环境”是付费档，别点。
5. 等几分钟，环境状态变成“正常”就好了。截图留底或发给别人帮忙看时，**把环境 ID 打码**。
6. Codex App 按 1.1 装好 `cloudbase` 插件、完全退出重开，在知识库项目里新开对话说“$boss-workbench 先做装机检查，再登录云开发”，能看到自己的环境就过关。

另一条路（MCP 源码看到，**未实测**）：实名之后直接在 Codex 里登录，账号下没有环境时，插件会自己开通服务、尝试建一个叫 `ai-native` 的免费环境。成了的话第 3、4 步可能都省掉；没成就按上面的步骤手动建。

Codex 带老板做这些时：一步一步说“在网页上点哪里”，等老板说“好了”再说下一步；不替老板登录、填身份信息、领兑换码、付款。

### 2.2 事实表

| 事项 | 官方说法 | 状态 |
|---|---|---|
| 实名认证 | “腾讯云账号需要完成账号实名认证才能购买和使用云产品。” | 已核实（[实名认证说明](https://cloud.tencent.com/document/product/378/3629)） |
| 个人还是企业 | 个人：微信扫码 / QQ 扫码 / 人脸识别。企业：微信公众平台 / 法人微信扫码 / 法人人脸 / 腾讯云充值 / 对公打款。个人可以改成企业，企业改不回个人；只有企业认证能开增值税专用发票 | 已核实。**推荐个人微信扫码**，以后要开发票、归属公司再改企业认证 |
| 首次开通 | 进云开发控制台，勾选服务条款，完成服务角色授权；首个环境创建后要等几分钟初始化 | 已核实（[创建云开发环境](https://docs.cloudbase.net/quick-start/create-env)） |
| 免费环境入口 | 定价页 FREE 档“创建免费环境”；“购买新环境”是付费档 | 已核实（定价页） |
| 插件自动建免费环境 | 登录后没有环境时，自动开通服务并用优惠活动资格（NewUser / ReturningUser / BaasFree）建 `ai-native` 免费环境；参数里关了自动付费、不自动续费，另有 `EnableExcess=true`（含义没查到） | MCP 源码；**还没实测**，以控制台显示的套餐和超额设置为准 |
| 兑换码 | “自2026年1月16日起，每个云开发账号，可使用一次性兑换码（兑换码领取方式详见购买页说明）创建一个免费体验版云开发环境。” | 原文已核实（[价格文档](https://cloud.tencent.com/document/product/876/127357)）；**兑换码怎么领未核实**，要登录后看购买页 |
| 新用户说法 | 创建环境文档写“授权后，系统会发放个人版免费期”；定价页和价格文档写“免费体验版” | **两处说法不一致**，以控制台为准 |
| 免费额度 | ¥0/月，每月 3000 资源点；1000 资源点约等于 1 元；每个账号只能有 1 个免费环境；自定义域名 0 个 | 已核实 |
| 首次有效期 | 多长**未核实**（有媒体报道个人版 6 个月，不确定是不是同一个套餐） | 未核实 |
| 续期 | 单次续 6 个月，要在到期前 1 个月内手动操作，不自动续；官方博客另有“发一篇分享、审核通过换 6 个月”的活动 | 续期规则已核实；活动见[官方博客](https://cloudbase.net/en/blog/2026/07/28/cloudbase-free-trial-renewal) |
| 到期后 | “到期后进入停服隔离期，未转付费则销毁环境” | 已核实；隔离期多长**未核实** |
| 会不会花钱 | 免费版“不支持加购资源包，也不支持开启按量付费”，“不自动续费” | 规定已核实。对老板这样说：“免费版不能开按量付费，也不自动续费；只要不点购买、升级、续费，就不花钱。”官方没有直接写“不扣费” |
| 用过免费套餐的老账号 | 每个账号只能有 1 个免费环境；以前用过的，要先付费或销毁旧环境才能再建 | 已核实；有旧环境的直接用旧环境 |
| 升级 | 个人版 ¥19.9/月（定价页标“限时优惠”），每月 40000 点；官方博客提到首购 ¥4.9 的活动；**升级后不能降回体验版** | 已核实，以购买页为准 |
| 用途限制 | 免费版只供“学习、原型验证与核心能力体验”，“不是永久无限额套餐”；异常使用可能直接封禁 | 已核实 |
| 静态托管在免费版能不能用 | 配额表把免费版列在静态托管各功能行里（防盗链、IP 名单、限频都标“不支持”），说明静态托管本身能用；容量和流量额度没列出 | **还没实测** |
| 静态托管怎么开通 | MCP 有 `manageHosting(action="enableService")`，开通是异步的，等状态变成 online；命令行 `tcb hosting deploy` 只检查、不会帮你开通 | MCP 源码、插件文档；**开通收不收费还没实测** |

### 2.3 默认域名的规矩

| 事项 | 官方说法 | 来源 |
|---|---|---|
| 用途 | “基于安全合规要求，默认域名仅适用于开发测试阶段”；有访问频率限制，部分高级功能用不了，可能不稳定 | [HTTP 访问服务概述](https://docs.cloudbase.net/service/introduce) |
| 提示页 | 浏览器直接打开会先显示“访问提示中间页”，点“确定访问”才进；确认后在 cookie 有效期内不再弹，有效期由平台调整；这个提示页“将作为一项软性安全提醒长期存在” | [默认域名访问限制及中间页](https://docs.cloudbase.net/service/alias)；[公告](https://cloud.tencent.com/announce/detail/2119) |
| 怎么认“直接打开” | 按请求头 `Sec-Fetch-Mode: navigate` 判断；不是直接打开的，响应加 `Content-Disposition: attachment`（浏览器会下载）。iOS 16.4 以前的系统不发这个头，可能被当成下载 | 官方中间页说明；旧 iOS 是推断，**还没实测** |
| 红线 | 默认域名“严禁用于正式生产环境或分发给大规模用户”；访问量异常时平台可以禁止访问 | 同上 |
| 自定义域名 | 必须“已完成 ICP 备案”，还要 SSL 证书；**免费体验版能绑 0 个**，个人版 1 个，标准版 5 个 | [自定义域名](https://docs.cloudbase.net/service/custom-domain)、价格文档配额表 |
| 访问控制 | 静态托管没有访问密码；安全配置只有防盗链（标准版起）、IP 黑白名单（企业版起）、IP 限频 | [安全配置](https://docs.cloudbase.net/hosting/security) |

## 3. 仍未核实

兑换码怎么领、免费环境首次能用多久、微信里会不会多一层拦截、免费版静态托管的容量和流量额度、隔离期多长、额度用完下个月会不会自动恢复。

## 4. 链接

- Codex 接入 CloudBase（官方）：https://docs.cloudbase.net/ai/cloudbase-ai-toolkit/ide-setup/openai-codex-cli
- AI 工具包快速上手：https://docs.cloudbase.net/ai/cloudbase-ai-toolkit/getting-started
- 连接方式（登录方式）：https://docs.cloudbase.net/ai/cloudbase-ai-toolkit/connection-modes
- CloudBase 首页 / 控制台：https://tcb.cloud.tencent.com/ ・ https://tcb.cloud.tencent.com/dev
- 定价页：https://tcb.cloud.tencent.com/pricing
- 价格文档（免费体验版、兑换码、资源点、配额表）：https://cloud.tencent.com/document/product/876/127357
- 计费说明（免费环境限制、续费）：https://cloud.tencent.com/document/product/876/75213
- 创建云开发环境：https://docs.cloudbase.net/quick-start/create-env
- 腾讯云实名认证：https://cloud.tencent.com/document/product/378/3629
- 静态网站托管：https://docs.cloudbase.net/hosting/introduce ・ 快速开始 https://docs.cloudbase.net/hosting/quick-start ・ 安全配置 https://docs.cloudbase.net/hosting/security ・ 常见问题 https://docs.cloudbase.net/hosting/faq
- 默认域名与提示页：https://docs.cloudbase.net/service/introduce ・ https://docs.cloudbase.net/service/alias
- 自定义域名：https://docs.cloudbase.net/service/custom-domain
- 插件源码：https://github.com/TencentCloudBase/CloudBase-MCP

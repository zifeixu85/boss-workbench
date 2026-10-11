# NOTICE

老板工作台（boss-workbench），属于「老板工作台」开源项目的一部分。
Copyright 2026 A梦（https://ameng.blog）

本项目按 Apache License 2.0 授权，全文见同一文件夹里的 `LICENSE`。转发、修改或二次分发时，请保留这份 NOTICE，写明出处：A梦 · https://ameng.blog · https://github.com/zifeixu85/boss-workbench 。

## 思路来源

借鉴了常见的个人工作台、看板和只读分享的做法，按“老板每天要看什么”重新组织：首页先放今天最要紧的事，客户、生意数据、内容各自一块，手机上只放打过码的只读版。没有照搬任何一家的代码或文字。

老板工作台和老板知识库 Skill（boss-kb）配套：boss-kb 帮老板把资料建成知识库，老板工作台按知识库长出工作台；没有知识库也能先搭空白版，以后再接上。

## 其他

示例里的老板、公司、客户、人名和数字全部虚构，不对应任何真实的人或机构。上线手机版用到的腾讯云开发（CloudBase）是第三方服务，以它的官方说明和收费规则为准。

## 第三方组件

工作台模板（`template/`）里的界面组件（`src/components/ui/`）由 shadcn/ui 生成，按 MIT License 使用（Copyright (c) 2023 shadcn）。模板通过 npm 引用的依赖（React、Radix UI、FullCalendar 的免费插件、Recharts、Hono 等）各按其自身许可使用，见各依赖包自带的 LICENSE。

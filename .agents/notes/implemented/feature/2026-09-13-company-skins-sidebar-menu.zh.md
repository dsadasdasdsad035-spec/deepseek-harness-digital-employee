# Agent Note: 公司皮肤与合并后的组织侧栏菜单

Status: implemented

[English](2026-09-13-company-skins-sidebar-menu.md) | 中文

## Problem

3D 模块交付的公司控制台里，所有房子和所有办公室都是同一套固定外观，且 公司 / 数字员工 占用两个独立的侧栏底部按钮。用户希望每家公司有自己的视觉标识——园区里的小房子与办公室内部跟随不同的装饰风格，提供默认皮肤加选择器——并希望两个菜单合并为一个下拉。

## Decision

- **皮肤标识按公司存储为不透明的 `skinId`。** `CompanyRecord.skinId` 可选（缺省即默认皮肤）；create/update 请求携带该字段；`dsh-company-file` 原样往返，`SCHEMA_VERSION` 不变。宿主网关无需新 remote——`updateCompany` 直接透传该字段。id 在数据层刻意保持不透明：目录归客户端持有，新增皮肤不需要动宿主代码。
- **客户端目录同时驱动两层。** `client/skins.ts` 定义 `CompanySkin` 描述符（园区层：天空、地面、屋顶形态 `pitched|flat|curved|glass`、装饰集合 `trees|lanterns|neon-edges|chimney`；办公层：地板、地毯透明度、桌面/桌腿/款式、在忙屏幕发光色、环境光）与五套程序化预设——`modern`（默认）、`courtyard` 中式庭院、`neon` 科技霓虹、`cottage` 田园木屋、`glass` 玻璃幕墙。`resolveCompanySkin` 对未知或缺省 id 回落默认皮肤，被删皮肤的存量记录仍可渲染。
- **热换重建活动层，而非刷新页面。** 选择器先 `update({companyId, skinId})` 再 `loadFloor(companyId)`；`CompanyScene.setFloor`/`setCampus` 释放旧 group 并按描述符重建。园区环境（天空/地面/网格）取第一家公司的皮肤；每栋房子按各自公司的皮肤渲染，同屏两公司即两种风格。
- **「组织」下拉归 `ui-companies` 持有。** 唯一的 `sidebar.footer.action` 注册者注入列表项（`🏠 公司` 打开浮层控制台，`👤 数字员工` 经 `layout.openApplication` 打开数字员工工作区）。`ui-digital-employees` 不再自行注册底部按钮。归属选在 `ui-companies` 是因为它的控制台已持有附加的 `shell.overlay` 座位，而员工工作区保持其单座位 `shell.application` 不动。
- **状态颜色跨皮肤恒定。** 在忙/空闲 chip 与在忙屏幕的红绿是语义色而非妆饰色；皮肤只改桌面、地板、屋顶与灯光。

## Alternatives considered

- **可复制的模板公司实体** —— 用户选择了更轻的读法：默认皮肤加选择器，而非可克隆公司。皮肤标识保留为公司字段，切换一家公司从不影响另一家。
- **宿主侧皮肤注册表加校验** —— 会把妆饰性 id 穿过三个包并多一次 remote 往返；宿主不消费皮肤，不透明字符串让缝保持最小。
- **GLTF 皮肤包** —— 控制台没有资产管道，three.js 已程序化内联；描述符保持在每套约 1 KB 的量级。

## Consequences

快照轨道已扩展：company-console driver 断言 `skin-default`（缺省 → null）与 `skin-switched`（`courtyard`）两条验收行；`dsh-company-file` 测试覆盖无皮肤创建/往返/无该字段的存量记录。3080 实机验证确认：合并下拉含两个入口且无独立按钮、五张选择卡、星桥科技内部庭院热换无需刷新、园区房子换肤（坡屋顶、暖环境）、两公司同屏异皮肤（星桥科技 庭院 vs 云海数据 霓虹）、数字员工项打开工作区。该轮验证还暴露并修复了一个 phase-1 遗留 bug：切换公司后公司信息编辑表单残留上一家公司的值（点保存会把 A 的字段写进 B）；现在 `selectedId` 变化先重置编辑状态再由填充 effect 装载。收口时观察到的既有快照欠账（非本变更引入，保持原样）：acp/sdk/headless 回放夹具里 `subagent/descriptor` version 2→3 失配，以及外部工作区指令注入污染部分 headless 回放；账户门 `/setup` 重定向此前已悄悄打破 `web-browser-open` 内联快照的 `bootManifest` 期望，该期望在本变更中一并修正。推迟项：每皮肤环境音、超越色板色块的皮肤预览缩略图、用户自定义皮肤通道。

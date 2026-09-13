# Agent Note: 公司 3D 模块（数字员工实例的园区控制台）

Status: implemented

[English](2026-09-13-company-3d-module.md) | 中文

## Problem

数字员工实例目前是一张扁平的管理列表，没有组织维度。运营多个实例的用户需要公司作为组织单位（分类、法人、地址、宣传图）、公司内的部门，以及一目了然的工作状态视图——需求指定 Three.js 3D 呈现：公司是园区里的小房子，内部是部门分区加工位，每个员工的在忙/空闲状态实时翻转。

## Decision

四个包全部落在现有缝上，不改 loop、不改会话日志：

- **`@deepseek-ai/dsh-company`** — Service Definition（`ctx.companies`）+ client-safe wire 类型。Provider 缝覆盖公司增删改查、部门、绑定与宣传图引用；每次变更发布 `companies/change` 并指明受影响公司。一个实例至多绑定一家公司一个部门；`departmentId: null` 是该公司的未分配集合（删除部门把成员移入而非丢绑定）。
- **`@deepseek-ai/dsh-company-file`** — `$DSH_HOME/companies/companies.json` JSON 文档，`SCHEMA_VERSION = 1`，`withFileLock` + `writeFileAtomic`（digital-employee-file 模式）。创建时预置部门 总裁/人力/行政/IT/销售；同公司部门重名拒绝；未知 schema 版本直接失败。
- **`@deepseek-ai/dsh-host-company-management`** — Typert 网关（`companies` 命名空间，17 个 remote），含 `companyFloor`：绑定与实例数据 join，输出每座位忙碌结论。**忙碌是推导值，从不落盘**：`ctx.agents` 里 `status === 'running'` 的实时会话为 `busyKind: 'chat'`；非实时会话工件的 `mtime` 落在 `taskActiveWindowMs`（默认 60 秒）内记为 `busyKind: 'task'`——这是 headless runner 的足迹，它跑在另一个进程里，只有会话写入可观测。网关订阅 `digital-employees/before-delete` 自动解绑。宣传图经 `admitEncodedImages` 入附件库；记录保存完整校验引用（`attachmentId/mediaType/bytes/width/height`），因为 `readImage` 要按它校验字节。
- **`@deepseek-ai/dsh-client-ui-companies`** — 浏览器插件，占 `sidebar.footer.action`（入口）与 **`shell.overlay`**（全屏表面）。`shell.application` 是被数字员工工作区占用的单座位，第二注册者只能遮蔽它，所以控制台走附加的 overlay 位。Three.js（0.180）连同 `@types/three` 内联进客户端 bundle；几何全部程序化（盒身小房子、分类色屋顶随人数缩放、canvas 精灵中文标注、胶囊员工+发光屏幕+在忙/空闲牌）。会话型忙碌搭现有 WebSocket 会话运行位（sessions list store 已镜像 `host/session-status` 帧），座位翻转无需重取；任务型结论靠控制台打开期间的 5 秒 `companyFloor` 轮询。

## Alternatives considered

- **SQLite 存储**（user-accounts 先例）——公司数据小、单写者、无唯一约束查询压力；JSON 文档与数字员工体系同构。多节点时再议。
- **宿主推送忙碌事件**（转发事件条目）——主导实时信号已经以会话状态帧跑在 WebSocket 上；宿主事件通道是重复建设，且任务侧信号宿主自己也只能靠新鲜度轮询获得。
- **绑定存座位号**——座位坐标是视图布局事实而非领域事实；客户端按部门成员推导工位（含富余空位），成员增减不产生脏座位数据。
- **`react-three-fiber`**——冻结模块表只共享 React 本体；fiber 需内联第二个 reconciler 并带版本耦合。一个命令式 `CompanyScene` 类包在 React 组件后面更小、可干净 dispose。

## Consequences

company-3d-module 已实现：存储测试（11）、网关测试（6，含 typert 同步 spec）全绿；keyless 组装快照（`examples/headless-agent/tests/fixtures/core/company-console/`）重放 公司创建 → 自定义部门 → 绑定 → 空闲楼层 → 任务忙碌翻转 → 删除部门移入未分配 → 宣传图管道 → 删除。3080 实机验证 登录 → 打开控制台 → 创建公司 → 3D 园区小房子 → 内部 seated 员工（小人、屏幕、状态牌均有视觉确认）。边界：任务忙碌是新鲜度启发（超过窗口的静默模型调用会闪回空闲）；地理落位明确不做（地址是文本+3D 路牌）；员工详情跳转能打开数字员工工作区但不能深选具体员工（无跨插件选择 API）；SQLite 会话持久化部署拿不到任务忙碌信号，因为 `locate()` 不给逐会话工件（web bundle 的 jsonl 后端有）。

## Gotchas

- `tsdown` 只把显式请求的模块表说明符外部化；生成的 `typert.remote-client.js` 引 zod 必须被 api-remotes 客户端 pass 内联——早前构建顺序留下的过期 `lib/client.js` 会在浏览器报 `require("zod") missed the module table`；重建 client face 即愈。
- 新 fixture 裸插件需要 `examples/headless-agent/package.json` 与 `examples/package.json` 依赖行及 `tsconfig.base.json` paths 条目（`verify-cordis-config` 强制）。
- jsonl 持久化 fixture 要 `compression: none`，且 driver 写的工件首行必须是合法头行（`type: 'session'`、`delegationDepth`），`list()` 才能识别。
- 快照 driver 只回显稳定事实（名称、结论、计数）——公司 id 与时间戳是 UUID/now，回显会破坏重放。

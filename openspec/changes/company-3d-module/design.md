## Context

数字员工实例（`DigitalEmployeeInstance`，`packages/core/digital-employee`）持久化于 `~/.dsh/digital-employees/employees.json`，生命周期事件 `digital-employees/instance-change` 与 `digital-employees/before-delete` 已可用。实例没有忙碌字段；会话运行位经 `packages/client/connection` 的 WebSocket downlink 以 status 帧实时到达前端（sessions manager 维护 `activityRows`），自主任务状态只存在于独立 headless 进程写的 `task-attempts.json` 台账。Web 控制台是插槽制无路由架构，宿主↔前端经 Typert `@Remote` 网关；客户端插件由 `packages/client/tsdown.client.ts` 打成 `lib/client.js` 闭包，第三方 npm 依赖内联进插件 bundle（purity 门禁允许非 `@deepseek-ai` 内联）。仓库内目前没有任何 3D 依赖。

## Goals / Non-Goals

**Goals:**

- 公司数据模型、存储、宿主网关、前端 3D 工作区全部落在现有缝上：文件存储仿 `digital-employee-file`，网关仿 `digital-employee-management`，UI 插件仿 `ui-digital-employees`。
- 忙/闲是纯运行时投影：会话位搭现有 WebSocket 帧（真实时），自主任务位短轮询；不落数据库、不加宿主推送机制。
- 3D 依赖面最小：只引 `three`，程序化低多边形几何，不引 GLTF 资产、`react-three-fiber` 或后处理库。

**Non-Goals:**

- 真实地理落位/地图瓦片/地球仪（地址是信息字段 + 3D 路牌）。
- 员工兼任多公司、座位手动排布、跨设备座位持久化。
- 宿主→前端新增 forwarded event 机制（现有 status 帧已覆盖主导实时信号）。
- 模型可见面变化：公司信息不进系统提示、不产生会话事件。

## Decisions

### D1 · 存储：带版本 JSON 文档，仿 digital-employee-file

`packages/core/company`（types + 校验）+ `packages/core/company-file`（provider）：`~/.dsh/companies/companies.json`，`SCHEMA_VERSION = 1`，`withFileLock` + `writeFileAtomic`（复用 `digital-employee-file` 已导出的锁工具，台账先例）。文档形如 `{ schemaVersion, companies[], bindings[] }`。

- 备选：SQLite（user-accounts 先例）。否决：公司数据小、无唯一约束查询压力、无并发多写者，JSON 文档与数字员工体系同构，跨进程一致性心智一致。
- 备选：通用 storage seam。否决：需要域内严格校验与事件订阅，通用键值缝反而要重造。

绑定结构 `binding = { instanceId, companyId, departmentId }`，一实例至多一条（赋值即换绑的原子写路径）。部门存于公司记录内（`{ id, name, color, order }`），删除部门 = 一次事务内把成员 `departmentId` 置为 `null`（未分配集合）。

### D2 · 类型落点：独立 `dsh-company` types 包

wire 类型（`CompanyId`、`CompanySummary`、`CompanyFloor`、座位快照等）放 client-safe 的 `./types` 导出，与 task-console 把 wire 类型挪出管理根的裁决一致（typert 分析器拒绝管理根内的请求/响应类型）。

### D3 · 网关：`packages/host/company-management`

`TypertRemoteService` 子类（serviceKey `companyManagement`），`@Remote` 方法：`list / get / create / update / delete / setPromoImage / removePromoImage / addDepartment / renameDepartment / reorderDepartments / deleteDepartment / assignEmployee / unassignEmployee / companyFloor`。`inject: ['digitalEmployees', 'attachments', 'companyStore', ...]`。build 时 typert 自动重生成客户端，挂进 `packages/api/remotes/src/client/index.ts` 的 `ctx.remote.companyManagement`。

绑定一致性：插件 `apply` 里订阅 `digital-employees/before-delete`，在删除流程内同步摘除该实例绑定（同事务写回）。

### D4 · 宣传图：现有附件管道

`setPromoImage` 接 `EncodedImageAttachment[]`（base64 RPC，与 `startChat` 同一传输形态）→ `admitEncodedImages(ctx.attachments, images)` 收进内容寻址附件库（`~/.dsh/attachments/v1`），公司记录存 `ImageAttachmentRef`；详情 remote 返回 base64 数据（skill-market `banner` remote 先例）。重复上传自然去重，删图不回收对象（附件库所有权语义不变）。

### D5 · 忙/闲投影：宿主算结论，前端分两路刷新

`companyFloor(companyId)` 在宿主侧 join 三源：

1. `session.list` 的 `running` 位 + 会话日志里的 `digital-employee/identity` 事件投影（sessionId → employeeId）→ 会话型忙碌；
2. `task-attempts` 台账（headless 进程唯一权威）→ 自主任务型忙碌（挂起不算忙）;
3. 公司绑定 → 座位归属。

每座位输出 `{ instanceId, displayName, templateId, rootSessionId, busy, busyKind: 'chat' | 'task' | null }`。

前端刷新分两路：
- **会话型真实时**：UI 插件注入 runtime sessions manager 的运行位快照（`activityRows` 同源），按 `rootSessionId` 翻转座位视觉，不重发 `companyFloor`；
- **任务型轮询**：仅当场景可见时每 5s 重拉 `companyFloor`，diff 后只更新任务型忙碌位。

- 备选：宿主新增 forwarded event（`company-management/floor-changed`）。否决：会话位已有专用实时通道，重复建推送面；任务型信号宿主自己也只能靠轮询台账获得。
- 备选：前端自行 join 会话列表与归属事件。否决：归属投影是宿主域能力，前端重算会复制投影逻辑并读会话日志。

### D6 · 3D：`three` 内联 + 命令式场景管理器

`packages/client/ui-companies` 新插件（`sidebar.footer.action` 入口 + `shell.application` 全屏工作区），`three` 作为普通依赖内联进 `lib/client.js`（gzip 约 +170KB，一次性拉取，不进冻结模块表）。不引 `react-three-fiber`：冻结模块表只共享 react 本体，fiber 另带 reconciler 版本耦合；用一个受管 React 组件包一个命令式 `CompanyScene` 类（owns renderer/camera/scene graph/RAF 循环，props 进 → diff → 场景更新），组件卸载即 dispose。

场景资产全部程序化：房子 = 盒身 + 棱柱屋顶 + billboard 面（宣传图纹理）+ 路牌；小人 = 胶囊身体 + 头 + 桌面屏幕平面；忙 = 打字摆动动画 + 屏幕 emissive + 头顶 sprite「在忙」，闲 = 静止 + 「空闲」。纹理仅宣传图（异步加载占位色）。相机 OrbitControls 自 `three/addons`。低多边形 + 无阴影贴图（或单方向光 + 简单 AO 顶点色）控制开销；目标场景规模（≤ 几十公司、每公司 ≤ 几十人）下无需 instancing，必要时座位小人走 `InstancedMesh`（设计预留，不在第一版实现）。

### D7 · 权限：登录即可管理

复用现有 web auth gate：网关不引入角色判定，与"部署是单 owner"的账户体系现状一致。spec 已把"已登录用户可管理"定为需求；将来多角色时在网关层加判据，不动存储。

## Risks / Trade-offs

- [three 内联使 ui-companies bundle 增大 ~170KB gzip] → 接受：控制台插件按需拉取，园区/内部是核心卖点；不引 fiber/drei/后处理封顶依赖面。
- [低端设备 WebGL 渲染耗电] → 场景不可见（工作区关闭/最小化）即停 RAF；提供降级为平面列表的公司视图开关。
- [任务型轮询与台账真值的延迟] → 接受 ≤5s 延迟；spec 把任务型忙碌定为轮询刷新。
- [before-delete 钩子写公司与员工删除的事务交错] → 摘除绑定走同一 `withFileLock`，失败仅记审计不阻断删除（绑定残留由下次加载时的引用清洗兜底：加载时过滤掉指向不存在实例的绑定）。
- [宣传图 base64 RPC 大负载] → 沿用附件限额（imageLimits 投影已有），详情按需返回单图数据，列表视图返回引用与缩略参数。

## Migration Plan

新存储文件首次运行时创建（无迁移）。回滚 = 移除 bundle 行与包；`companies.json` 留在磁盘无副作用。无 on-disk 兼容承诺期（pre-release 立场），`SCHEMA_VERSION` 不合即拒绝加载。

## Open Questions

- 部门预设色的具体色板与分类→屋顶色的映射规则（纯视觉，实现期定）。
- 未分配分区的视觉摆放位置（实现期定，不影响 spec）。

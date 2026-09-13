## 1. 类型与存储

- [x] 1.1 新建 `packages/core/company`：branded id（`CompanyId`/`DepartmentId`）、`CompanyRecord`/`DepartmentRecord`/`EmployeeBinding` 类型与严格校验（空名拒、部门重名拒、绑定字段校验），client-safe `./types` 导出
- [x] 1.2 新建 `packages/core/company-file`：`~/.dsh/companies/companies.json` 文档，`SCHEMA_VERSION = 1`、`withFileLock` + `writeFileAtomic` 读-改-写事务、未知版本拒绝加载、加载期引用清洗（过滤指向不存在实例的绑定）
- [x] 1.3 存储包单测：并发写串行化、部门删除成员移入未分配、公司删除解绑全部、before-delete 摘除绑定（模拟实例删除事件）

## 2. 宿主网关与投影

- [x] 2.1 新建 `packages/host/company-management`（`TypertRemoteService`，serviceKey `companyManagement`）：公司 CRUD、部门增删改排、实例绑定/解绑/换绑 remote，全部走存储单一写路径
- [x] 2.2 宣传图 remote：`setPromoImage` 经 `admitEncodedImages` 入附件库并存 `ImageAttachmentRef`、`removePromoImage`、详情返回 base64 数据（超限走附件限额错误）
- [x] 2.3 `companyFloor` 投影：join 会话 running 位 + `digital-employee/identity` 归属投影 + `task-attempts` 台账，输出部门分区、推导座位与每座位 `{ instanceId, displayName, templateId, rootSessionId, busy, busyKind }`
- [x] 2.4 绑定一致性：插件订阅 `digital-employees/before-delete` 同事务摘除绑定
- [x] 2.5 网关单测：投影忙碌结论两源（会话/台账）、重复绑定与绑定已删实例被拒、部门重名被拒
- [x] 2.6 typert 接线：build 重生成远程客户端，挂进 `packages/api/remotes/src/client/index.ts` 的 `ctx.remote.companyManagement`；`pnpm run build` 通过

## 3. 前端插件与 3D 场景

- [x] 3.1 新建 `packages/client/ui-companies` 插件骨架：package.json（`dsh.client` 元数据）、tsdown 配置、`sidebar.footer.action` 入口 + `shell.application` 全屏工作区注册
- [x] 3.2 公司管理面板：列表/表单（名称、分类、法人、地址）、宣传图上传与预览、部门维护（增删改排）、实例绑定选择器（在职未绑定实例列表、按部门指派）
- [x] 3.3 引入 `three` 依赖并实现命令式 `CompanyScene` 场景管理器：RAF 循环、不可见即停、卸载 dispose、props diff 更新
- [x] 3.4 园区场景：程序化小房子（盒身+棱柱屋顶+分类屋顶色+尺寸随人数）、宣传图 billboard、地址路牌、公司名与在忙人数悬浮标注、OrbitControls、点击进内部
- [x] 3.5 内部场景：部门分区（名称+成员数）、连续工位、员工小人（胶囊+头+屏幕）、未分配分区、空工位
- [x] 3.6 忙/闲实时：注入 runtime sessions 运行位按 `rootSessionId` 实时翻转座位视觉（不重拉投影）；场景可见时每 5s 轮询 `companyFloor` 刷新任务型忙碌
- [x] 3.7 交互导航：点员工小人开实例详情面板（显示名/模板/忙碌结论 + 直达员工工作区或聊天），点空工位开绑定入口

## 4. 组装、测试与文档

- [x] 4.1 bundle 接线：host 存储/网关行与 `dsh.client` UI 行入 web-app patch 层；`pnpm dsh web` 实机验证公司 CRUD、绑定与 3D 两层场景
- [x] 4.2 keyless 组装快照：经真实 web 控制台覆盖公司创建、部门操作、绑定、忙/闲标签输出（含空态），按测试政策补齐快照 harness 支持
- [x] 4.3 门禁与文档：typecheck/lint/hygiene（含 bundle purity、CSS module 约定）、README 与受影响 JSDoc 同步、Agent Note 落稿；openspec validate 通过

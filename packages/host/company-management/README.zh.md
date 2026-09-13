# @deepseek-ai/dsh-host-company-management

[English](README.md) | 中文

类型化宿主管理网关（`ctx.companyManagement`，Typert 命名空间 `companies`），服务 3D 公司控制台：公司增删改查（含直通 provider 的每公司 `skinId` 渲染皮肤字段）、经附件管道收存的宣传图、部门维护、面向在职实例的绑定，以及 `companyFloor` 投影。楼层投影把绑定与实例数据 join，并计算每个座位的忙碌结论：运行中的实时会话为会话型在忙（经现有 WebSocket status 帧实时翻转）；非实时会话工件在新鲜窗口（`taskActiveWindowMs`，默认 60 秒）内被 headless runner 写入则为任务型在忙。忙碌结论是运行时事实，从不落盘。网关订阅 `digital-employees/before-delete`，实例删除即解绑。

## Model Experience

无。本包服务管理控制台，不贡献提示词、工具或会话事件。

#### KV Cache effect

无；公司状态不进入模型请求。

## Known Limitations and Deferred Work

- **任务忙碌是新鲜度启发** —— 超过 `taskActiveWindowMs` 的静默模型调用在下一次写入前读作空闲。
- **SQLite 持久化无任务忙碌** —— `locate()` 不返回逐会话工件的后端无法感知另一进程的写入。
- **不能深选员工** —— 控制台能打开数字员工工作区，但不能从座位直达选中某一员工。

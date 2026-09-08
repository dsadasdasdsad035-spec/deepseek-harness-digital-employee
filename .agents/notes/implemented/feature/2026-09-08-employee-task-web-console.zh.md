# Agent Note: 员工任务控制台（Web 管理面）

状态：已实现

[English](2026-09-08-employee-task-web-console.md) | 中文

## 问题

自主任务路径落地时只有 headless 面：挂起的任务只能手工编辑 `$DSH_HOME/digital-employees/task-attempts.json` 来清除，通知渠道只能改 Web 用户看不见的 cordis.yml overlay。管理闭环恰好断在人类接触的两个点上——挂起后的恢复，以及渠道配置。

## 决策

管理网关新增五个 remote。任务控制台三件套（`listEmployeeTasks`、`resumeEmployeeTask`、`discardEmployeeTask`）把台账折叠成控制台行，并在 headless 驱动器使用的同一跨进程 `withFileLock` 事务内写回——台账的读-改-写移入 `@deepseek-ai/dsh-digital-employee-file` 的 `withTaskAttempts`，runner 与 host 从此是同一个串行化文件的两个写者。恢复只清除挂起标记并保留计数（下一次失败会重新向阈值累计——天然的"再给三次机会"）；放弃则整条删除。台账记录新增由驱动器写入的 `displayName`/`employeeId` 附加字段；由于台账是跨进程运行数据而非磁盘协议，读取对字段缺失保持宽容。渠道 remote 对（`describeNotificationChannels`、`testNotificationChannel`）把通知 seam 暴露到设置面：通道暴露可选的 `credentials()` 钩子，只报告引用与配置事实（绝不含值），测试发送经生产 `send` 契约并强制 `[test]` 标题。客户端注册一个设置行，并在既有工作区 Tasks 标签内加入自主任务区块；恢复与放弃走与员工删除相同的确认模式。调度仍归部署侧：恢复绝不发起运行。

## 已否决的备选方案

- **台账用进程内内存锁** —— 对跨进程写者对不可见；文件锁是双方共有的唯一串行化点。
- **host 独占台账、runner 经 IPC 上报** —— 会让 headless runner 依赖存活的 Web host，破坏无人值守的 cron 运行。
- **任务视图轮询/推送** —— 与会话回放阶段一并推迟；视图在进入时与每次动作后刷新，对台账的小体量已经足够。
- **从管理根导入 wire 类型** —— 被 typert 分析器拒绝；任务控制台 wire 类型与其同类请求类型一起住在 `@deepseek-ai/dsh-digital-employee/types`。

## 后果

`employee-headless-tasks` 的门禁承诺（"部署侧加锁"）现已在仓库内兑现；headless-employee README 移除了该限制。装配级快照覆盖扩展到控制台 remote：在自主任务 fixture 内的真实管理网关上执行 列表 → 恢复 → 列表，外加标注的测试发送。仍然推迟：任务历史的会话回放、值班成功摘要、专用 resume CLI。

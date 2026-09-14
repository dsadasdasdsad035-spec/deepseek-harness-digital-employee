# Agent Note: 公司位置持久化（车队与员工坐标落盘）

Status: implemented

[English](2026-09-14-company-persistent-positions.md) | 中文

## Problem

每次进入场景世界都被重新随机：员工重置回工位、十二辆车全部随机重生。用户要求连续性——员工是持久实例，必须从最后坐标继续（只有新建员工才在工位出现）；车辆需要稳定车队身份，仅首次出现的车随机出生。

## Decision

- **一个持久存储、稳定 id、合并写。** `dsh-company-file/world-state` 拥有 `$DSH_HOME/companies/world-state.json`：`cars: Record<"car-<i>", {from,to,t,speed,at}>` 与 `employees: Record<employeeId, {companyId,x,z,seated,at}>`；`reportCompanyWorldState` 在 `withFileLock` + 原子写下合并（whereabouts 模式），读取严格。wire 类型走 `dsh-company`（`CompanyWorldStateView` 等）；管理网关在 `companies` 命名空间暴露 `readCompanyWorldState`/`reportCompanyWorldState`。
- **恢复先校验再回退。** 园区构建：保存车辆仅当两端节点存在于当前路网且 0≤t<1 才恢复——否则随机出生（首次出现或路网变化）。楼层构建：注册表完成后，保存的员工坐标仅当碰撞探测通过（忽略自有桌/电脑）才恢复；`seated` 恢复就坐相，站立恢复站立并短暂停留后自然继续游走。无效或公司不符的条目回退工位——布局变化绝不可能把员工放进墙里。
- **上报节奏。** 控制台浮层打开期间，workspace 每 5 秒上报场景 `snapshotWorldState()`（车辆实时边/进度/速度 + 可见楼层 NPC），关闭时再报一次；store 随公司列表一起加载世界状态并交给 `setCampus`/`setFloor`。

## Alternatives considered

- **逐实体 remote** —— 一次批量读 + 一次批量合并足够；逐车/逐员工调用只增往返。
- **位置走会话事件** —— 位置是从不进模型请求的表现数据；世界文件才是诚实的家。
- **精确续行（加载时边内插值）** —— 5 秒快照使车辆恢复天然近似（"从最后坐标继续"）；精确性需要刷新也会绕过的卸载时冲刷。

## Consequences

存储单测（空读、合并语义、损坏响亮报错）与网关往返测试覆盖接缝；company-console 无钥匙快照新增 读空→上报→读回 验收行（回放绿）。全套门禁绿；服务运行该构建。已知限制：host 重启最多丢一个 5 秒窗口；从未打开楼层的公司员工没有条目（回退工位）；车身颜色每次进入重掷（身份是运动状态而非涂装——直到车辆身份在视觉上重要前可接受）。推迟项：车辆持久颜色、卸载时冲刷、员工朝向。

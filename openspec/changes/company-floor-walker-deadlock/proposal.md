# company-floor-walker-deadlock

## Why

公司内部场景里，部分员工小人会**永久卡死在半路**：既到不了工位、也回不了功能区，同时其内部路径数组无界增长（内存泄漏）。用户看到的是"雕像"——一个永远停在通道中间、不动也不做任何事的员工。

实测（干净实例，未发任何任务，仅进入内部场景）：

```
8 次采样 / 5.6 秒（同一个 NPC）
  位置        (-1.7422, -2.6905)    ← 完全不动
  pathIndex   0                      ← 一个路点都没走过
  path.length 12905 → 14089          ← 每 700ms 增长约 170
  blockedSteps 0 / mood 0            ← 放弃重规划那条路从未进入
```

另一实例静置约 6 分钟：`path.length` 从 353 涨到 82955。约 5 个 NPC 中有 2-3 个处于此状态。

根因在 `packages/client/ui-companies/src/client/scene.ts` 的行走推进：

```
advanceNpcs 发现插值步进被 fixture 挡住（:2435）
  → 计算绕行点 sidePoint / pastPoint，只用 ownClear 校验这两个【端点】是否空旷（:2423）
  → 端点空旷 → 走 detour 分支 (:2447)：
        npc.path = [...detour, ...npc.path.slice(npc.pathIndex)]
        npc.pathIndex = 0
        npc.lastAdvanceAt = time        ← :2449
  → 但"当前位置 → sidePoint"这一段本身仍被挡 → 下一帧还是被挡 → 再前置 2 个点
  无限循环：人不移动，数组每帧增长 2
```

两处放大器让这个循环无法自愈：

1. **看门狗被压制**：`time - npc.lastAdvanceAt > 3` 本会在停滞 3 秒后重新规划（:2404），但 detour 分支每帧都写 `lastAdvanceAt = time`，停滞判定永不成立。
2. **放弃分支不可达**：`blockedSteps += 1` 与暴怒/破坏逻辑只在"找不到绕行点"的 `else` 里（:2451）；本 bug 里绕行点总是"看起来可行"，因此 `blockedSteps` 恒为 0。

这违反既有需求「设施阻挡与员工礼让」——它要求员工"滑行绕行**或重新规划路径**不穿入家具"；实际是两条路都没走成，且没有重新规划。

**这不是本次改动引入的**：`scene.ts` 最后一次提交是 `f29f24729e`（click-to-focus 相机），早于本轮所有改动；干净实例无需任何任务即可复现。

## What Changes

- 绕行可行性 SHALL 校验**完整移动段**（当前位置 → 绕行点），而非只校验绕行端点；端点空旷但进入段被挡时 SHALL NOT 采用该绕行。
- 停滞看门狗 SHALL 以**实际位移**为准：未产生位移的帧 SHALL NOT 刷新"最后前进时间"，使停滞能如期触发重新规划。
- 路径增长 SHALL 有界：同一位置反复绕行 SHALL 计入阻塞并最终走到放弃/重规划分支，SHALL NOT 无界前置。
- 员工在任一时刻要么向目标推进、要么进入重规划，SHALL NOT 长时间同时"不移动且持续累积路径"。

## Capabilities

### Modified Capabilities

- `company-3d-console`: 收紧既有「设施阻挡与员工礼让」需求——补上"绕行必须真正可通行、停滞必须能触发重规划、路径不得无界增长"的可验证约束与场景。

## Impact

- `packages/client/ui-companies/src/client/scene.ts`：`advanceNpcs` 的绕行分支与看门狗；`beginWalk` 的路径构造。
- 无协议、无服务端、无数据面影响；纯客户端场景行为。
- 既有 3D 相关快照/单测如覆盖行走推进需同步更新。

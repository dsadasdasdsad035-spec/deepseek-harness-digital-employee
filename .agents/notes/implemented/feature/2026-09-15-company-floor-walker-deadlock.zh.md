# Agent Note: 公司楼层行走员工推进或重规划，不再死锁

Status: implemented

[English](2026-09-15-company-floor-walker-deadlock.md) | 中文

## Problem

在带隔间的办公内部场景里，部分员工小人永久卡死在走廊中途：既到不了工位、也到不了功能区，且其内部 `path` 数组无界增长。在干净实例（未发任何任务）实测：

```
8 samples over 5.6s for one NPC
  position    (-1.7422, -2.6905)   unchanged
  pathIndex   0                    never advanced a waypoint
  path.length 12905 -> 14089       ~+170 per 700ms
  blockedSteps 0 / mood 0          the give-up branch was never reached
```

另一实例静置约 6 分钟，`path.length` 达 82955。约 5 个 NPC 中常年有 2-3 个处于此状态。

`advanceNpcs`（`packages/client/ui-companies/src/client/scene.ts`）里三处缺陷叠加：

1. **绕行可行性只校验端点。** `ownClear(sidePoint) && ownClear(pastPoint)` 只测新增的两个点，从不测「当前位置 → sidePoint」这一段。入口段被挡的绕行照样被采用。
2. **绕行分支在未移动时刷新 `lastAdvanceAt = time`。** 3 秒停滞看门狗（`if (time - npc.lastAdvanceAt > 3) 重新规划`）因此每帧都被满足，永不触发。
3. **绕行分支还重置 `blockedSteps = 0`。** 使 `>=4` 次阻塞的退让/重规划分支，以及挂在其上的情绪与破坏逻辑，全部不可达。

合起来：端点看着空旷 → 采用绕行 → 前置两个点 → 该段实际被挡 → 无限重复。

这违反既有 `company-3d-console` 需求「受阻员工滑行绕行或重新规划路径不穿入家具」。缺陷在 main 上既有（`scene.ts` 最后由 `f29f24729e` 触碰），无需任何任务即可复现。

## Decision

- **校验整段而非端点。** 新增 `EntityRegistry.segmentBlockingFixture(from, to, halfExtents, ...ignore)`，按 `SEGMENT_PROBE_STEP`（0.15）间距对整段采样——小于最小设施，不会漏过任何窄缝。只有两段（当前位置→侧点、侧点→回归点）都畅通时才采用绕行。
- **看门狗以真实位移为准。** `lastAdvanceAt` 只在真正移动员工的分支（到达路点、畅通步进、实际施加退让）刷新。未能通行的帧不刷新，使真正的停滞能触发既有的 3 秒重规划。
- **未通行帧计入阻塞。** 没有可行绕行时，该帧累加 `blockedSteps` 与情绪；到达上限后垂直退让（有可行侧步时）或重新规划回工位。这既给路径增长设了上界，也恢复了放弃分支与情绪/破坏逻辑原有的可达性。
- **把决策抽成纯函数。** `resolveBlockedStep(input, context)` 返回采用的绕行、更新后的计数与任何退让/重规划指令。`CompanyScene` 需要真实 `WebGLRenderer`，行走不变量本无法在 node 下测试；纯函数让它们成为普通单元测试。
- **修正房间判定与回工位路线（D5-D7，跟进中发现的更深缺陷）。** 前三处修复止住了无界增长，却没解决"到不了工位"：`beginWalk` 的 `inRoom = 距离 < ROOM_D/2 + 1`（半径 6）把站在 CEO 玻璃墙门外的员工误判为"在房内"，规划了穿墙直线；而门洞兜底路线又无条件先走 `(from.x, hallZ)`，把已在房内的员工先送回走廊——且"去工位"路径在到达座位后还会 `append(target.x, hallZ)` 把它再次拉出。叠加 `updateBusy` 每次忙碌渲染都重发 `beginWalk`，就形成了门口来回震荡、永不落座。修复：`inRoom` 改为房间足迹（`|Δx| ≤ ROOM_W/2 && |Δz| ≤ ROOM_D/2`）；路线按侧分发且单调（`insideToDesk` / `outsideToDesk` / `insideToOutside` / `outsideToTarget`）；去工位路径止于座位；`updateBusy` 不再重置已在回家途中的员工。

## Alternatives considered

- **加一个路径长度硬上限作为修复。** 能止住增长，却把员工永久钉在原地，掩盖缺陷而非修复。否决；根因是可通行性判定与记账。
- **全局寻路（导航网格 / A*）。** 缺陷是在一个可用的局部策略上判错加记错账；重写远大于缺陷本身。否决。
- **只收紧端点校验。** 否决：对段采样才是真正区分「端点空旷、中间被挡」的手段。

## Consequences

在构建后的应用上对真实实例验证：原本会冻结的同一员工（`c62a1e86`）在 20 秒内 `sit` 到自己工位，另一名到达功能区停留，第三名重规划到新目的地，且所有 NPC 的 `path.length` 保持在 2-6（此前为 12905 → 82955）。包级测试覆盖段采样（端点空旷但中间被挡、整段畅通、忽略自有工位）与纯函数的四种结果，以及一个 200 帧受阻循环，断言任何一帧都未采用绕行、会发生重规划、情绪被上限截断。

跟进修复（D5-D7）用真实长任务端到端验证：一个自包含的 8000 字权限系统任务使 `busy=true` 持续 28 秒以上，期间员工轨迹 `(-16.26, 0) → (-20.20, 0.13) → (-20.20, 6.94) → (-21.40, 7.09) → (-22.78, 7.09) → (-23.30, 7.59) sit scr=0.9`——经门洞、穿房、到座位、屏幕亮，无逆向、无门口震荡。一个单元测试固化了 CEO 几何：直线穿越被拒、门洞路线畅通。

两点诚实的验证限制：

- **内嵌浏览器面板被遮挡时 `requestAnimationFrame` 会被挂起**，整个场景循环停止；此时"冻结"的读数是浏览器造成的，不是产品。修复前后两次实机读数都加了 `rafAlive` / `clock.elapsedTime` 门控，确保场景挂起不会被误读为死锁。需要截图又遇挂起时，我用 `scene.renderer.render(scene.floor, scene.camera)` 强制渲染一帧并在同一回合读缓冲——这样无需 rAF 也能拿到真实 WebGL 像素。
- **视觉结果是通过场景对象的状态观察到的，不是看像素**——执行本工作的模型没有图像输入。截图已存盘（`/tmp/perm-closeup.png`、`/tmp/perm-wide.png`）供用户目视确认。

## Problem space left open

- 局部绕行策略未变；被四面围死时仍依赖退让/重规划，而非搜索路线。
- 是否再补一个路径长度硬不变量作为纵深防御（记账修复已使增长有界）——留待后续评审。
- `updateBusy` 在忙碌渲染时仍被调用（即使现在多为 no-op）；改在 false→true 边沿触发能去掉剩余的冗余重入。

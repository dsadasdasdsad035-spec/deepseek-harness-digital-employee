## 1. 解耦忙碌与移动（`packages/client/ui-companies/src/client/scene.ts`）

- [x] 1.1 删除 `advanceNpcs` 中对忙碌走动小人的强制归位：`if (npc.busy && npc.destination !== 'desk') { this.beginWalk(npc, 'desk') }`
- [x] 1.2 取消就座分支的忙碌门禁：`if (!npc.busy && time >= npc.nextDecisionAt)` 改为 `if (time >= npc.nextDecisionAt)`
- [x] 1.3 删除功能区停留分支的忙碌门禁：`if (npc.busy) continue`
- [x] 1.4 `updateBusy` 保留「已就座则点亮屏幕」，删除「未在去工位路上则改道回工位」的分支，解耦后空闲翻转的 `nextDecisionAt = 0` 保持
- [x] 1.5 复核场景内剩余的 `npc.busy` 引用只剩纯呈现：头顶标签、就座打字动画、就座亮屏、绑定屏幕的会话尾巴

## 2. 可测接缝（沿用 `resolveBlockedStep` 的既有模式）

- [x] 2.1 将就座空闲决定抽为从 `scene.ts` 导出的纯函数（如 `seatedIdleDecision(time, nextDecisionAt, amenityCount, roll)`，签名不含忙碌状态），`advanceNpcs` 改为调用它
- [x] 2.2 在 `packages/client/ui-companies/tests/entity-registry.client.spec.ts` 新增 describe 块：按 roll 与时间返回「去某功能区」或「等待并顺延下次决定」；忙碌不是该函数输入，故结构上不可能门禁游走

## 3. 文档

- [x] 3.1 更新 `packages/client/ui-companies/README.md` 与 `README.zh.md`：把「busy flip walks them straight home to light their screen」改为「忙碌只翻转头顶标签、不驱动归位；就座时才点亮屏幕」
- [x] 3.2 运行 `verify-translation-pairing --write packages/client/ui-companies/README.md` 重录 i18n sidecar
- [x] 3.3 新增 Agent Note 三元组 `.agents/notes/implemented/feature/2026-09-16-company-busy-label-only.{md,zh.md,i18n.yaml}`，记录决策、被否决的两个备选（保留部分门禁 / 加最短驻留缓冲）与代价
- [x] 3.4 `verify-agent-note-format` 与 `verify-translation-pairing` 通过

## 4. 验证

- [x] 4.1 聚焦测试：`packages/client/ui-companies` 全部用例（entity-registry / group-mention / group-definition）
- [x] 4.2 `pnpm run typecheck` 与 `run-oxlint.ts packages/client/ui-companies`
- [x] 4.3 浏览器实测（需重建并重启 3080）：向群内一名员工发提及，确认该员工头顶翻为「在忙」且**不**离开当前行程回工位；回合结束后翻回「空闲」并恢复既有游走
- [x] 4.4 在变更说明中记录快照豁免理由：纯客户端三维呈现，无模型可见路径、无会话事件、无组装转录面

# Agent Note: 确定性的 Typert union 顺序

Status: implemented

[English](2026-09-01-deterministic-typert-union-order.md) | 中文

## 问题

TypeScript 在独立创建的 Program 中可能以不同顺序返回语义等价的 union 成员。Typert 会把这一偶然顺序写入生成的 Zod schema，导致构建产物与后续新鲜度测试在源码未变化时仍不一致。

## 决策

Remote codec 分析在把 union 成员转换为 Typert 节点前，按照完整 TypeScript 文本排序。源码语法树中的 union 保留作者顺序，intersection 保留 TypeScript 提供的顺序。

## 考虑过的替代方案

对所有 union 排序会丢弃作者有意安排的源码顺序，降低生成 schema 的可读性。继续使用 TypeScript checker 的偶然顺序，则会让独立创建的 Program 生成不确定的文件。

## 结果

重复生成会为等价 union 产出字节一致的 Host 与 Remote 文件。生成顺序只属于编码选择，运行时校验接受的 union 成员集合不变。

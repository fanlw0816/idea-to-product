# Idea-to-Product: 自主头脑风暴到产品实现 Agent 系统

## 概述

用户在没有产品创意时触发系统，系统自主完成"头脑风暴 → 产品设计 → 编码实现 → 自审修复 → 打磨优化 → 部署交付"全流程，全程无需人工干预。

## 架构

多 Agent 编排系统，7 个 Agent 各司其职：

| Agent | 职责 |
|-------|------|
| Orchestrator | 总管：状态机、流程控制、错误处理 |
| IdeaGen (竞技场) | 6 角色辩论对抗生成创意 |
| Designer | 产品规格设计 |
| Builder | 代码生成 |
| Reviewer | 代码自审 |
| Polisher | 打磨优化 |
| Deployer | 部署交付 |

## IdeaGen 创意竞技场

6 个角色辩论对抗：
- **TrendHunter** — 市场趋势
- **UserVoice** — 用户痛点
- **Engineer** — 技术可行性
- **DevilAdvocate** — 唱反调
- **Minimalist** — 砍需求
- **Philosopher** — 产品灵魂

三轮辩论：风暴发散 → 对抗辩论 → 融合精炼 → 收敛评分。

## 状态机

```
IDLE → IDEA_GEN → DESIGN → BUILD → REVIEW → POLISH → DEPLOY → DONE
                              ↕         ↕
                           重试(max3)  重试(max3)
```

## 技术栈

- 运行时: Node.js + TypeScript
- Agent: Claude API (Anthropic)
- Agent 通信: 文件系统 + JSON artifacts
- 生成产物: React + Vite + Tailwind CSS

## 运行方式

```bash
npx idea-to-product "我想做一个有意思的产品"
# 或完全随机
npx idea-to-product
```

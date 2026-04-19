# 创意竞技场 Web 流式展示界面

> 开发调试工具，实时观察全流水线运行状态

## 目标

构建本地 Web 界面，实时展示创意竞技场全流水线的事件流：
- **用途**：开发调试、观察系统运行状态
- **用户**：开发者（本项目维护者）
- **场景**：本地运行，配合 CLI 命令使用

## 技术选型

| 层 | 技术 | 原因 |
|---|---|---|
| 通信 | WebSocket | 双向实时，支持控制指令（暂停、重放） |
| 前端 | React + Vite | TypeScript 类型完善，热更新快 |
| 样式 | Tailwind CSS | 快速原型，与角色颜色体系对接 |
| 后端 | Express + ws | 轻量，集成现有 EventBus |

## 布局方案

**双栏布局**：

```
┌─────────────────────────────────────────────────────────┐
│  Header: 连接状态 + 控制按钮                              │
├─────────────────────────────┬───────────────────────────┤
│                             │                           │
│   事件时间线（流式）         │   阶段详情面板            │
│                             │                           │
│   • phase_start             │   • 当前阶段              │
│   • role_pitch/speak        │   • 轮次 / 进度           │
│   • moderator_summary       │   • 角色发言统计          │
│   • synthesis               │   • 评分                  │
│   • design_output           │   • 文件列表（构建阶段）  │
│   • builder_output          │   • 错误摘要              │
│   • review_findings         │                           │
│   • deploy_summary          │                           │
│                             │                           │
│   ↓ 实时流入                │                           │
│                             │                           │
├─────────────────────────────┴───────────────────────────┤
│  Footer: 事件总数 + 时间戳                                │
└─────────────────────────────────────────────────────────┘
```

## 架构设计

### 数据流

```
CLI 启动
    │
    ▼
Orchestrator 创建 EventBus
    │
    ▼
WebSocket Server 监听 EventBus
    │
    ▼
每次 emit(event) → ws.send(JSON.stringify(event))
    │
    ▼
前端 WebSocket 接收 → 渲染到时间线
```

### 组件结构

```
src/web/
├── server/
│   ├── index.ts          # Express + WebSocket 服务器
│   └── event-bridge.ts   # EventBus → WebSocket 桥接
├── client/
│   ├── src/
│   │   ├── App.tsx       # 主应用
│   │   ├── Timeline.tsx  # 事件时间线组件
│   │   ├── EventCard.tsx # 单个事件卡片
│   │   ├── DetailPanel.tsx # 右侧详情面板
│   │   ├── ControlBar.tsx # 控制按钮（暂停/清空/导出）
│   │   ├── hooks/
│   │   │   └── useWebSocket.ts # WebSocket 连接 hook
│   │   └── types/
│   │   │   └── event.ts  # ObsEvent 类型定义
│   │   └── styles/
│   │   │   └ roles.css   # 角色颜色映射
│   │   └── main.tsx
│   ├── index.html
│   ├── vite.config.ts
│   └── package.json
└── shared/
    └── types.ts          # 共享类型（与 EventBus 对齐）
```

## 功能模块

### 1. 事件时间线（左侧）

**展示内容**：
- 所有 `ObsEvent` 类型事件
- 角色发言：内容 + 点名关系（@Mention 高亮）
- 阶段切换：醒目分隔线
- 评分、合成、错误：特殊样式

**视觉效果**：
- 角色颜色映射（复用 TerminalFormatter 的 ROLE_COLORS）
- 事件类型图标（💡 🗣️ 🎙️ 🎯 📊 📐 🔨 🔍 🚀 ❌）
- 流式动画：新事件从底部滑入

### 2. 阶段详情面板（右侧）

**展示内容**：
- 当前阶段（idea / design / build / review / deploy）
- 轮次 / 总轮次（竞技场）
- 角色发言次数统计
- 最新评分（竞技场结束时）
- 构建阶段：文件列表
- 错误摘要（如有）

**交互**：
- 点击事件 → 详情面板展示该事件详情

### 3. 控制能力

- **暂停/继续**：暂停后新事件缓存，继续后批量展示
- **清空**：清空时间线
- **导出**：导出 JSONL 日志文件
- **重放**（可选）：重新播放历史事件

## 与现有系统集成

### EventBus 扩展

现有 `EventBus.emit()` 追加到 JSONL 文件。需要：

```typescript
// src/observability/event-bus.ts 新增
export class EventBus {
  private wsBridge?: (e: ObsEvent) => void;
  
  setWsBridge(fn: (e: ObsEvent) => void): void {
    this.wsBridge = fn;
  }
  
  emit(e: Omit<ObsEvent, 'ts' | 'time'>): void {
    const event: ObsEvent = { ...e, ts: Date.now(), time: new Date().toISOString() };
    this.events.push(event);
    // ... 现有逻辑
    if (this.wsBridge) this.wsBridge(event);  // 新增
  }
}
```

### CLI 启动 Web Server

```bash
# 新增参数
npx tsx src/cli.ts --web "做一个待办应用"
# 或
npx tsx src/cli.ts --web --port 8080 "做一个待办应用"
```

启动时：
1. 创建 EventBus
2. 启动 WebSocket Server（默认端口 8080）
3. 桥接 EventBus → WebSocket
4. CLI 输出：`Web UI: http://localhost:8080`

## 实现计划

### Phase 1: WebSocket Server + 基础前端

1. Express + ws 服务器
2. EventBus 桥接
3. React 应用骨架
4. WebSocket 连接 hook
5. 基础时间线展示

### Phase 2: 完整 UI

1. EventCard 组件（角色颜色、图标）
2. DetailPanel 组件
3. 控制按钮（暂停/清空）
4. 流式动画

### Phase 3: 集成

1. CLI --web 参数
2. 与 Orchestrator 集成
3. 测试全流水线

## 约束

- **本地开发工具**：无需认证、无需部署优化
- **与 TerminalFormatter 并存**：Web UI 和终端输出同时运行
- **最小改动**：复用现有 EventBus、ObsEvent 类型

## 成功标准

- 启动 CLI 后，Web 页面实时展示事件流
- 角色发言清晰可辨，点名关系可视化
- 全流水线 5 个阶段均正确展示
- 暂停/继续、清空功能可用
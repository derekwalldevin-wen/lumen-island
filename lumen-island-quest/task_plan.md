# Task Plan: 《灯火小岛》原创浏览器 RPG

## Goal

在 `lumen-island-quest/` 中交付一款手机与电脑均可玩、具备探索、实时战斗、锻造、建造、任务与自动存档的原创 2.5D 浏览器 RPG，并通过构建与浏览器验收。

## Current Phase

Complete

## Phases

### Phase 1: Requirements & Originality Boundary

- [x] 检查当前工作区与已有项目
- [x] 解析参考项目的高层玩法结构
- [x] 确认完整机制仿作、手机+电脑、原创世界观
- [x] 固化美术、内容规模与技术设计
- **Status:** complete

### Phase 2: Foundation & Pure Rules

- [x] 创建 Vite + TypeScript 工程
- [x] 定义数据模型、状态、事件与种子随机数
- [x] 实现属性、伤害、经验、灯焰、掉落、锻造、任务规则
- [x] 添加纯规则测试
- **Status:** complete

### Phase 3: World Exploration & Home

- [x] 实现地图状态、相机、碰撞和交互
- [x] 创建 4 个原创区域与可达性检查
- [x] 实现草丛遭遇、NPC、剧情目标和安全港湾
- [x] 实现家园建造与可见变化
- **Status:** complete

### Phase 4: Real-time Battle

- [x] 实现实体、输入、自动瞄准、闪避和药剂
- [x] 实现三类武器连招与主动技能
- [x] 实现 6 种普通敌人、3 名守关者和最终头目
- [x] 实现灯焰、投射物、危险区、伤害反馈与掉落结算
- **Status:** complete

### Phase 5: Presentation, UX & Persistence

- [x] 完成纸雕玩偶风 Canvas 渲染与动画
- [x] 完成中文 HUD、对话、背包、锻造、任务、设置和建造界面
- [x] 完成手机与桌面双输入
- [x] 完成 Web Audio 合成与页面失焦暂停
- [x] 完成版本化存档、备份和损坏回退
- **Status:** complete

### Phase 8: Material & Creature Detail Pass

- [x] 增强主角与 NPC 的表情、服饰细节和方向性
- [x] 为每种敌人/Boss 增加独立轮廓、材质和待机细节
- [x] 增加树屋/锻造台/水面/草木的程序化纹理
- [x] 增加战斗姿态、命中闪白和环境小动画
- [x] 重新生成单文件并做视觉回归
- [x] 运行完整检查并提交
- **Status:** complete

## Key Questions

1. 15–30 分钟内容是否能在保持质量的前提下稳定通关？通过章节门槛与平衡测试验证。
2. Canvas 2D 纸雕玩偶风是否足以形成独特辨识度？通过实际截图和交互验收验证。
3. 一套输入系统能否同时稳定服务桌面和手机？通过两条完整战斗路径验证。

## Decisions Made

| Decision | Rationale |
|----------|-----------|
| 仅借鉴高层玩法循环 | 参考仓库无明确许可证，必须隔离代码、素材与表达 |
| Vite + TypeScript + Canvas 2D + DOM | 无需大型引擎，兼顾移动性能、文字可读性与开发可靠性 |
| 独立目录 `lumen-island-quest/` | 保护现有项目，便于独立构建和交付 |
| 零外部素材 | 避免许可、离线可用性和加载问题 |
| 固定步长 + 种子随机数 | 保证战斗稳定、测试可复现 |
| 规则与渲染分离 | 便于自动测试、平衡和后续维护 |

## Errors Encountered

| Error | Attempt | Resolution |
|-------|---------|------------|
| PowerShell 禁止执行 `claude.ps1` | 1 | 改用 Windows CLI 入口 `claude.cmd` |
| Claude Code 返回 `Not logged in` | 2 | 记录外部鉴权阻塞，按本工作区既有回退策略由 OpenCode 完成 |
| 根仓库存在大量既有未提交项目文件 | 1 | 不修改旧项目，仅创建和操作本项目独立目录与本次设计文档 |
| 读取 `night-voyage-07/tsconfig.json` 与 `vite.config.ts` 失败 | 1 | 文件不存在；仅复用已确认存在的 `package.json` 工具链版本，不重复读取不存在的路径 |
| 首次 `npm install` 超过 120 秒 | 1 | 检查确认未生成半安装；使用 `--no-audit --no-fund` 与 300 秒超时成功安装 |
| 首轮类型检查出现 4 个局部错误 | 1 | 区域列表改名为 `ZONE_LIST`，收窄护符/武器类型，修正建造费用检查 |
| 规则测试发现 `forge ?? 0 < 1` 优先级错误 | 1 | 改为 `(forge ?? 0) < 1`；11/11 测试通过 |
| 标题页内容被 `data-overlay="none"` 隐藏 | 1 | 增加独立 `title` 覆盖层状态；标题按钮可访问 |
| 模式写在 `#app` 而样式绑定 `.game-frame` | 1 | UI 同时在实际游戏容器写入 `data-mode` 与触控状态类 |
| 结算后 HUD 仍显示 battle 模式 | 1 | `continueResult` 显式调用 `ui.setMode('world')` |
| 结算奖励显示经验但未写入 XP | 1 | 结算接入 `awardXp`，并记录升级数量与提示 |
| Lighthouse 提示禁止缩放 | 1 | 移除 `user-scalable=no`，保留触控游戏的 `touch-action: none` |
| 用户反馈页面只有深蓝色、看不到游戏 | 1 | 发现构造顺序错误：先查询 canvas 再创建 UI，改为先创建 UI 再绑定真实 `#game-canvas`；浏览器像素验证通过 |
| 修复画布后仍被深蓝遮罩覆盖 | 1 | 空的 `#fatal-root[hidden]` 被 `.fatal-root{display:grid}` 覆盖；增加 `.fatal-root[hidden]{display:none}` |
| 用户反馈“无法访问 URL” | 1 | 服务器重启后 localhost 失效；启动器改为 `explorer.exe` 直接打开本地 HTML，不使用 URL |
| WASD 上下无法移动 | 1 | `tryMove()` 先处理 `dx=0` 并提前返回；改为仅处理非零轴，新增纵向移动回归测试；20/20 通过 |

## Notes

- 重大决策前重读本文件。
- 每完成一阶段更新状态与 `progress.md`。
- 所有测试和浏览器发现写入 `progress.md` / `findings.md`。
- 不覆盖用户已有工作，不操作根目录旧任务文件。

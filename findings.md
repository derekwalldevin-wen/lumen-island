# Findings & Decisions — 《灯火小岛》

## Requirements

- 模仿参考项目的“完整机制”体验，不复制其受保护表达。
- 采用原创《灯火小岛》世界观：云海、纸灯、星屑、暮影与家园修复。
- 目标设备为手机竖屏和桌面浏览器，两套输入均需完整可玩。
- 首版包含探索、实时战斗、掉落、锻造、建造、任务、章节推进与自动存档。
- 目标一周目 15–30 分钟。
- 使用程序化素材，项目无后端且可静态部署。

## Research Findings

- 参考项目是 TypeScript/Bun 驱动的手机优先 2.5D Q 版 RPG，核心由探索、圆形竞技场实时战斗、装备锻造、村庄成长、区域守关和任务链组成。
- 参考仓库 GitHub API 返回 `license: null`，不得假定其代码或美术可被复制。
- 当前根目录已有多个独立游戏项目和未提交文件；新游戏必须放在 `lumen-island-quest/` 并避免触碰旧目录。
- 当前工作区既有的 Vite 游戏均使用独立 `package.json`，适合复用本机工具链习惯，但不直接复用旧项目代码。
- Claude Code CLI 已安装，但 PowerShell 阻止 `claude.ps1`；`claude.cmd` 可启动但当前账户未登录。

## Technical Decisions

| Decision | Rationale |
|----------|-----------|
| Canvas 2D 绘制世界与战斗，DOM 绘制 UI | Canvas 适合程序化粒子和角色；DOM 保证中文排版、键盘访问与移动端菜单质量 |
| 数据驱动的区域、敌人、装备和任务配置 | 调整平衡时无需重写系统，并便于测试与内容扩展 |
| 圆形碰撞与扇形攻击判定 | 适合俯视实时战斗，易调试且能配合攻击拖尾可视化 |
| 固定时间步 + 分离渲染 | 保持不同帧率下战斗一致，避免刷新后时间跳跃 |
| 种子随机数 | 可复现遭遇、掉落和地图装饰，支持自动化测试 |
| localStorage 主存档 + 上一版本备份 | 静态站实现简单，并降低损坏存档风险 |
| 关键节点保存而非每帧保存 | 避免频繁写入，同时保证章节、购买和战斗结果可靠 |
| 玩家当前生命值进入存档数据 | 仅由等级推导会在读档时产生低生命错误；建筑升级与药剂也需要持久状态 |

## Issues Encountered

| Issue | Resolution |
|-------|------------|
| Claude Code 首次调用被执行策略阻止 | 使用 `claude.cmd` |
| Claude Code 未登录，无法执行代码任务 | 采用工作区既有回退方式继续，保留错误记录 |
| 根仓库有大量用户项目改动 | 只添加本项目及本次设计文件，不清理、不重置、不暂存旧文件 |

## Resources

- 参考项目：https://github.com/aibengineering/sprout-quest
- 参考在线版：https://aibengineering.github.io/sprout-quest/
- 本次设计：`docs/plans/2026-09-25-lumen-island-quest-design.md`
- 当前设计决策：`lumen-island-quest/task_plan.md`

## Visual Direction

- 关键词：月光纸雕、手工玩偶剧场、墨蓝夜空、奶油月光、灯芯金、珊瑚红。
- 地图前景是浮岛边缘和纸灯，中景是角色/建筑，远景是云海与星屑。
- 暮影侵蚀通过区域暖色被抽离、轮廓增黑、星屑减少来表达。
- HUD 使用悬挂灯牌与邮戳资源，不使用常见玻璃卡片或紫色渐变。
- Boss 登场应先遮蔽云层，再让灯火逐层恢复。

## Visual/Browser Findings

- 浏览器开发服务器首屏会生成完整标题层；初版因 `data-overlay="none"` 被 CSS 隐藏，已改为独立 `title` 状态。
- UI 模式最初写在 `#app` 而样式绑定 `.game-frame`，导致标题页 HUD 未隐藏；已统一将 `data-mode`、触控类和邻近提示类写入实际游戏容器。
- 标题页、对话、结算、面板均可通过可访问性树读取；Lighthouse Accessibility 0.93，剩余提示来自禁止页面缩放，已移除 `user-scalable=no`。
- 浏览器后台标签会暂停 RAF，验收时需手动调用内部更新或切换到可见窗口；这不代表游戏逻辑停摆，页面恢复可见后继续运行。
- 390px 移动视口无水平溢出，标题按钮尺寸约 150×79，HUD 使用网格重排；触控区由 `pointer: coarse` 媒体查询显示。
- 关键启动 bug：`Game` 构造函数原本在 `UIController` 创建模板前查询 `#game-canvas`，因此 `querySelector` 失败后使用脱离 DOM 的临时 canvas；用户只看到背景深蓝。修复为先创建 UI、再查询并绑定真实画布。
- 关键启动 bug：`Game` 构造函数原本在 `UIController` 创建模板前查询 `#game-canvas`，因此 `querySelector` 失败后使用脱离 DOM 的临时 canvas；用户只看到背景深蓝。修复为先创建 UI、再查询并绑定真实画布。
- 第二个启动 bug：空错误层 `<div id="fatal-root" hidden>` 被作者样式 `.fatal-root { display:grid }` 覆盖了浏览器默认 `[hidden]` 规则，形成全屏深蓝遮罩。增加 `.fatal-root[hidden] { display:none }` 后标题、对话和按钮恢复可见。
- Vite 的 `dist/index.html` 使用外部 `type="module"` 脚本，双击 `file://` 会被浏览器模块安全策略拦截；新增内联 CSS/JS 的 `play-lumen-island.html` 与 `打开游戏.cmd`，双击即可运行。
- 纵向移动 bug 已复现并修复：`WorldRuntime.tryMove()` 原来对 `dx=0` 的纯垂直移动也先判定 X 轴成功并返回，导致 W/S 永远不执行 Y 轴。现在只处理非零轴，并加入港口出生点纵向/横向移动回归测试。
- `打开游戏.cmd` 初版含中文 `echo` 文本，在 Windows 默认 `cmd.exe` 代码页下会把提示解析成命令，导致启动器本身报错；批处理内容已改为纯 ASCII，并改用 `explorer.exe` 直接打开本地 HTML。新增 ASCII 名称 `play.cmd` 作为备用入口。

- 2026-09-26 高清掌机赛璐璐美术回归：地图截图确认水波/浮萍/花草散布/岛缘植被可见；战斗截图确认暖色竞技场、双层边缘、角色渐变体积与星屑氛围可见。
- 第二轮素材深化：区域专属道具与生物细节加入后，地图空白区更有生活感；港湾灯笼串/告示牌/木箱、云阶路牌、纸灯林挂旗、雨芽发光菌、观星星柱均程序化生成。角色表情加入眼白/高光，敌人加入独立纹理与待机装饰。

每两次浏览、搜索或视觉检查后，将新发现更新到本文件。

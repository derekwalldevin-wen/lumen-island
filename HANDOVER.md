# 灯火小岛 · 交接文档

> 面向接手的 AI Agent / 开发者。读完这一份就能开始干活。
> 最后更新：2026-10-11（挥砍动画上线 + 两个渲染 bug 修复）
> 线上：https://derekwalldevin-wen.github.io/lumen-island/

---

## 0. 三十秒版本

《灯火小岛》是一个**原创 Q 版 2.5D 俯视 RPG**，纯前端、零运行时依赖（devDependencies 只有 typescript / vite / vitest）。
玩法结构参考了 Sprout Quest 的**高层框架**，**没有复制任何代码、素材、角色、地图、图标、音频或文本**。

- 5 个可探索岛屿，6 种普通敌人 + 3 个守关 + 1 个最终 Boss
- 3 条升级路线（灯 / 雨 / 星），共 10 种原创装备，4 个岛屿建筑
- 战斗为**实时自动战斗**（自动索敌，玩家只管走位和技能）
- 美术：**高清掌机赛璐璐**。角色/敌人/Boss/武器/建筑是交付的 AI 厚涂立绘（已按显示分辨率烘焙成 PNG），地形/植被/道具是程序化 Canvas 绘制

**当前状态：169 个测试全绿，已部署，本地无未提交改动。**

---

## 1. 目录在哪

```
C:\Users\derek\Documents\00-德里克文项目\01_Projects 项目\VIBE CODING项目\lumen-island-quest\
```

**注意**：仓库根目录（`...\VIBE CODING项目`）下有 **10 个其他项目**。只改 `lumen-island-quest/`，不要碰别的。

### 目录结构

```
lumen-island-quest/
├─ src/
│  ├─ main.ts               1KB   入口
│  ├─ game.ts              55KB   主循环 / 模式切换 / 渲染派发
│  ├─ data.ts              23KB   ★ 所有静态配置：ZONES / WEAPONS / BUILDINGS / MATERIALS / ENEMIES / SWING_DURATION
│  ├─ types.ts              7KB   全部类型定义
│  ├─ styles.css           43KB   全部样式（含 @media (pointer: coarse) 触屏层）
│  ├─ core/
│  │  ├─ input.ts           9KB   键鼠 + 动态触屏摇杆
│  │  ├─ rng.ts             1KB   SeededRandom / hashString（美术全部靠它做确定性变化）
│  │  └─ commands.ts        1KB   命令分发
│  ├─ render/
│  │  ├─ visuals.ts       165KB   ★★ 全项目最大文件，几乎所有绘制都在这里
│  │  ├─ layers.ts         12KB   ★ 静态图层烘焙缓存（性能命脉）
│  │  └─ sprites.ts         5KB   AI 立绘加载器
│  ├─ world/worldRuntime.ts 7KB   玩家在世界中的位置/碰撞/进岛
│  ├─ battle/battleRuntime.ts 29KB 战斗逻辑（无渲染）
│  ├─ rules/gameRules.ts   11KB   数值规则：伤害、升级、建造、合成
│  ├─ save/saveManager.ts   9KB   存档读写 + 校验
│  ├─ guide/guide.ts       13KB   新手引导状态机
│  ├─ ui/ui.ts             21KB   DOM UI（HUD / 面板 / 触屏按钮）
│  ├─ ui/hints.ts           2KB
│  └─ audio/gameAudio.ts    8KB   Web Audio 程序化音效
├─ tests/                        13 个测试文件，169 个用例
├─ public/art/                   21 张 AI 立绘 PNG（349KB），已按显示分辨率烘焙
├─ scripts/build-standalone.mjs  把 CSS/JS/PNG 全部内联成单个 HTML
├─ play-lumen-island.html   688KB   ★ 离线单文件版，双击即玩
├─ dist/                         构建产物，部署用，不要手改
└─ package.json
```

### 部署用的第二个副本

```
C:\Users\derek\AppData\Local\Temp\opencode\lumen-island-deploy\
```

这是 GitHub 仓库 `derekwalldevin-wen/lumen-island` 的独立克隆，**游戏文件在仓库根**（不是子目录）。
主仓和这个克隆要分别提交推送，详见第 7 节。

---

## 2. 怎么跑

```powershell
cd "C:\Users\derek\Documents\00-德里克文项目\01_Projects 项目\VIBE CODING项目\lumen-island-quest"

npm.cmd run dev            # 开发服务器
npm.cmd run check          # ★ typecheck + test + build，提交前必跑
npm.cmd run test           # 只跑测试
npm.cmd run typecheck      # 只跑类型检查
npm.cmd run build:standalone   # 生成离线单文件版
npm.cmd run preview        # 预览 dist
```

**用户最简单的打开方式**：双击 `play-lumen-island.html`，或双击 `play.cmd` / `开始游戏.cmd`。
不需要 Node / Vite / 本地服务器。这是用户明确提出的硬需求，任何改动都不能破坏它。

---

## 3. 架构上必须知道的四件事

### 3.1 静态图层烘焙（性能命脉）

`src/render/layers.ts` 的 `staticLayer()` 把不随时间变化的画面烘焙成离屏 canvas。

- 分两类：`kind: 'scene'`（天空、岛屿）和 `kind: 'prop'`（单个道具）
- **两级淘汰**：场景图层和道具图层分开算配额。道具池上限是**像素预算** `MAX_PROP_PIXELS = 2_200_000`，不是数量上限——按数量限制会颠簸（一个区域有 12 棵树），按像素才稳
- `MAX_LAYER_PIXELS = 2_000_000`。**实测过：提到 400 万视觉上看不出差别**，因为地面的糊来自贴图美术而不是 backing resolution。注释留在代码里了，别再试
- 烘焙发生在**视口剔除之后**，否则屏幕外的道具会挤掉屏幕内的，导致每帧重烘

**判断某段绘制能不能烘焙的唯一标准：它读不读 `time`。** 读 `time` 的必须留在实时路径。

- 可烘焙：`tree` `rock` `ledge` `plinth`
- 必须实时：`water`（涟漪）`flower`（摇曳）`house`（窗户亮光）`forge`（炉火）`ruin`（灯笼摇）`lantern`

道具**不能**烘进岛屿图层——它们要和主角做深度排序，主角必须能从树后面走过。

### 3.2 美术全部靠 `SeededRandom` 做确定性变化

`core/rng.ts` 的 `hashString` / `SeededRandom` 是唯一的随机源。**不要用 `Math.random()`**，
否则同一棵树每帧长得不一样，烘焙缓存的 key 也会失效。

### 3.3 深度排序

`drawWorldScene` 把障碍物和可交互物塞进 `drawables` 数组，按 `y` 排序后逐个绘制。
岛屿图层、地面、草、区域道具、灯光在**这之前**画完。

### 3.4 灯光顺序有讲究

`drawLanternLighting`（冷色环境光 + `lighter` 暖色光池）必须在道具**之后**画，
这样光池才会横穿树干和墙壁，而不是只落在地面上。
`drawCharacterRimLight` 画在角色之上——不能画全轮廓线，会和厚涂立绘自带的暗边打架。

---

## 4. 上一轮刚做完的挥砍动画（重点，容易再踩坑）

用户问「攻击的时候是不是应该有动画」，答案是之前**角色本身完全没有动画**——
只有火花、受击闪白、屏幕抖动、伤害数字，敌人甚至还有预警圈，主角就站着不动。

### 4.1 已实现

角色美术是**单张静态图**，没有帧序列，所以动作全靠变换这一张图：
沿朝向突进（lunge）、绕脚底旋转（twist）、命中瞬间压扁（squash）。

- 曲线在 `visuals.ts` 的 `swingPose(progress, step)`，**分段关键帧**，不是单条缓动：
  起手缓出 → 打击加速 → 收势越过中位再回位
- 三连击三段弧线各不相同：横斩、反手撩、下劈
- `SWING_DURATION = 0.34`，**放在 `data.ts`**，因为战斗运行时倒数、渲染器映射成姿态，两边必须同一个数

### 4.2 两个只有看画面才能发现的 bug（已修，但要知道这类风险存在）

**① 主角被推到画布外。** 我 `ctx.translate` 到主角脚下做旋转轴，又把 `visual.x/y` 传给 `drawSprite`，
位置被应用了两次 → 主角画在 canvas y=1666，而画布只有 1212 高。**画面上只剩影子和灯光glow。**

修法：变换原点落在主角脚下，`drawSprite` 传 x=0，朝左时绕这个原点镜像。

**② 反手撩画成实心圆盘。** `ctx.arc` 在 start > end 且没设逆时针时会**绕远路**，
角度下降的弧（正是反手撩那一下）会填出接近整圆。现在角度统一排序。

半径也从 `26~78` 收窄到 `22~62`——原来那个宽度读起来像角色周围的光环，不像武器划过空气。

### 4.3 ⚠️ 这里的测试覆盖是有缺口的

**`drawHero` 里应用挥砍变换的那段代码，单元测试根本走不到**：
`fitSprite()` 在没有已加载图片时返回 `null`，所以那个分支在测试环境永远不执行。

这就是为什么 `drawSwingTrail` 被单独导出并单独测试——**至少能测的部分要测**。

**给接手者的建议**：改 `drawHero` 之后，必须在浏览器里实际看帧，不能只信测试绿。

---

## 5. 视觉验证怎么做（这一步不能省）

游戏暴露了全局调试句柄 `window.__lumenIslandQuest`（含 `tick` / `world` / `battle` / `canvas` / `mode` / `overlay`）。

**标准流程**：

1. `npm.cmd run build` 然后起 preview（`npx.cmd vite preview --port <port> --host 127.0.0.1`）
2. 开一个**回环 HTTP 收图服务**在 `http://127.0.0.1:8940`：
   - 浏览器里 `fetch('http://127.0.0.1:8940/'+name, {method:'POST', body: dataUrlBase64})`
   - 服务端把 base64 解码成文件写到 `C:\Users\derek\AppData\Local\Temp\opencode\shots\`
3. 页面上把 `game.canvas` 裁剪缩放后 `canvas.toDataURL('image/jpeg', 0.92)`
4. 用 read 工具直接看图
5. **收尾必须杀掉收图进程和 vite 进程**

**跳到指定状态的常用代码**：

```js
// 进战斗
g.overlay = 'none';
g.startBattle(['cloudPuff']);      // 注意是数组
g.battle.intro = 0;
g.battle.hero.facing = 0;

// 进世界并定位
g.battle = null; g.mode = 'world';
g.world.enterZone('paperwood');
g.world.x = 420; g.world.y = 470;

// 手动推进若干帧
for (var i=0;i<4;i++) g.tick(performance.now()+i*16.7);

// 真实连打（触发完整动画）
window.dispatchEvent(new KeyboardEvent('keydown', {code:'KeyJ', key:'j', bubbles:true}));
```

**踩过的坑**：
- 用 `window.innerWidth = 390` 模拟手机**无效**，CSS 媒体查询不认。测粗指针必须靠读 CSS 源码（`tests/touch.test.ts` 就是这么做的）
- `document.images` 是空的——立绘用 `new Image()` 加载没挂到 DOM，要查是否加载成功得看 `performance.getEntriesByType('resource')`
- 游戏自己有 rAF 循环，手动 `g.tick()` 会和它打架。状态改完立刻截图，别等
- 帧时间测量不可信（标签页会被隐藏/后台化，p50 在 2.3~20ms 之间跳）。**Canvas 调用次数才是可信指标**

---

## 6. 测试

```powershell
npm.cmd run test     # 169 个用例，13 个文件
```

| 文件 | 覆盖什么 |
|---|---|
| `terrain.test.ts` | ★ 岛屿轮廓、出生点/可交互点是否站得住、**从出生点能否走到每个目标** |
| `reachability.test.ts` | 同上，可达性 |
| `render.test.ts` | 绘制冒烟测试 + 一个会记录调用/坐标/弧线的 RecordingContext |
| `save-compat.test.ts` | 恶意/残缺/旧版存档，含「加载后能否构造出可玩的 WorldRuntime」 |
| `swing.test.ts` | 挥砍曲线的运动形状（起手向后、压扁峰值、弧线单向、三段可区分） |
| `layers.test.ts` | 像素预算、覆盖率、淘汰上界 |
| `lighting.test.ts` | 道具缓存键、可烘焙种类、flame 单调性 |
| `touch.test.ts` | 触屏摇杆几何、44px 最小热区（读 CSS 源码） |
| `guide.test.ts` / `discoverability.test.ts` | 引导与可发现性 |
| `runtime.test.ts` / `gameRules.test.ts` / `sprites.test.ts` | 各自模块 |

**`RecordingContext` 在 `tests/render.test.ts` 里**，会：
- 对**非有限坐标抛异常**（这是个强不变量，NaN 会在这里被抓住）
- 记录调用数、路径点、弧线的半径和角度

`tests/node-builtins.d.ts` 只声明了实际用到的 `node:fs` / `node:path` / `process.cwd`。
项目**刻意不装 `@types/node`**（一个依赖都不要），用这个文件代替。

---

## 7. 部署流程（含两个必须知道的坑）

游戏文件在 GitHub 仓库 `derekwalldevin-wen/lumen-island` 的**根目录**，
用 `.github/workflows/deploy.yml` 发到 GitHub Pages。

### 流程

```powershell
$src = "...\VIBE CODING项目\lumen-island-quest"
$d   = "C:\Users\derek\AppData\Local\Temp\opencode\lumen-island-deploy"

# 0. 主仓先提交
git -C "...\VIBE CODING项目" add -- "lumen-island-quest"
git -C "...\VIBE CODING项目" commit -m "..."

# 1. 确保部署克隆还在，且有 git 身份
if (-not (Test-Path "$d\.git")) { git clone "https://github.com/derekwalldevin-wen/lumen-island.git" $d }
git -C $d config user.name "OpenCode Agent"
git -C $d config user.email "opencode-agent@local"

# 2. 拷文件进去（.github 必须活下来）
robocopy $src $d /E /XD node_modules dist .git .github /NFL /NDL /NJH /NJS /NP

# 3. 检查暂存内容是否只有真实改动
git -C $d add -A
git -C $d diff --cached --stat

# 4. 提交 + 推送（GitHub 连接不稳，要循环重试）
git -C $d commit -m "..."
for ($i=1; $i -le 12; $i++) {
  git -C $d -c http.version=HTTP/1.1 push
  if ($LASTEXITCODE -eq 0) { break }
  Start-Sleep -Seconds 12
}

# 5. 验证真的推上去了（见坑②）
"local : $(git -C $d rev-parse HEAD)"
"remote: $(git -C $d rev-parse origin/main)"     # 两个必须一致

# 6. 等 CI，然后核对线上产物哈希
```

### ⚠️ 坑

**① 绝不要用 `robocopy /MIR`。**
项目目录里**没有** `.github/`，`/MIR` 会把 Pages 的部署 workflow 整个删掉，站点直接挂。
用 `/E` 并显式 `/XD .github`。

**② `PUSH_OK` 不代表推出去了。**
必须 `git rev-parse HEAD` 和 `git rev-parse origin/main` 对比。
新克隆的仓库**没有 git 身份**，第一次 commit 会静默失败并报
`fatal: unable to auto-detect email address`。

**③ `robocopy` 之后 `git status` 会显示所有文件都改了。**
这是 CRLF/LF 噪音。看 `git diff --cached --stat`，只有真实改动该出现。

**④ GitHub 连接会断。**
`Test-NetConnection github.com -Port 443` 通过不代表 git 能用，
TLS 层可能被掐（`schannel: server closed abruptly`）。
循环重试，间隔 12~20 秒，实测要试到第 10 次才通。

**⑤ 改完中文文件后必须重新 `npm run build:standalone` 再提交**，
否则 `play-lumen-island.html` 里还是旧代码。

---

## 8. ⚠️ 绝对不要做的事

1. **不要用 PowerShell `Set-Content` 改任何含中文的文件。**
   曾经把 `src/data.ts` 的编码搞坏，直接构建失败。用 edit 工具，或者在测试里运行时注入。

2. **不要碰其他项目。**
   仓库根下有 `abyss-salvage`、`gulangyu-3d`、`sunny-coast-racer` 等 10 个项目。

3. **不要引入运行时依赖。** 目前只有 3 个 devDependency，保持这样。

4. **不要破坏双击即玩。** 任何新资源都必须能被 `build-standalone.mjs` 内联。

5. **不要加 `Math.random()` 到任何绘制路径**（见 3.2）。

6. **不要只靠测试判断 `drawHero` 改对了**（见 4.3）。

---

## 9. 已知欠债 / 可以继续做的

### 明确记在账上的

- **`visuals.ts` 里约 800 行程序化建筑美术**现在只在**立绘加载失败时**才跑兜底。
  留着还是删掉，是个产品决定——删了就没兜底，留着就是死代码。
- **`drawHero` 无测试覆盖**（见 4.3）。要做的话得上 jsdom + canvas，或者把变换抽成可单测的纯函数。

### 还没验证的

- **真机触屏从未实测过。** 浏览器模拟不了粗指针。动态摇杆的**定位算术**在浏览器里用合成 pointer 事件验过（5 个触摸点零像素漂移），但真机手感没人碰过。
- **挥砍动画的「手感」没人评价过。** 结构是对的、帧看过了，但突进幅度 17px、旋转 0.2 弧度、拖尾亮度这些数值是拍脑袋定的。玩一玩再调——都是集中可调的常量。

### 可以考虑的优化方向

- **敌人动画**：和主角一样的变换思路（受击已有 `hitFlash`，但没有主动攻击动作）
- **水塘/池塘**还是硬边扁椭圆，和新的草丛质感不搭
- **云**还是扁椭圆
- **云步道（cloudstep）树只有 4 棵**，也可以补

---

## 10. 快速上手任务（建议接手者先做这个）

1. 跑一遍 `npm.cmd run check`，确认基线是绿的
2. 双击 `play-lumen-island.html` 玩一下，感受挥砍动画的手感
3. 起 preview + 收图服务（见第 5 节），抓几张各岛屿的图看当前状态
4. 挑一个欠债项做——**推荐先做「敌人攻击动作」**，因为它和刚做完的主角动画共用 `swingPose` 那套思路，能验证这套模式好不好复用

---

## 附：数据速查

| 项 | 值 |
|---|---|
| 岛屿 | `harbor` `cloudstep` `paperwood` `rainbud` `starfall` |
| 武器 | `sprigFork` `bellShoot` `moonKnife` `rainCane` `cometAxe` |
| 材料 | `cloudFluff` `lampPaper` `rainPearl` `starSand` `inkWing` `oldGear` `moonThread` |
| 建筑 | `forge` `cottage` `beacon` `rainCanopy` `starChart` |
| 普通敌人 | 9 种 |
| 守关 | 3 |
| 设计分辨率 | 480 × 800 |
| 存档 key | `lumen-island-quest:save:v1`（+ `:backup`） |
| 存档版本 | `SAVE_VERSION = 1` |
| 挥砍时长 | `SWING_DURATION = 0.34` |

**操作**：`WASD`/方向键移动，`J` 攻击，`K` 技能，`L` 喝药，`H` 回城，`E` 交互，`B` 建造，`Esc` 暂停
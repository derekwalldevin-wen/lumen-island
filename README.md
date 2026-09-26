# 灯火小岛 · Lumen Island Quest

一款原创 Q 版 2.5D 浏览器 RPG：手机竖屏触控优先，同时完整支持桌面键盘与鼠标。

> 灵感来自“探索 → 实时战斗 → 锻造 → 家园成长 → 守关推进”的冒险游戏结构；本项目不复制参考项目的代码、素材、角色、地图、美术管线或文案。

## 特色

- 5 个可探索区域：灯火港、云阶草坡、纸灯林、雨芽花园、观星高台。
- 6 种普通暮影、3 名守关者与 1 个最终头目。
- 3 类武器与 10 件原创装备、4 类护符、3 条巡灯路线。
- 圆形竞技场实时战斗：自动瞄准、连击、闪避、精准闪避、灯焰值、主动技能与药剂。
- 草丛遭遇、任务链、锻造配方、岛屋建造、区域解锁与本地自动存档。
- 所有图形、纸雕场景、角色、怪物、粒子、纹理与 Web Audio 音效由代码生成。
- 无后端、无账号、无外链图片/模型/字体/音频。

## 最简单的打开方式

**双击项目根目录的 `打开游戏.cmd`（或 `play.cmd`）**，或直接双击 `play-lumen-island.html`。

这是内联 CSS/JS 的离线单文件版本，不需要 Node.js、Vite、终端、服务器或网络。

## 开发

```bash
npm.cmd install
npm.cmd run dev
```

打开 Vite 输出的本地地址。手机与电脑在同一局域网时，可用 Vite 输出的 Network 地址访问。

## 构建与检查

```bash
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
npm.cmd run build:standalone
npm.cmd run preview
```

构建产物在 `dist/`，可直接部署到 GitHub Pages、Netlify、Cloudflare Pages 或任意静态文件服务器。

## 操作

### 桌面

- `WASD` / 方向键：移动
- `J` / 空格：攻击（可长按连击）
- `K`：闪避
- `L`：武器技能
- `H`：药剂
- `E`：互动
- `B`：背包
- `Esc`：暂停菜单

菜单中可用 `Enter` / `Space` 确认，`Esc` 关闭。

### 手机

- 左侧摇杆：移动
- 右下按钮：攻击、闪避、技能、药剂
- 靠近 NPC、门、锻台或建造板后点击/按 `E` 互动

## 存档

进度自动写入浏览器 `localStorage`，关键事件和每 8 秒保存一次。主存档损坏时会尝试上一份备份；游戏不依赖服务器。

## 原创说明

本项目是独立原创实现。设计文档见仓库根目录 `docs/plans/2026-09-25-lumen-island-quest-design.md`。

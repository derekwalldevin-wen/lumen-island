import { BUILDINGS, CHARMS, ENEMIES, MATERIALS, ROUTES, WEAPONS, ZONES } from './data';
import { GameAudio } from './audio/gameAudio';
import { BattleResult, BattleRuntime } from './battle/battleRuntime';
import { hashString, SeededRandom } from './core/rng';
import { GameCommand, UiPanel } from './core/commands';
import { InputController } from './core/input';
import { SaveManager } from './save/saveManager';
import { UIController } from './ui/ui';
import { guideStepCount, isAtGuideMarker, resolveGuide } from './guide/guide';
import { drawBattleScene, drawTitleScene, drawWorldScene, BASE_HEIGHT, BASE_WIDTH } from './render/visuals';
import {
  advanceQuest,
  awardXp,
  build,
  canBuild,
  canCraft,
  createInitialSave,
  craft,
  describeMaterialAmount,
  equipItem,
  getPlayerStats,
  getQuestText,
  isZoneUnlocked,
  canInteractWith,
  xpForNextLevel,
} from './rules/gameRules';
import { WorldRuntime } from './world/worldRuntime';
import type {
  BuildingId,
  CharmDefinition,
  MaterialId,
  SaveData,
  SceneMode,
  WeaponDefinition,
  ZoneId,
} from './types';

interface ViewState {
  dpr: number;
  scale: number;
  offsetX: number;
  offsetY: number;
  width: number;
  height: number;
}

interface RewardSummary {
  xp: number;
  gold: number;
  starlight: number;
  materials: Partial<Record<MaterialId, number>>;
  potion: number;
  levelsGained: number;
  questNote: string;
  bossName: string;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function formatNumber(value: number): string {
  return Math.round(value).toLocaleString('zh-CN');
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export class Game {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly ui: UIController;
  private readonly input: InputController;
  private readonly audio = new GameAudio();
  private readonly saveManager: SaveManager;
  private readonly random: SeededRandom;
  private save: SaveData;
  private world: WorldRuntime;
  private battle: BattleRuntime | null = null;
  private mode: SceneMode = 'title';
  private overlay: 'none' | UiPanel | 'dialogue' | 'result' | 'pause' = 'none';
  private view: ViewState = { dpr: 1, scale: 1, offsetX: 0, offsetY: 0, width: 1, height: 1 };
  private time = 0;
  private lastFrame = 0;
  private camera = { x: 0, y: 0 };
  private attackHeld = false;
  private pendingDodge = false;
  private pendingSkill = false;
  private pendingPotion = false;
  private dialogueAction: (() => void) | null = null;
  private pendingResultDialogue: { speaker: string; text: string } | null = null;
  private pendingResultMode: 'victory' | 'defeat' | null = null;
  private pageHidden = false;
  private raf = 0;
  private saveTicker = 0;
  private guide: ReturnType<typeof resolveGuide> | null = null;
  private guideIntroShown = false;

  constructor(root: HTMLElement) {
    this.ui = new UIController(root, (command) => this.handleCommand(command));
    const canvas = root.querySelector<HTMLCanvasElement>('#game-canvas');
    if (!canvas) throw new Error('Game canvas is missing');
    this.canvas = canvas;
    const context = this.canvas.getContext('2d');
    if (!context) throw new Error('Canvas 2D is not available');
    this.ctx = context;
    this.input = new InputController(root, (command) => this.handleCommand(command));
    this.saveManager = new SaveManager();
    this.random = new SeededRandom(Date.now());
    this.save = createInitialSave();
    this.world = new WorldRuntime(this.save);
    this.bindEnvironment();
    this.resize();
    this.ui.setTouchVisible(this.save.settings.showTouch);
    this.ui.setTutorialBattleSeen(this.save.world.tutorialBattleSeen);
    this.ui.renderTitle(this.saveManager.hasSave(), false);
  }

  start(): void {
    this.lastFrame = performance.now();
    this.raf = requestAnimationFrame(this.tick);
  }

  destroy(): void {
    cancelAnimationFrame(this.raf);
    this.input.destroy();
  }

  private bindEnvironment(): void {
    window.addEventListener('resize', () => this.resize());
    document.addEventListener('visibilitychange', () => {
      this.pageHidden = document.hidden;
      if (document.hidden) void this.audio.pause();
      else void this.audio.resume();
    });
    this.canvas.addEventListener('pointerdown', (event) => {
      if (this.mode !== 'battle' || this.overlay !== 'none') return;
      this.attackHeld = true;
      this.canvas.setPointerCapture?.(event.pointerId);
    });
    const release = () => {
      if (this.mode === 'battle') this.attackHeld = false;
    };
    this.canvas.addEventListener('pointerup', release);
    this.canvas.addEventListener('pointercancel', release);
    this.canvas.addEventListener('contextmenu', (event) => event.preventDefault());
  }

  private resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    const width = Math.max(1, rect.width || window.innerWidth);
    const height = Math.max(1, rect.height || window.innerHeight);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(width * dpr);
    this.canvas.height = Math.round(height * dpr);
    const scale = Math.min(width / BASE_WIDTH, height / BASE_HEIGHT);
    this.view = {
      dpr,
      scale,
      offsetX: (width - BASE_WIDTH * scale) / 2,
      offsetY: (height - BASE_HEIGHT * scale) / 2,
      width,
      height,
    };
  }

  private tick = (timestamp: number): void => {
    const delta = Math.min(0.05, Math.max(0, (timestamp - this.lastFrame) / 1000));
    this.lastFrame = timestamp;
    this.time += delta;
    if (!this.pageHidden && this.overlay === 'none') {
      if (this.mode === 'world') this.updateWorld(delta);
      if (this.mode === 'battle') this.updateBattle(delta);
      this.save.stats.playSeconds += delta;
      this.saveTicker += delta;
      if (this.saveTicker > 8) {
        this.saveTicker = 0;
        this.persist();
      }
    }
    this.render();
    if (this.mode === 'world') this.updateWorldHud();
    if (this.mode === 'battle' && this.battle) this.ui.setBattleHud(this.battle.getHudState());
    this.raf = requestAnimationFrame(this.tick);
  };

  private updateWorld(delta: number): void {
    const stats = getPlayerStats(this.save);
    const events = this.world.update(
      this.input.getMovement(),
      delta,
      stats.moveSpeed,
      this.random,
      this.overlay === 'none',
    );
    if (events.stepped) this.audio.play('step');
    if (events.enteredGrass) this.startRandomBattle();
  }

  private updateBattle(delta: number): void {
    if (!this.battle) return;
    const input = {
      move: this.input.getMovement(),
      attack: this.attackHeld,
      dodge: this.pendingDodge,
      skill: this.pendingSkill,
      potion: this.pendingPotion,
    };
    this.pendingDodge = false;
    this.pendingSkill = false;
    this.pendingPotion = false;
    this.battle.update(delta, input, this.save);
  }

  private render(): void {
    const { dpr, scale, offsetX, offsetY } = this.view;
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.fillStyle = '#0b1422';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.setTransform(dpr * scale, 0, 0, dpr * scale, dpr * offsetX, dpr * offsetY);
    this.ctx.clearRect(0, 0, BASE_WIDTH, BASE_HEIGHT);
    if (this.mode === 'title') {
      drawTitleScene(this.ctx, this.time, this.save.settings.reducedMotion);
    } else if (this.mode === 'world') {
      this.updateCamera();
      this.guide = resolveGuide(this.save, this.world.currentZone.id, this.world.x, this.world.y);
      const marker = this.guide.marker;
      drawWorldScene(this.ctx, this.world, this.save, {
        time: this.time,
        camera: this.camera,
        nearbyId: this.world.getNearbyInteractable()?.id ?? null,
        reducedMotion: this.save.settings.reducedMotion,
        guide: marker
          ? {
            x: marker.x,
            y: marker.y,
            label: marker.kind === 'gate' ? `前往 ${marker.label}` : marker.label,
            kind: marker.kind,
            inRange: isAtGuideMarker(this.guide, this.world.x, this.world.y),
          }
          : null,
      });
    } else if (this.battle) {
      const hud = this.battle.getHudState();
      drawBattleScene(
        this.ctx,
        this.battle.hero,
        this.battle.enemies,
        this.battle.projectiles,
        this.battle.hazards,
        this.battle.particles,
        this.battle.texts,
        {
          time: this.time,
          shake: clamp(this.battle.particles.length * 0.12, 0, 4),
          flame: hud.flame,
          combo: hud.combo,
          reducedMotion: this.save.settings.reducedMotion,
          intro: this.battle.intro,
          weaponType: this.getWeapon().type,
        },
      );
    }
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  private updateCamera(): void {
    const zone = this.world.currentZone;
    const targetX = clamp(this.world.x - BASE_WIDTH / 2, 0, Math.max(0, zone.width - BASE_WIDTH));
    const targetY = clamp(this.world.y - BASE_HEIGHT * 0.54, 0, Math.max(0, zone.height - BASE_HEIGHT));
    const smoothing = this.save.settings.reducedMotion ? 1 : 0.12;
    this.camera.x += (targetX - this.camera.x) * smoothing;
    this.camera.y += (targetY - this.camera.y) * smoothing;
  }

  private handleCommand(command: GameCommand): void {
    void this.audio.unlock();
    if (this.overlay === 'dialogue' && command.type !== 'dialogue-continue') return;
    if (this.overlay === 'result' && command.type !== 'result-continue') return;
    if (this.overlay === 'guide' && command.type !== 'guide-intro-done' && command.type !== 'close-panel') return;
    switch (command.type) {
      case 'new-game':
        this.newGame();
        break;
      case 'continue-game':
        this.continueGame();
        break;
      case 'open-panel':
        this.openPanel(command.panel);
        break;
      case 'close-panel':
        this.closePanel();
        break;
      case 'pause':
        this.openPause();
        break;
      case 'interact':
        this.interact();
        break;
      case 'travel':
        this.travel(command.zone);
        break;
      case 'start-random-battle':
        this.startRandomBattle();
        break;
      case 'attack':
        this.attackHeld = command.pressed;
        break;
      case 'dodge':
        this.pendingDodge = true;
        break;
      case 'skill':
        this.pendingSkill = true;
        break;
      case 'potion':
        this.pendingPotion = true;
        break;
      case 'craft':
        this.craftItem(command.id);
        break;
      case 'equip':
        this.equipItem(command.id);
        break;
      case 'build':
        this.buildItem(command.id);
        break;
      case 'choose-route':
        this.save.player.route = command.route;
        this.persist();
        this.audio.play('ui');
        this.openPanel('bag');
        this.ui.toast(`已选择「${ROUTES[command.route].name}」路线`, 'good');
        break;
      case 'dialogue-continue':
        this.continueDialogue();
        break;
      case 'guide-intro-done':
        this.closeGuideIntro();
        break;
      case 'result-continue':
        this.continueResult();
        break;
      case 'setting-sfx':
        this.save.settings.sfx = command.value;
        this.audio.setSfxVolume(command.value);
        this.persist();
        break;
      case 'setting-music':
        this.save.settings.music = command.value;
        this.audio.setMusicVolume(command.value);
        this.persist();
        break;
      case 'setting-reduced-motion':
        this.save.settings.reducedMotion = command.value;
        this.persist();
        break;
      case 'setting-touch':
        this.save.settings.showTouch = command.value;
        this.ui.setTouchVisible(command.value);
        this.persist();
        break;
      case 'clear-save':
        this.clearSave();
        break;
      default:
        break;
    }
  }

  private newGame(): void {
    this.saveManager.clear();
    this.save = createInitialSave();
    this.beginWorld(true);
    this.persist();
    this.guide = null;
    this.openGuideIntro();
  }

  /**
   * First-run card. Explains the loop and the controls up front, then hands the
   * player to Luma so the story trigger is never a guessing game.
   */
  private openGuideIntro(): void {
    this.overlay = 'guide';
    this.attackHeld = false;
    this.input.setEnabled(false);
    this.ui.setTouchVisible(false);
    this.ui.setOverlay('guide', `
      <section class="guide-intro" role="dialog" aria-modal="true" aria-label="新手指引">
        <div class="panel__eyebrow">HOW TO PLAY · 新手指引</div>
        <h2>三分钟上手《灯火小岛》</h2>
        <p class="guide-intro__lead">你是新任云灯巡岛员。这座岛的灯熄了，暮影藏在草丛里。<br />跟着指引卡一步步做完 ${guideStepCount()} 步，长夜就会结束。</p>
        <div class="guide-loop">
          <div><b>1 · 探索</b><span>走到发光标记处按 <kbd>E</kbd> 互动。地图、传送门、工坊都在标记上。</span></div>
          <div><b>2 · 战斗</b><span>草丛会自动开战。<kbd>J</kbd>/<kbd>空格</kbd> 攻击，<kbd>K</kbd> 闪避，<kbd>L</kbd> 技能，<kbd>H</kbd> 喝药。</span></div>
          <div><b>3 · 成长</b><span>战利品换铜币与材料，在工坊锻造装备，在建造板点灯解锁新区域。</span></div>
        </div>
        <div class="guide-steps-preview">
          <span class="guide-steps-preview__label">前 3 步</span>
          <ol>
            <li><b>找露玛</b>港中央的守望者，按 E 接委托</li>
            <li><b>去云阶草坡</b>岛南端传送点，按 E 出发</li>
            <li><b>打 3 个灯绒团</b>走进草丛，用 J 攻击</li>
          </ol>
        </div>
        <div class="guide-intro__tips">
          <span>手机</span>左下摇杆移动，右下按钮攻击/闪避/技能，靠近标记点「话」互动。
          <span>电脑</span>WASD 移动，E 互动，B 背包，Esc 菜单。
        </div>
        <button class="paper-button paper-button--primary" data-command="guide-intro-done">我知道了，去点灯 <span>→</span></button>
      </section>`);
  }

  private closeGuideIntro(): void {
    this.save.world.guideSeen = true;
    this.guideIntroShown = true;
    this.persist();
    this.overlay = 'none';
    this.ui.clearOverlay();
    this.input.setEnabled(true);
    this.ui.setTouchVisible(this.save.settings.showTouch);
    this.showDialogue('露玛 · 灯塔守望者', '今晚的灯不会自己亮起来。拿上星枝短叉，去云阶草坡找回被风吹散的三盏引路灯吧。', () => {
      this.save.world.tutorialSeen = true;
      this.persist();
      this.guide = null;
      this.ui.toast('目标更新：与云阶草坡的草丛交手', 'good');
    });
  }

  /** Title-screen variant: same rules, no current-step block (there is no save yet). */
  private titleGuideHtml(): string {
    return `<section class="guide-intro" role="dialog" aria-modal="true" aria-label="新手指引">
      <div class="panel__eyebrow">HOW TO PLAY · 新手指引</div>
      <h2>三分钟上手《灯火小岛》</h2>
      <p class="guide-intro__lead">你是新任云灯巡岛员。这座岛的灯熄了，暮影藏在草丛里。<br />跟着指引卡一步步做完 ${guideStepCount()} 步，长夜就会结束。</p>
      <div class="guide-loop">
        <div><b>1 · 探索</b><span>走到发光标记处按 <kbd>E</kbd> 互动。地图、传送门、工坊都在标记上。</span></div>
        <div><b>2 · 战斗</b><span>草丛会自动开战。<kbd>J</kbd>/<kbd>空格</kbd> 攻击，<kbd>K</kbd> 闪避，<kbd>L</kbd> 技能，<kbd>H</kbd> 喝药。</span></div>
        <div><b>3 · 成长</b><span>战利品换铜币与材料，在工坊锻造装备，在建造板点灯解锁新区域。</span></div>
      </div>
      <div class="guide-steps-preview">
        <span class="guide-steps-preview__label">完整流程</span>
        <ol>
          <li><b>1. 找露玛</b>港中央的守望者，按 E 接委托</li>
          <li><b>2. 云阶草坡</b>岛南端传送点按 E 出发，走草丛打 3 个灯绒团</li>
          <li><b>3. 修工坊</b>回港东北角按 E，用战利品修复巡灯工坊</li>
          <li><b>4-9. 逐岛推进</b>纸灯林 → 雨芽花园 → 观星高台，途中修集雨棚与星图台解锁区域</li>
        </ol>
      </div>
      <div class="guide-triggers">
        <div><b>对话</b>走到 NPC 或传送点 → 出现光圈 → 按 <kbd>E</kbd></div>
        <div><b>战斗</b>踩进草丛或触碰守关者 → 自动开战</div>
        <div><b>建造</b>工坊/建造板 → 点「修复 / 升级」→ 消耗材料</div>
        <div><b>解锁</b>修复关键建筑 → 对应岛屿才会开门</div>
      </div>
      <div class="guide-intro__tips">
        <span>手机</span>左下摇杆移动，右下按钮攻击/闪避/技能，靠近标记点「话」互动。
        <span>电脑</span>WASD 移动，E 互动，B 背包，Esc 菜单。
      </div>
      <button class="paper-button paper-button--primary" data-command="close-panel">看懂了 <span>→</span></button>
    </section>`;
  }

  /** Full reference card, reachable any time from the HUD "导" button. */
  private guidePanelHtml(): string {
    const guide = this.guide ?? resolveGuide(this.save, this.world.currentZone.id, this.world.x, this.world.y);
    const steps: Array<{ index: number; id: string; label: string }> = [
      { index: 1, id: 'wake', label: '与露玛交谈，接下委托' },
      { index: 2, id: 'learn', label: '去云阶草坡，击败 3 个灯绒团' },
      { index: 3, id: 'forge', label: '回港修复巡灯工坊' },
      { index: 4, id: 'woods', label: '纸灯林驱散 5 个纸鸢影' },
      { index: 5, id: 'moth', label: '吞灯蛹巢挑战吞灯蛹' },
      { index: 6, id: 'rain', label: '雨芽花园驱散 3 个星砂哨兵' },
      { index: 7, id: 'bell', label: '雨幕钟塔挑战守铃者' },
      { index: 8, id: 'stars', label: '观星高台清出 4 个暮影爪牙' },
      { index: 9, id: 'final', label: '无星王座击败无星夜枭' },
    ];
    const rows = steps.map((item) => {
      const state = item.index < guide.stepNumber ? 'done' : item.index === guide.stepNumber ? 'active' : 'todo';
      const mark = state === 'done' ? '✦' : state === 'active' ? '◆' : '·';
      return `<li class="guide-step-row is-${state}"><i>${mark}</i><b>${item.index}. ${item.label}</b></li>`;
    }).join('');
    return `<section class="panel" role="dialog" aria-modal="true" aria-label="新手指引">
      <header class="panel__header">
        <div><div class="panel__eyebrow">HOW TO PLAY</div><h2>新手指引</h2></div>
        <button class="panel__close" data-command="close-panel" aria-label="关闭">×</button>
      </header>
      <div class="guide-current">
        <span class="guide-current__step">第 ${guide.stepNumber} / ${guide.stepTotal} 步 · ${guide.step.zoneName}</span>
        <b>${escapeHtml(guide.step.title)}</b>
        <p>${escapeHtml(guide.step.hint)}</p>
        <div class="guide-current__foot"><span>${escapeHtml(guide.step.progress)}</span><span>操作：${escapeHtml(guide.step.inputHint)}</span></div>
      </div>
      <div class="section-label">全部 ${guide.stepTotal} 步</div>
      <ol class="guide-step-list">${rows}</ol>
      <div class="section-label">怎么触发剧情</div>
      <div class="guide-triggers">
        <div><b>对话</b>走到 NPC 或传送点 → 出现光圈 → 按 <kbd>E</kbd></div>
        <div><b>战斗</b>踩进草丛或触碰守关者 → 自动开战</div>
        <div><b>建造</b>工坊/建造板 → 点「修复 / 升级」→ 消耗材料</div>
        <div><b>解锁</b>修复关键建筑 → 对应岛屿才会开门</div>
      </div>
      <div class="controls-card">
        <b>桌面操作</b>
        <p>WASD / 方向键移动 · J 或空格攻击 · K 闪避 · L 技能 · H 药剂 · E 互动 · B 背包 · Esc 菜单</p>
        <b>手机操作</b>
        <p>左下摇杆移动，右下按钮攻击、闪避、技能、药剂；靠近发光标记后点「话」互动。</p>
      </div>
      <footer class="panel__footer"><span>进度自动保存在本地浏览器</span><button class="paper-button" data-command="close-panel">回到岛上</button></footer>
    </section>`;
  }

  private continueGame(): void {
    const loaded = this.saveManager.load();
    if (!loaded) {
      this.ui.toast('没有找到旅途记录', 'warning');
      return;
    }
    this.save = loaded;
    this.beginWorld(false);
    this.guide = null;
    this.ui.setTutorialBattleSeen(this.save.world.tutorialBattleSeen);
    if (!this.save.world.guideSeen) {
      this.openGuideIntro();
      return;
    }
    this.ui.toast(this.saveManager.lastLoadRecovered ? '已从备份恢复灯火记录' : '欢迎回到岛上', 'good');
  }

  private beginWorld(fresh: boolean): void {
    this.battle = null;
    this.mode = 'world';
    this.overlay = 'none';
    this.ui.setMode('world');
    this.ui.clearOverlay();
    this.ui.setTouchVisible(this.save.settings.showTouch);
    this.ui.setTutorialBattleSeen(this.save.world.tutorialBattleSeen);
    this.input.setEnabled(true);
    this.world = new WorldRuntime(this.save);
    this.audio.setScene(this.world.currentZone.safe ? 'safe' : 'world');
    this.camera.x = clamp(this.world.x - BASE_WIDTH / 2, 0, Math.max(0, this.world.currentZone.width - BASE_WIDTH));
    this.camera.y = clamp(this.world.y - BASE_HEIGHT * 0.54, 0, Math.max(0, this.world.currentZone.height - BASE_HEIGHT));
    if (fresh) this.audio.play('level');
  }

  private showDialogue(speaker: string, text: string, action: () => void): void {
    this.dialogueAction = action;
    this.overlay = 'dialogue';
    this.input.setEnabled(false);
    this.ui.setOverlay('dialogue', `
      <section class="dialogue-panel" role="dialog" aria-modal="true" aria-label="${escapeHtml(speaker)}">
        <div class="dialogue-speaker"><span class="speaker-lantern">✦</span><span>${escapeHtml(speaker)}</span></div>
        <p>${escapeHtml(text)}</p>
        <button class="paper-button paper-button--primary" data-command="dialogue-continue">收下这句话 <span>→</span></button>
      </section>`);
  }

  private continueDialogue(): void {
    const action = this.dialogueAction;
    this.dialogueAction = null;
    this.overlay = 'none';
    this.ui.clearOverlay();
    this.input.setEnabled(true);
    action?.();
  }

  private openPause(): void {
    if (this.overlay !== 'none') return;
    this.overlay = 'pause';
    this.attackHeld = false;
    this.pendingDodge = false;
    this.pendingSkill = false;
    this.pendingPotion = false;
    this.input.setEnabled(false);
    this.ui.setTouchVisible(false);
    this.ui.setOverlay('pause', `
      <section class="pause-panel panel" role="dialog" aria-modal="true">
        <div class="panel__eyebrow">THE NIGHT IS STILL YOUNG</div>
        <h2>灯下暂歇</h2>
        <p>进度会在关键节点自动保存。</p>
        <div class="pause-actions">
          <button class="paper-button paper-button--primary" data-command="close-panel">继续巡灯</button>
          <button class="paper-button" data-command="open-panel" data-panel="guide">新手指引</button>
          <button class="paper-button" data-command="open-panel" data-panel="journal">旅途日志</button>
          <button class="paper-button" data-command="open-panel" data-panel="settings">声音与显示</button>
        </div>
      </section>`);
  }

  private closePanel(): void {
    if (this.overlay === 'dialogue' || this.overlay === 'result') return;
    if (this.mode === 'title') {
      this.overlay = 'none';
      this.ui.renderTitle(this.saveManager.hasSave(), false);
      return;
    }
    this.overlay = 'none';
    this.ui.clearOverlay();
    this.input.setEnabled(true);
    this.ui.setTouchVisible(this.save.settings.showTouch);
  }

  private openPanel(panel: UiPanel): void {
    if (this.mode === 'title' && panel !== 'guide') return;
    if (panel === 'guide' && this.mode === 'title') {
      this.overlay = 'guide';
      this.ui.setOverlay('guide', this.titleGuideHtml());
      return;
    }
    this.attackHeld = false;
    this.pendingDodge = false;
    this.pendingSkill = false;
    this.pendingPotion = false;
    this.overlay = panel;
    this.input.setEnabled(false);
    this.ui.setTouchVisible(false);
    this.ui.setOverlay(panel, this.panelHtml(panel));
  }

  private panelHtml(panel: UiPanel): string {
    const save = this.save;
    const stats = getPlayerStats(save);
    if (panel === 'guide' || panel === 'journal' || panel === 'pause') this.guide = resolveGuide(save, this.world.currentZone.id, this.world.x, this.world.y);
    if (panel === 'guide') return this.guidePanelHtml();
    if (panel === 'bag') {
      const ownedWeapons = WEAPONS.filter((weapon) => save.player.inventory.includes(weapon.id));
      const ownedCharms = CHARMS.filter((charm) => save.player.equippedCharm === charm.id || save.player.inventory.includes(charm.id));
      const materialCells = Object.values(MATERIALS).map((material) => `<div class="material-cell"><i style="--swatch:${material.color}"></i><span>${material.name}</span><b>${save.player.materials[material.id] ?? 0}</b></div>`).join('');
      const weaponCards = ownedWeapons.map((weapon) => this.gearCard(weapon, save.player.equippedWeapon === weapon.id)).join('');
      const charmCards = ownedCharms.map((charm) => this.gearCard(charm, save.player.equippedCharm === charm.id)).join('');
      const routeCards = Object.entries(ROUTES).map(([id, route]) => `<button class="route-card ${save.player.route === id ? 'is-selected' : ''}" data-command="choose-route" data-route="${id}"><b>${route.name}</b><span>${route.description}</span></button>`).join('');
      return `<section class="panel panel--wide" role="dialog" aria-modal="true">
        <header class="panel__header"><div><div class="panel__eyebrow">THE LANTERN SATCHEL</div><h2>巡灯背包</h2></div><button class="panel__close" data-command="close-panel" aria-label="关闭">×</button></header>
        <div class="stat-ribbon"><span><b>${stats.maxHp}</b> 生命</span><span><b>${stats.attack}</b> 攻击</span><span><b>${stats.defense}</b> 防御</span><span><b>${Math.round(stats.crit * 100)}%</b> 暴击</span><span><b>${Math.round(stats.moveSpeed)}</b> 移动</span></div>
        <div class="panel-columns"><div><div class="section-label">巡灯路线</div><div class="route-grid">${routeCards}</div></div><div><div class="section-label">星屑材料</div><div class="material-grid">${materialCells}</div></div></div>
        <div class="section-label">武器与护符</div><div class="gear-grid">${weaponCards}${charmCards || '<p class="muted">还没有护符，去工坊锻造一枚吧。</p>'}</div>
        <footer class="panel__footer"><span>提示：护符会改变战斗方式，点击即可装备。</span><button class="paper-button" data-command="close-panel">收好</button></footer>
      </section>`;
    }
    if (panel === 'forge') {
      const forgeLevel = save.world.buildings.forge ?? 0;
      const items = [...WEAPONS, ...CHARMS].filter((item) => item.id !== 'sprigFork');
      const cards = items.map((item) => {
        const owned = save.player.inventory.includes(item.id);
        const craftable = canCraft(save, item.id);
        const isWeapon = 'type' in item;
        const levelText = isWeapon ? `Lv.${item.requiredLevel} · 锻台 ${Math.ceil(((item.requiredLevel - 1) / 5))}级` : '护符';
        const skillText = isWeapon ? `${item.skillName} · ${item.skillDescription}` : '被动护符 · 装备后改变战斗倾向';
        const glyph = isWeapon ? (item.type === 'branch' ? '⌁' : item.type === 'blade' ? '◒' : '◌') : '✦';
        return `<article class="recipe-card ${owned ? 'is-owned' : craftable ? 'is-ready' : ''}"><div class="recipe-card__top"><div class="recipe-glyph" style="--item-color:${item.color}">${glyph}</div><div><b>${item.name}</b><span>${levelText}</span></div>${owned ? '<em>已拥有</em>' : ''}</div><p>${item.description}</p><small>${skillText}</small><div class="recipe-card__bottom"><span>${describeMaterialAmount(item.recipe)}</span><button class="mini-button" data-command="craft" data-id="${item.id}" ${!craftable || owned ? 'disabled' : ''}>${owned ? '已锻造' : craftable ? '锻造' : '材料不足'}</button></div></article>`;
      }).join('');
      return `<section class="panel panel--wide" role="dialog" aria-modal="true">
        <header class="panel__header"><div><div class="panel__eyebrow">THE WARM FORGE</div><h2>巡灯工坊 <small>锻台 Lv.${forgeLevel}</small></h2></div><button class="panel__close" data-command="close-panel" aria-label="关闭">×</button></header>
        ${forgeLevel < 1 ? '<div class="locked-banner">工坊还没有生火。回到灯火港的建造板，先修复巡灯工坊。</div>' : '<p class="panel-lede">每一件工具都会改变你的战斗节奏。锻造需要铜币、星屑材料与合适的锻台等级。</p>'}
        <div class="recipe-grid">${cards}</div>
        <footer class="panel__footer"><span>锻台升级会解锁更高等级的装备。</span><button class="paper-button" data-command="close-panel">离开工坊</button></footer>
      </section>`;
    }
    if (panel === 'build') {
      const cards = BUILDINGS.map((building) => {
        const current = save.world.buildings[building.id] ?? 0;
        const next = building.levels[current];
        const ready = Boolean(next && canBuild(save, building.id));
        return `<article class="build-card ${current > 0 ? 'is-built' : ''}"><div class="build-card__icon">${building.id === 'forge' ? '⚒' : building.id === 'beacon' ? '✦' : building.id === 'starChart' ? '◈' : building.id === 'rainCanopy' ? '☂' : '⌂'}</div><div class="build-card__body"><b>${building.name} <em>${current}/${building.levels.length}</em></b><p>${building.description}</p>${next ? `<div class="build-next"><span>下一级：${next.benefit}</span><small>${describeMaterialAmount(next.cost)}</small></div><button class="mini-button" data-command="build" data-id="${building.id}" ${ready ? '' : 'disabled'}>${ready ? '修复 / 升级' : '材料不足'}</button>` : '<span class="built-mark">✦ 已达到最终形态</span>'}</div></article>`;
      }).join('');
      return `<section class="panel panel--wide" role="dialog" aria-modal="true">
        <header class="panel__header"><div><div class="panel__eyebrow">A SMALL HOME FOR LONG NIGHTS</div><h2>岛屋建造板</h2></div><button class="panel__close" data-command="close-panel" aria-label="关闭">×</button></header>
        <p class="panel-lede">把材料交给灯火港，岛上的灯会一点点重新亮起来。</p><div class="build-grid">${cards}</div>
        <footer class="panel__footer"><span>建筑会带来长期成长，而不只是装饰。</span><button class="paper-button" data-command="close-panel">回到岛上</button></footer>
      </section>`;
    }
    if (panel === 'map') {
      const zoneCards = Object.values(ZONES).map((zone) => {
        const unlocked = isZoneUnlocked(save, zone.id);
        const discovered = save.world.discoveredZones.includes(zone.id);
        return `<article class="map-card ${unlocked ? 'is-unlocked' : 'is-locked'} ${zone.id === save.world.currentZone ? 'is-current' : ''}"><div class="map-card__swatch" style="--map-color:${zone.ground};--map-night:${zone.background}"><span>${zone.level === 0 ? '港' : zone.level >= 13 ? '星' : zone.name.slice(0, 1)}</span></div><div><b>${discovered || unlocked ? zone.name : '未发现的岛'}</b><p>${unlocked ? zone.subtitle : `通过前置任务与建筑解锁 · ${zone.requiredStage} 章`}</p><small>${zone.level > 0 ? `推荐 Lv.${zone.level}` : '安全区域'}</small></div>${unlocked ? `<button class="mini-button" data-command="travel" data-zone="${zone.id}">${zone.id === save.world.currentZone ? '当前' : '前往'}</button>` : '<span class="lock-mark">封</span>'}</article>`;
      }).join('');
      return `<section class="panel" role="dialog" aria-modal="true"><header class="panel__header"><div><div class="panel__eyebrow">THE FLOATING ATLAS</div><h2>浮岛地图</h2></div><button class="panel__close" data-command="close-panel" aria-label="关闭">×</button></header><p class="panel-lede">每一条被重新点亮的路，都会把夜色推远一点。</p><div class="map-list">${zoneCards}</div></section>`;
    }
    if (panel === 'journal') {
      const quest = getQuestText(save);
      const guide = this.guide ?? resolveGuide(save, this.world.currentZone.id, this.world.x, this.world.y);
      return `<section class="panel" role="dialog" aria-modal="true"><header class="panel__header"><div><div class="panel__eyebrow">A THREAD OF LITTLE LIGHTS</div><h2>旅途日志</h2></div><button class="panel__close" data-command="close-panel" aria-label="关闭">×</button></header><div class="journal-quest"><span>当前线索</span><h3>${quest.title}</h3><p>${quest.hint}</p><b>${quest.progress}</b></div><div class="guide-current"><span class="guide-current__step">下一步 · 第 ${guide.stepNumber} / ${guide.stepTotal} 步 · ${guide.step.zoneName}</span><b>${escapeHtml(guide.step.title)}</b><p>${escapeHtml(guide.step.hint)}</p><div class="guide-current__foot"><span>${escapeHtml(guide.step.progress)}</span><span>操作：${escapeHtml(guide.step.inputHint)}</span></div></div><div class="section-label">怎么触发剧情</div><div class="guide-triggers"><div><b>对话</b>走到 NPC 或传送点 → 出现光圈 → 按 <kbd>E</kbd></div><div><b>战斗</b>踩进草丛或触碰守关者 → 自动开战</div><div><b>建造</b>工坊/建造板 → 点「修复 / 升级」→ 消耗材料</div><div><b>解锁</b>修复关键建筑 → 对应岛屿才会开门</div></div><div class="journal-stats"><div><b>${formatNumber(save.stats.battlesWon)}</b><span>胜利战斗</span></div><div><b>${formatNumber(save.stats.enemiesDefeated)}</b><span>驱散暮影</span></div><div><b>${formatNumber(save.stats.bestCombo)}</b><span>最高连击</span></div><div><b>${formatNumber(Math.floor(save.stats.playSeconds / 60))}</b><span>巡灯分钟</span></div></div><div class="controls-card"><b>桌面操作</b><p>WASD / 方向键移动 · J 或空格攻击 · K 闪避 · L 技能 · H 药剂 · E 互动 · B 背包 · Esc 菜单</p><b>手机操作</b><p>左下摇杆移动，右下按钮攻击、闪避、技能、药剂；靠近发光标记后点「话」互动。</p></div><footer class="panel__footer"><span>灯火小岛 · 原创试玩版</span><button class="paper-button" data-command="open-panel" data-panel="guide">完整新手指引</button><button class="paper-button" data-command="close-panel">合上日志</button></footer></section>`;
    }
    const settings = save.settings;
    return `<section class="panel" role="dialog" aria-modal="true"><header class="panel__header"><div><div class="panel__eyebrow">QUIET SETTINGS</div><h2>声音与显示</h2></div><button class="panel__close" data-command="close-panel" aria-label="关闭">×</button></header><label class="setting-row"><span><b>音效</b><small>攻击、灯光与界面反馈</small></span><input type="range" min="0" max="100" value="${Math.round(settings.sfx * 100)}" data-setting="sfx" /></label><label class="setting-row"><span><b>环境声</b><small>低频风声与灯塔和弦</small></span><input type="range" min="0" max="100" value="${Math.round(settings.music * 100)}" data-setting="music" /></label><label class="setting-row"><span><b>减少动态</b><small>关闭镜头摇晃与背景漂移</small></span><input type="checkbox" ${settings.reducedMotion ? 'checked' : ''} data-setting="reduced-motion" /></label><label class="setting-row"><span><b>显示触控区</b><small>在触屏设备上保留摇杆与按钮</small></span><input type="checkbox" ${settings.showTouch ? 'checked' : ''} data-setting="touch" /></label><div class="settings-note">所有设置会随旅途记录保存。游戏不需要联网，也没有账号。</div><footer class="panel__footer"><button class="danger-button" data-command="clear-save">清除旅途记录</button><button class="paper-button" data-command="close-panel">完成</button></footer></section>`;
  }

  private gearCard(item: WeaponDefinition | CharmDefinition, equipped: boolean): string {
    const id = item.id;
    const isCharm = 'bonus' in item;
    const stats = isCharm ? Object.entries(item.bonus).map(([key, value]) => `${key} +${value}`).join(' · ') : `攻击 ${item.damage} · ${item.type === 'branch' ? '范围' : item.type === 'blade' ? '速度' : '远程'}`;
    return `<article class="gear-card ${equipped ? 'is-equipped' : ''}"><div class="gear-glyph" style="--item-color:${item.color}">${isCharm ? '✦' : item.type === 'branch' ? '⌁' : item.type === 'blade' ? '◒' : '◌'}</div><div class="gear-card__body"><b>${item.name}</b><p>${item.description}</p><small>${stats}</small></div><button class="mini-button" data-command="equip" data-id="${id}" ${equipped ? 'disabled' : ''}>${equipped ? '已装备' : '装备'}</button></article>`;
  }

  private interact(): void {
    if (this.mode !== 'world' || this.overlay !== 'none') return;
    const nearby = this.world.getNearbyInteractable();
    if (!nearby) {
      this.ui.toast('靠近发光标记再互动', 'warning');
      return;
    }
    if (!canInteractWith(this.save, nearby.id)) {
      this.ui.toast('这条路还没有准备好', 'warning');
      return;
    }
    if (nearby.kind === 'npc') {
      if (nearby.id === 'keeper-luma') {
        if (this.save.world.questStage !== 0) {
          this.ui.toast('露玛：灯塔会记得每一个回来的人。', 'normal');
          return;
        }
        advanceQuest(this.save);
        this.persist();
        this.showDialogue('露玛 · 灯塔守望者', '很好。星枝短叉已经认得你的手了。去云阶草坡，把三盏引路灯找回港——暮影最喜欢在草丛里等人。', () => this.ui.toast('目标更新：风中试锋', 'good'));
      }
      return;
    }
    if (nearby.kind === 'forge' || nearby.kind === 'build') {
      this.openPanel('build');
      return;
    }
    if (nearby.kind === 'portal' || nearby.kind === 'exit' || nearby.kind === 'gate') {
      if (nearby.target) this.travel(nearby.target);
      return;
    }
    if (nearby.kind === 'boss') {
      if (this.save.world.defeatedBosses.includes(nearby.id)) {
        this.ui.toast('这盏灯已经回来了。', 'good');
      } else {
        const bossId = nearby.id === 'lantern-boss' ? 'lanternMoth' : nearby.id === 'bell-boss' ? 'bellWarden' : 'starlessOwl';
        this.startBattle([bossId]);
      }
    }
  }

  private travel(zoneId: ZoneId): void {
    if (this.mode !== 'world' || this.overlay !== 'none') return;
    if (zoneId === 'cloudstep' && this.save.world.questStage < 1) {
      this.ui.toast('先听听露玛要说什么', 'warning');
      return;
    }
    if (!isZoneUnlocked(this.save, zoneId)) {
      this.ui.toast('这枚封岛灯还没有亮起', 'warning');
      return;
    }
    this.world.enterZone(zoneId);
    if (!this.save.world.discoveredZones.includes(zoneId)) this.save.world.discoveredZones.push(zoneId);
    this.persist();
    this.audio.setScene(ZONES[zoneId].safe ? 'safe' : 'world');
    this.ui.toast(`抵达 · ${ZONES[zoneId].name}`, 'good');
  }

  private startRandomBattle(): void {
    if (this.battle || this.mode !== 'world') return;
    const zone = this.world.currentZone;
    if (zone.safe || zone.encounters.length === 0) return;
    const stats = getPlayerStats(this.save);
    const tutorial = this.save.world.questStage === 1 && stats.level <= 2;
    const count = tutorial ? 1 : Math.min(3, 1 + Math.floor((stats.level + this.random.integer(0, 2)) / 4));
    const enemies = Array.from({ length: count }, () => tutorial ? 'cloudPuff' : this.random.pick(zone.encounters));
    this.startBattle(enemies);
  }

  private startBattle(enemyIds: string[]): void {
    if (this.battle || enemyIds.length === 0) return;
    const stats = getPlayerStats(this.save);
    const weapon = this.getWeapon();
    this.battle = new BattleRuntime({
      onHud: (hud) => this.ui.setBattleHud(hud),
      onFinish: (result) => this.finishBattle(result),
      onPotion: () => {
        if (this.save.player.potions <= 0) {
          this.ui.toast('没有药剂了，回港补充吧', 'warning');
          return false;
        }
        this.save.player.potions -= 1;
        this.persist();
        return true;
      },
      onEnemyDefeated: (id) => this.registerEnemyDefeat(id),
      onSound: (name) => this.audio.play(name),
      onCombo: (combo) => {
        this.save.stats.bestCombo = Math.max(this.save.stats.bestCombo, combo);
      },
    }, hashString(`${Date.now()}:${enemyIds.join(',')}`));
    this.battle.start(enemyIds, stats, weapon, this.save);
    this.mode = 'battle';
    this.overlay = 'none';
    this.attackHeld = false;
    this.pendingDodge = false;
    this.pendingSkill = false;
    this.pendingPotion = false;
    this.ui.setMode('battle');
    this.ui.clearOverlay();
    this.ui.setTouchVisible(this.save.settings.showTouch);
    this.input.setEnabled(true);
    this.audio.setScene(enemyIds.length === 1 && ENEMIES[enemyIds[0]!]?.ai === 'boss' ? 'boss' : 'battle');
    this.ui.setBattleHud(this.battle.getHudState());
    this.ui.setTutorialBattleSeen(this.save.world.tutorialBattleSeen);
    if (enemyIds.length === 1 && ENEMIES[enemyIds[0]!]?.ai === 'boss') this.ui.toast(`守关者 · ${ENEMIES[enemyIds[0]!]!.name}`, 'warning');
  }

  private registerEnemyDefeat(id: string): void {
    this.save.world.defeatCounts[id] = (this.save.world.defeatCounts[id] ?? 0) + 1;
    this.save.stats.enemiesDefeated += 1;
  }

  private finishBattle(result: BattleResult): void {
    if (!this.battle) return;
    const summary: RewardSummary = {
      xp: 0,
      gold: 0,
      starlight: 0,
      materials: {},
      potion: 0,
      levelsGained: 0,
      questNote: '',
      bossName: '',
    };
    if (result.victory) {
      for (const id of result.enemyIds) {
        const enemy = ENEMIES[id];
        if (!enemy) continue;
        summary.xp += enemy.xp;
        summary.gold += enemy.gold;
        for (const [material, amount] of Object.entries(enemy.materials) as Array<[MaterialId, number | undefined]>) {
          if (amount) summary.materials[material] = (summary.materials[material] ?? 0) + amount;
        }
      }
      summary.starlight = Math.max(1, Math.round(summary.xp * 0.12));
      if (this.save.world.buildings.rainCanopy && this.random.chance(0.35)) summary.potion = 1;
      this.save.player.gold += summary.gold;
      this.save.player.starlight += summary.starlight;
      this.save.player.potions += summary.potion;
      for (const [material, amount] of Object.entries(summary.materials) as Array<[MaterialId, number | undefined]>) {
        if (amount) this.save.player.materials[material] += amount;
      }
      const levelResult = awardXp(this.save, summary.xp);
      summary.levelsGained = levelResult.levelsGained;
      const questResult = advanceQuestAfterBattle(this.save, result.enemyIds);
      summary.questNote = questResult.note;
      if (questResult.bossName) summary.bossName = questResult.bossName;
      this.save.stats.battlesWon += 1;
      const stats = getPlayerStats(this.save);
      this.save.player.hp = clamp(this.battle.hero.hp + stats.maxHp * 0.18, 1, stats.maxHp);
      if (summary.levelsGained > 0) this.audio.play('level');
    } else {
      summary.bossName = '暮影暂时退去';
      this.save.player.gold = Math.floor(this.save.player.gold * 0.9);
      this.save.stats.deaths += 1;
      this.save.player.hp = Math.max(1, getPlayerStats(this.save).maxHp * 0.3);
      this.world.enterZone('harbor');
    }
    this.persist();
    this.attackHeld = false;
    this.input.setEnabled(false);
    this.ui.setTouchVisible(false);
    this.overlay = 'result';
    if (!this.save.world.tutorialBattleSeen) {
      this.save.world.tutorialBattleSeen = true;
      this.persist();
      this.ui.setTutorialBattleSeen(true);
    }
    this.pendingResultMode = result.victory ? 'victory' : 'defeat';
    this.pendingResultDialogue = this.resultDialogue(result.victory, summary.questNote);
    this.ui.setOverlay('result', this.resultHtml(result, summary));
  }

  private continueResult(): void {
    const next = this.pendingResultDialogue;
    this.pendingResultDialogue = null;
    this.pendingResultMode = null;
    this.overlay = 'none';
    this.battle = null;
    this.mode = 'world';
    this.ui.setMode('world');
    this.ui.clearOverlay();
    this.input.setEnabled(true);
    this.ui.setTouchVisible(this.save.settings.showTouch);
    this.audio.setScene(this.world.currentZone.safe ? 'safe' : 'world');
    if (next) this.showDialogue(next.speaker, next.text, () => undefined);
  }

  private resultDialogue(victory: boolean, questNote: string): { speaker: string; text: string } | null {
    if (!victory) return { speaker: '露玛 · 灯塔守望者', text: '不要急，灯火还在等你。回到港里，喝口水，再出发。' };
    if (questNote.includes('工坊')) return { speaker: '露玛 · 灯塔守望者', text: '你带回了材料。回港里，让工坊重新冒烟吧。' };
    if (questNote.includes('雨棚')) return { speaker: '露玛 · 灯塔守望者', text: '雨会落下，但灯也可以向上。修好集雨棚，我们就能听见钟塔的回声。' };
    if (questNote.includes('星图')) return { speaker: '露玛 · 灯塔守望者', text: '星路已经浮出来了。修好星图台，然后去观星高台看看最后一颗星。' };
    if (questNote.includes('终夜')) return { speaker: '露玛 · 灯塔守望者', text: '你把长夜的第一声钟唱回来了。剩下的路，去高台吧。' };
    return null;
  }

  private resultHtml(result: BattleResult, summary: RewardSummary): string {
    const victory = result.victory;
    const materialLines = Object.entries(summary.materials).map(([id, amount]) => `<span>${MATERIALS[id]?.name ?? id} +${amount}</span>`).join('');
    return `<section class="result-panel panel" role="dialog" aria-modal="true"><div class="result-stamp">${victory ? '灯火回应了你' : '先歇一会儿'}</div><h2>${victory ? '暮影散去' : '被夜色带走'}</h2><p>${victory ? '你把一小片夜空擦亮了。' : '巡岛员不会因为一次失误失去归途。'}</p>${victory ? `<div class="reward-grid"><div><b>+${summary.xp}</b><span>经验</span></div><div><b>+${summary.gold}</b><span>铜币</span></div><div><b>+${summary.starlight}</b><span>星屑</span></div>${summary.potion ? `<div><b>+${summary.potion}</b><span>药剂</span></div>` : ''}</div>${summary.levelsGained > 0 ? `<div class="level-up-note">✦ 等级提升 +${summary.levelsGained}</div>` : ''}${materialLines ? `<div class="reward-materials">${materialLines}</div>` : ''}` : '<div class="defeat-note">损失了少量铜币，但灯火会记得你回来的路。</div>'}${summary.questNote ? `<div class="quest-note">✦ ${escapeHtml(summary.questNote)}</div>` : ''}<div class="result-stats"><span>战斗用时 ${result.elapsed.toFixed(1)}s</span><span>最高 ${result.maxCombo} 连击</span></div><button class="paper-button paper-button--primary" data-command="result-continue">${victory ? '继续巡灯' : '回到灯火港'} <span>→</span></button></section>`;
  }

  private craftItem(id: string): void {
    if (this.overlay !== 'forge') return;
    if (craft(this.save, id)) {
      this.audio.play('craft');
      this.ui.toast('锻造完成，去背包装备吧', 'good');
      this.persist();
      this.openPanel('forge');
    } else this.ui.toast('材料或锻台等级还不够', 'warning');
  }

  private equipItem(id: string): void {
    if (this.overlay !== 'bag') return;
    if (equipItem(this.save, id)) {
      this.audio.play('ui');
      this.ui.toast('已装备', 'good');
      this.persist();
      this.openPanel('bag');
    }
  }

  private buildItem(id: BuildingId): void {
    if (this.overlay !== 'build') return;
    if (build(this.save, id)) {
      this.audio.play('craft');
      const note = advanceQuestAfterBuild(this.save, id);
      this.persist();
      this.ui.toast(note || '岛上又亮起了一盏灯', 'good');
      this.openPanel('build');
    } else this.ui.toast('还差一点材料', 'warning');
  }

  private updateWorldHud(): void {
    const stats = getPlayerStats(this.save);
    const quest = getQuestText(this.save);
    const nearby = this.world.getNearbyInteractable();
    this.ui.setWorldHud({
      zoneName: this.world.currentZone.name,
      zoneSubtitle: this.world.currentZone.subtitle,
      questTitle: quest.title,
      questProgress: quest.progress,
      level: this.save.player.level,
      hp: this.save.player.hp,
      maxHp: stats.maxHp,
      xp: this.save.player.xp,
      xpNext: xpForNextLevel(this.save.player.level),
      gold: this.save.player.gold,
      starlight: this.save.player.starlight,
      potionCount: this.save.player.potions,
      nearbyLabel: nearby ? nearby.label : null,
    });

    // Resolve fresh here: the HUD runs outside render(), and stale coordinates
    // would make the distance readout and in-range highlight lie.
    const guide = this.guide = resolveGuide(this.save, this.world.currentZone.id, this.world.x, this.world.y);
    this.ui.setGuideHud({
      stepNumber: guide.stepNumber,
      stepTotal: guide.stepTotal,
      title: guide.step.title,
      hint: guide.step.hint,
      progress: guide.step.progress,
      inputHint: guide.step.inputHint,
      distance: guide.distance,
      needsTravel: guide.needsTravel,
      markerLabel: guide.marker ? guide.marker.label : null,
      inRange: isAtGuideMarker(guide, this.world.x, this.world.y),
      detour: guide.step.detour,
      visible: !this.save.world.guideSeen || this.save.world.questStage < 3,
    });
  }

  private getWeapon(): WeaponDefinition {
    return WEAPONS.find((weapon) => weapon.id === this.save.player.equippedWeapon) ?? WEAPONS[0]!;
  }

  private persist(): void {
    this.saveManager.save(this.save);
  }

  private clearSave(): void {
    if (!window.confirm('确定清除这段旅途记录吗？此操作无法恢复。')) return;
    this.saveManager.clear();
    this.mode = 'title';
    this.overlay = 'none';
    this.battle = null;
    this.save = createInitialSave();
    this.input.setEnabled(false);
    this.ui.setMode('title');
    this.ui.setTouchVisible(this.save.settings.showTouch);
    this.ui.renderTitle(false, false);
    this.ui.toast('记录已清除', 'normal');
  }
}

function advanceQuestAfterBattle(save: SaveData, enemyIds: string[]): { note: string; bossName: string; levelsGained: number } {
  const bossIds = enemyIds.filter((id) => ENEMIES[id]?.ai === 'boss');
  if (bossIds.length > 0) {
    const bossId = bossIds[0]!;
    if (!save.world.defeatedBosses.includes(bossId)) save.world.defeatedBosses.push(bossId);
    if (bossId === 'lanternMoth' && save.world.questStage === 4) {
      advanceQuest(save);
      return { note: '纸灯林已恢复，去雨芽花园吧。', bossName: ENEMIES[bossId]!.name, levelsGained: 0 };
    }
    if (bossId === 'bellWarden' && save.world.questStage === 6) {
      advanceQuest(save);
      return { note: '雨幕钟塔安静了，修好星图台后前往观星高台。', bossName: ENEMIES[bossId]!.name, levelsGained: 0 };
    }
    if (bossId === 'starlessOwl' && save.world.questStage === 8) {
      advanceQuest(save);
      save.world.endingSeen = true;
      return { note: '终夜回响。灯火小岛重新亮起来了。', bossName: ENEMIES[bossId]!.name, levelsGained: 0 };
    }
    return { note: '', bossName: ENEMIES[bossId]!.name, levelsGained: 0 };
  }
  const counts = save.world.defeatCounts;
  if (save.world.questStage === 1 && (counts.cloudPuff ?? 0) >= 3) {
    advanceQuest(save);
    return { note: '三盏引路灯都回来了。回港修复工坊。', bossName: '', levelsGained: 0 };
  }
  if (save.world.questStage === 3 && (counts.paperKite ?? 0) >= 5) {
    advanceQuest(save);
    return { note: '纸鸢影不再遮住林灯。前往吞灯蛹巢。', bossName: '', levelsGained: 0 };
  }
  if (save.world.questStage === 5 && (counts.starSentinel ?? 0) >= 3) {
    advanceQuest(save);
    return { note: '雨芽花园有了星砂。修复集雨棚后挑战雨幕守铃者。', bossName: '', levelsGained: 0 };
  }
  if (save.world.questStage === 7 && (counts.inkBat ?? 0) + (counts.starSentinel ?? 0) >= 4) {
    advanceQuest(save);
    return { note: '暮影爪牙被驱散。修复星图台后挑战无星夜枭。', bossName: '', levelsGained: 0 };
  }
  return { note: '', bossName: '', levelsGained: 0 };
}

function advanceQuestAfterBuild(save: SaveData, id: BuildingId): string {
  if (id === 'forge' && save.world.questStage === 2) {
    advanceQuest(save);
    return '工坊重新冒烟，纸灯林的道路打开了。';
  }
  if (id === 'rainCanopy' && save.world.questStage === 6) {
    return '集雨棚完成，雨幕钟塔的路线已开放。';
  }
  if (id === 'starChart' && save.world.questStage === 7) {
    advanceQuest(save);
    return '星图台完成。观星高台的无星王座在等你。';
  }
  return '';
}

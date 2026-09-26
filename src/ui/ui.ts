import type { BattleHudState } from '../battle/battleRuntime';
import type { GameCommand, UiPanel } from '../core/commands';
import type { BuildingId, OverlayName, SceneMode, ZoneId } from '../types';

export interface WorldHudState {
  zoneName: string;
  zoneSubtitle: string;
  questTitle: string;
  questProgress: string;
  level: number;
  hp: number;
  maxHp: number;
  xp: number;
  xpNext: number;
  gold: number;
  starlight: number;
  potionCount: number;
  nearbyLabel: string | null;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

export class UIController {
  private readonly root: HTMLElement;
  private readonly frame: HTMLElement;
  private readonly onCommand: (command: GameCommand) => void;
  private readonly overlayRoot: HTMLElement;
  private readonly toastRoot: HTMLElement;
  private readonly fatalRoot: HTMLElement;
  private toastTimer = 0;
  private overlay: OverlayName = 'none';
  private mode: SceneMode = 'title';

  constructor(root: HTMLElement, onCommand: (command: GameCommand) => void) {
    this.root = root;
    this.onCommand = onCommand;
    this.root.innerHTML = this.template();
    this.frame = this.root.querySelector<HTMLElement>('.game-frame')!;
    this.overlayRoot = this.root.querySelector<HTMLElement>('#overlay-root')!;
    this.toastRoot = this.root.querySelector<HTMLElement>('#toast-root')!;
    this.fatalRoot = this.root.querySelector<HTMLElement>('#fatal-root')!;
    this.bindEvents();
  }

  renderTitle(hasSave: boolean, recovered: boolean): void {
    this.mode = 'title';
    this.overlay = 'title';
    this.root.dataset.mode = this.mode;
    this.frame.dataset.mode = this.mode;
    this.overlayRoot.dataset.overlay = 'title';
    this.overlayRoot.setAttribute('aria-hidden', 'false');
    this.overlayRoot.innerHTML = `
      <section class="title-screen" aria-labelledby="game-title">
        <div class="title-stamp title-stamp--top">浮岛巡灯录 · 第一卷</div>
        <div class="title-copy">
          <p class="eyebrow">A TINY ORIGINAL ADVENTURE</p>
          <h1 id="game-title"><span>灯火</span><em>小岛</em></h1>
          <p class="title-subtitle">把最后一盏灯，送到回家的路上。</p>
          <div class="title-rule"><span></span><b>✦</b><span></span></div>
          <p class="title-intro">你是新任云灯巡岛员。跟随露玛穿过浮岛，驱散吞灯的暮影，<br />让星光重新落回纸灯与港湾。</p>
        </div>
        <div class="title-actions">
          <button class="paper-button paper-button--primary" data-command="new-game">
            <span class="button-glyph">✦</span><span>开始巡灯</span><small>NEW JOURNEY</small>
          </button>
          ${hasSave ? '<button class="paper-button" data-command="continue-game"><span class="button-glyph">↟</span><span>继续旅途</span><small>CONTINUE</small></button>' : ''}
        </div>
        <div class="title-footer"><span>原创 Q 版探索 RPG</span><i></i><span>键盘 + 触控</span><i></i><span>约 15–30 分钟</span></div>
        ${recovered ? '<p class="save-recovered">已从备份恢复上次的灯火记录</p>' : ''}
      </section>`;
  }

  setMode(mode: SceneMode): void {
    this.mode = mode;
    this.root.dataset.mode = mode;
    this.frame.dataset.mode = mode;
  }

  setWorldHud(state: WorldHudState): void {
    this.setText('#world-zone-name', state.zoneName);
    this.setText('#world-zone-subtitle', state.zoneSubtitle);
    this.setText('#quest-title', state.questTitle);
    this.setText('#quest-progress', state.questProgress);
    this.setText('#world-level', `Lv.${state.level}`);
    this.setText('#world-hp-text', `${Math.ceil(state.hp)} / ${Math.ceil(state.maxHp)}`);
    this.setText('#world-xp-text', `${state.xp} / ${state.xpNext}`);
    this.setText('#world-gold', `◈ ${state.gold}`);
    this.setText('#world-starlight', `✦ ${state.starlight}`);
    this.setText('#world-potions', `药剂 ×${state.potionCount}`);
    const hpFill = this.root.querySelector<HTMLElement>('#world-hp-fill');
    const xpFill = this.root.querySelector<HTMLElement>('#world-xp-fill');
    if (hpFill) hpFill.style.width = `${Math.min(100, Math.max(0, state.hp / state.maxHp * 100))}%`;
    if (xpFill) xpFill.style.width = `${Math.min(100, Math.max(0, state.xp / state.xpNext * 100))}%`;
    this.setText('#world-prompt', state.nearbyLabel ? `${state.nearbyLabel}  ·  E 互动` : '');
    this.frame.classList.toggle('has-nearby', Boolean(state.nearbyLabel));
  }

  setBattleHud(state: BattleHudState): void {
    this.setText('#battle-hero-level', `Lv.${state.heroLevel}`);
    this.setText('#battle-hero-hp', `${state.heroHp} / ${state.heroMaxHp}`);
    this.setText('#battle-flame', `${state.flame}`);
    this.setText('#battle-flame-label', ['微光', '亮焰', '炽灯', '满灯'][state.flameStage] ?? '微光');
    this.setText('#battle-enemy-name', state.enemyName);
    this.setText('#battle-enemy-hp', state.enemyHp > 0 ? `${state.enemyHp} / ${state.enemyMaxHp}` : '暮影已散去');
    this.setText('#battle-enemies-left', state.enemiesLeft > 1 ? `还有 ${state.enemiesLeft} 个暮影` : state.enemiesLeft === 1 ? '最后一个暮影' : '战斗结束');
    this.setText('#battle-skill-status', state.skillCooldown > 0.05 ? `${state.skillCooldown.toFixed(1)}s` : 'READY');
    this.setText('#battle-dodge-status', state.dodgeCooldown > 0.05 ? `${state.dodgeCooldown.toFixed(1)}s` : 'READY');
    this.setText('#battle-combo', state.combo > 1 ? `${state.combo} 连` : '');
    const hpFill = this.root.querySelector<HTMLElement>('#battle-hero-hp-fill');
    const enemyFill = this.root.querySelector<HTMLElement>('#battle-enemy-hp-fill');
    const flameFill = this.root.querySelector<HTMLElement>('#battle-flame-fill');
    if (hpFill) hpFill.style.width = `${Math.min(100, Math.max(0, state.heroHp / state.heroMaxHp * 100))}%`;
    if (enemyFill) enemyFill.style.width = `${Math.min(100, Math.max(0, state.enemyHp / state.enemyMaxHp * 100))}%`;
    if (flameFill) flameFill.style.width = `${Math.min(100, Math.max(0, state.flame))}%`;
    this.root.dataset.flameStage = String(state.flameStage);
  }

  setOverlay(name: OverlayName, html = ''): void {
    this.overlay = name;
    this.overlayRoot.dataset.overlay = name;
    this.overlayRoot.innerHTML = html;
    this.overlayRoot.setAttribute('aria-hidden', 'false');
    const focusTarget = this.overlayRoot.querySelector<HTMLElement>('button, input, [tabindex]');
    focusTarget?.focus({ preventScroll: true });
  }

  clearOverlay(): void {
    this.overlay = 'none';
    this.overlayRoot.dataset.overlay = 'none';
    this.overlayRoot.innerHTML = '';
    this.overlayRoot.setAttribute('aria-hidden', 'true');
  }

  get currentOverlay(): OverlayName {
    return this.overlay;
  }

  setTouchVisible(visible: boolean): void {
    this.frame.classList.toggle('touch-hidden', !visible);
  }

  toast(message: string, tone: 'normal' | 'good' | 'warning' = 'normal'): void {
    this.toastRoot.textContent = message;
    this.toastRoot.dataset.tone = tone;
    this.toastRoot.classList.add('is-visible');
    window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => this.toastRoot.classList.remove('is-visible'), 2400);
  }

  fatal(title: string, message: string): void {
    this.fatalRoot.hidden = false;
    this.fatalRoot.innerHTML = `<div class="fatal-card"><span class="fatal-lantern">✦</span><h2>${escapeHtml(title)}</h2><p>${escapeHtml(message)}</p><button class="paper-button paper-button--primary" data-command="continue-game">返回旅途</button></div>`;
  }

  private bindEvents(): void {
    this.root.addEventListener('click', (event) => {
      const target = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-command]') : null;
      if (!target) return;
      const command = target.dataset.command as GameCommand['type'] | undefined;
      if (!command || command === 'attack') return;
      event.preventDefault();
      this.onCommand(this.commandFromElement(command, target));
    });

    this.root.addEventListener('pointerdown', (event) => {
      const target = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-command="attack"]') : null;
      if (!target) return;
      event.preventDefault();
      this.onCommand({ type: 'attack', pressed: true });
      target.setPointerCapture?.(event.pointerId);
    });
    const releaseAttack = (event: PointerEvent) => {
      const target = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-command="attack"]') : null;
      if (!target) return;
      this.onCommand({ type: 'attack', pressed: false });
    };
    this.root.addEventListener('pointerup', releaseAttack);
    this.root.addEventListener('pointercancel', releaseAttack);

    this.root.addEventListener('input', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement)) return;
      if (target.dataset.setting === 'sfx') this.onCommand({ type: 'setting-sfx', value: Number(target.value) / 100 });
      if (target.dataset.setting === 'music') this.onCommand({ type: 'setting-music', value: Number(target.value) / 100 });
      if (target.dataset.setting === 'reduced-motion') this.onCommand({ type: 'setting-reduced-motion', value: target.checked });
      if (target.dataset.setting === 'touch') this.onCommand({ type: 'setting-touch', value: target.checked });
    });

    window.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && this.overlay !== 'none' && this.overlay !== 'dialogue' && this.overlay !== 'result') {
        this.onCommand({ type: 'close-panel' });
      }
      if (event.key === 'Enter' && this.overlay === 'dialogue') {
        event.preventDefault();
        this.onCommand({ type: 'dialogue-continue' });
      }
    });
  }

  private commandFromElement(command: GameCommand['type'], element: HTMLElement): GameCommand {
    switch (command) {
      case 'new-game': return { type: 'new-game' };
      case 'continue-game': return { type: 'continue-game' };
      case 'open-panel': return { type: 'open-panel', panel: element.dataset.panel as UiPanel };
      case 'close-panel': return { type: 'close-panel' };
      case 'pause': return { type: 'pause' };
      case 'interact': return { type: 'interact' };
      case 'travel': return { type: 'travel', zone: element.dataset.zone as ZoneId };
      case 'craft': return { type: 'craft', id: element.dataset.id ?? '' };
      case 'equip': return { type: 'equip', id: element.dataset.id ?? '' };
      case 'build': return { type: 'build', id: element.dataset.id as BuildingId };
      case 'choose-route': return { type: 'choose-route', route: element.dataset.route as 'warden' | 'shadow' | 'weaver' };
      case 'dialogue-continue': return { type: 'dialogue-continue' };
      case 'result-continue': return { type: 'result-continue' };
      case 'clear-save': return { type: 'clear-save' };
      default: return { type: 'close-panel' };
    }
  }

  private setText(selector: string, value: string): void {
    const element = this.root.querySelector<HTMLElement>(selector);
    if (element) element.textContent = value;
  }

  private template(): string {
    return `
      <main class="game-frame" aria-label="灯火小岛游戏">
        <canvas id="game-canvas" aria-label="灯火小岛游戏画面"></canvas>
        <div class="paper-grain" aria-hidden="true"></div>
        <div class="frame-corner frame-corner--tl" aria-hidden="true"></div>
        <div class="frame-corner frame-corner--br" aria-hidden="true"></div>

        <header id="world-hud" class="hud hud--world" aria-label="探索状态">
          <div class="quest-sign">
            <span class="quest-sign__eyebrow">CURRENT THREAD</span>
            <strong id="quest-title">点亮第一盏灯</strong>
            <span id="quest-progress">前往灯塔守望者身旁</span>
          </div>
          <div class="hud-resources">
            <div><small>区域</small><b id="world-zone-name">灯火港</b><em id="world-zone-subtitle">风把纸灯吹向归途</em></div>
            <div class="resource-stamp"><small>铜币</small><b id="world-gold">◈ 0</b></div>
            <div class="resource-stamp"><small>星屑</small><b id="world-starlight">✦ 0</b></div>
          </div>
          <div class="player-stamp">
            <div class="player-stamp__line"><b id="world-level">Lv.1</b><span id="world-potions">药剂 ×3</span></div>
            <div class="meter meter--hp"><i id="world-hp-fill"></i><span id="world-hp-text">100 / 100</span></div>
            <div class="meter meter--xp"><i id="world-xp-fill"></i><span id="world-xp-text">0 / 90</span></div>
          </div>
          <nav class="hud-menu" aria-label="游戏菜单">
            <button data-command="open-panel" data-panel="map" aria-label="地图">图</button>
            <button data-command="open-panel" data-panel="bag" aria-label="背包">包</button>
            <button data-command="open-panel" data-panel="forge" aria-label="锻造">锻</button>
            <button data-command="open-panel" data-panel="build" aria-label="建造">建</button>
            <button data-command="open-panel" data-panel="journal" aria-label="日志">志</button>
            <button data-command="open-panel" data-panel="settings" aria-label="设置">设</button>
          </nav>
          <div id="world-prompt" class="world-prompt"></div>
        </header>

        <section id="battle-hud" class="hud hud--battle" aria-label="战斗状态">
          <div class="battle-card battle-card--hero">
            <div class="battle-card__title"><b id="battle-hero-level">Lv.1</b><span>巡岛员</span></div>
            <div class="meter meter--hp meter--large"><i id="battle-hero-hp-fill"></i><span id="battle-hero-hp">100 / 100</span></div>
            <div class="flame-row"><span>灯火</span><div class="meter meter--flame"><i id="battle-flame-fill"></i></div><b id="battle-flame">0</b><em id="battle-flame-label">微光</em></div>
          </div>
          <div class="battle-card battle-card--enemy">
            <div class="battle-card__title"><b id="battle-enemy-name">暮影</b><span id="battle-enemies-left">等待遭遇</span></div>
            <div class="meter meter--enemy"><i id="battle-enemy-hp-fill"></i><span id="battle-enemy-hp">0 / 0</span></div>
          </div>
          <div id="battle-combo" class="battle-combo"></div>
          <div class="battle-skill-status"><span>技能 <b id="battle-skill-status">READY</b></span><span>闪避 <b id="battle-dodge-status">READY</b></span></div>
        </section>

        <div id="world-hint" class="desktop-hint"><kbd>WASD</kbd> 移动 <i></i><kbd>E</kbd> 互动 <i></i><kbd>B</kbd> 背包 <i></i><kbd>Esc</kbd> 菜单</div>

        <div id="touch-controls" class="touch-controls" aria-label="触控操作">
          <div id="joystick" class="joystick" aria-label="移动摇杆"><div class="joystick__ring"></div><div class="joystick__knob"></div></div>
          <div class="touch-actions">
            <button class="touch-button touch-button--small" data-command="potion" aria-label="使用药剂">药</button>
            <button class="touch-button touch-button--small" data-command="dodge" aria-label="闪避">闪</button>
            <button class="touch-button touch-button--skill" data-command="skill" aria-label="武器技能">技</button>
            <button class="touch-button touch-button--attack" data-command="attack" aria-label="攻击">击</button>
          </div>
        </div>

        <div id="overlay-root" class="overlay-root" data-overlay="none" aria-hidden="true"></div>
        <div id="toast-root" class="toast-root" role="status" aria-live="polite"></div>
        <div id="fatal-root" class="fatal-root" hidden></div>
      </main>`;
  }
}

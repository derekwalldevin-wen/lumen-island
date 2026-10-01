import './styles.css';
import { Game } from './game';
import { preloadSprites, setSpriteBasePath } from './render/sprites';

const root = document.querySelector<HTMLElement>('#app');

if (!root) {
  throw new Error('App root is missing');
}

try {
  // Art lives next to the bundle rather than at the server root, so the game
  // keeps working when hosted from a project subpath.
  setSpriteBasePath('art');
  preloadSprites([
    'hero', 'luma',
    'cloudPuff', 'rainSprout', 'paperKite', 'mistCrab', 'inkBat', 'starSentinel',
    'lanternMoth', 'bellWarden', 'starlessOwl',
    'sprigFork', 'bellShoot', 'moonKnife', 'rainCane', 'cometAxe',
    'forge', 'cottage', 'rainCanopy', 'starChart', 'lighthouse',
  ]);
  const game = new Game(root);
  game.start();
  (window as Window & { __lumenIslandQuest?: Game }).__lumenIslandQuest = game;
} catch (error) {
  console.error(error);
  root.innerHTML = `<main class="fatal-root" style="display:grid"><div class="fatal-card"><span class="fatal-lantern">✦</span><h2>灯火暂时没有点亮</h2><p>请刷新页面重试。若问题持续，请确认浏览器支持 Canvas 2D。</p><button class="paper-button paper-button--primary" onclick="location.reload()">刷新页面</button></div></main>`;
}

import './styles.css';
import { Game } from './game';

const root = document.querySelector<HTMLElement>('#app');

if (!root) {
  throw new Error('App root is missing');
}

try {
  const game = new Game(root);
  game.start();
  (window as Window & { __lumenIslandQuest?: Game }).__lumenIslandQuest = game;
} catch (error) {
  console.error(error);
  root.innerHTML = `<main class="fatal-root" style="display:grid"><div class="fatal-card"><span class="fatal-lantern">✦</span><h2>灯火暂时没有点亮</h2><p>请刷新页面重试。若问题持续，请确认浏览器支持 Canvas 2D。</p><button class="paper-button paper-button--primary" onclick="location.reload()">刷新页面</button></div></main>`;
}

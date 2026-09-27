import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const projectDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const distDir = path.join(projectDir, 'dist');
const html = await readFile(path.join(distDir, 'index.html'), 'utf8');

const scriptMatch = html.match(/<script\s+type="module"[^>]*src="([^"]+)"[^>]*><\/script>/i);
const styleMatch = html.match(/<link\s+rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/i);
if (!scriptMatch || !styleMatch) {
  throw new Error('Could not find the Vite module and stylesheet in dist/index.html');
}

const assetPath = (assetUrl) => path.resolve(distDir, assetUrl.replace(/^\.\//, ''));
const javascript = (await readFile(assetPath(scriptMatch[1]), 'utf8')).replace(/<\/script/gi, '<\\/script');
const stylesheet = await readFile(assetPath(styleMatch[1]), 'utf8');
const standalone = html
  .replace(scriptMatch[0], `<script type="module">\n${javascript}\n</script>`)
  .replace(styleMatch[0], `<style>\n${stylesheet}\n</style>`)
  .replace('<div id="app"></div>', '<div id="app"><p style="color:#f3e3bd;padding:2rem;font-family:sans-serif">正在点亮灯火小岛…</p></div>');

const banner = '<!-- 灯火小岛：双击运行的离线单文件版本。无需 Node、Vite 或本地服务器。 -->\n';
const output = `${banner}${standalone}`;
await writeFile(path.join(projectDir, 'play-lumen-island.html'), output, 'utf8');
await writeFile(path.join(distDir, 'play-lumen-island.html'), output, 'utf8');
console.log('Standalone build written: play-lumen-island.html');

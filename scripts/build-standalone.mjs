import { readFile, writeFile, readdir } from 'node:fs/promises';
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

// The offline build has no sibling asset folder, so the sprite set is inlined as
// data URLs and picked up by src/render/sprites.ts before it falls back to a
// path. Without this the single-file build silently renders procedural figures.
const artDir = path.join(distDir, 'art');
let inlineScript = '';
try {
  const names = (await readdir(artDir)).filter((name) => name.endsWith('.png'));
  if (names.length === 0) {
    throw new Error('no sprites found in dist/art');
  }
  const entries = [];
  for (const name of names) {
    const buffer = await readFile(path.join(artDir, name));
    entries.push(`${JSON.stringify(path.basename(name, '.png'))}:${JSON.stringify(`data:image/png;base64,${buffer.toString('base64')}`)}`);
  }
  const total = entries.reduce((sum, entry) => sum + entry.length, 0);
  inlineScript = `<script>window.__LUMEN_INLINE_SPRITES__={${entries.join(',')}};</script>`;
  console.log(`Inlined ${names.length} sprites (${Math.round(total / 1024)}KB of base64)`);
} catch (error) {
  throw new Error(`Could not inline sprites for the offline build: ${error.message}`);
}

const banner = '<!-- 灯火小岛：双击运行的离线单文件版本。无需 Node、Vite 或本地服务器。 -->\n';
const output = `${banner}${inlineScript}\n${standalone}`;
await writeFile(path.join(projectDir, 'play-lumen-island.html'), output, 'utf8');
await writeFile(path.join(distDir, 'play-lumen-island.html'), output, 'utf8');
console.log('Standalone build written: play-lumen-island.html');

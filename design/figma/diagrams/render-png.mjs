// SVG → PNG 光栅化（2x 分辨率，中文字体：微软雅黑）
// node design/figma/diagrams/render-png.mjs
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { Resvg } from '@resvg/resvg-js';

const dir = join(dirname(fileURLToPath(import.meta.url)), 'out');
const files = readdirSync(dir).filter((f) => f.endsWith('.svg'));
for (const f of files) {
  const svg = readFileSync(join(dir, f), 'utf8');
  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: 2400 },
    font: {
      loadSystemFonts: true,
      fontFiles: ['C:\\Windows\\Fonts\\msyh.ttc', 'C:\\Windows\\Fonts\\msyhbd.ttc'],
      defaultFontFamily: 'Microsoft YaHei',
    },
    background: '#ffffff',
  });
  const png = resvg.render().asPng();
  writeFileSync(join(dir, f.replace(/\.svg$/, '.png')), png);
  console.log(`✓ ${f.replace(/\.svg$/, '.png')}  (${(png.length / 1024).toFixed(0)} KB)`);
}

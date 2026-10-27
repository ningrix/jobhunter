// 论文配图构建：node design/figma/diagrams/build.mjs
// 输出 SVG 到 design/figma/diagrams/out/，供光栅化为 PNG 后嵌入论文。
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  dUseCase, dAuthFlow, dResumeFlow, dJdFlow, dRadarFlow, dMatchFlow, dAiTaskFlow,
} from './flows.mjs';
import {
  dArch, dModuleResume, dModuleJobs, dModuleMatch, dModuleRadar, dModuleSettings,
} from './arch-modules.mjs';
import {
  dEntityUser, dEntityResume, dEntityJob, dEntityMatch, dEntityAiTask, dErTotal,
} from './entities.mjs';

const DIAGRAMS = [
  ['fig3-1-usecase', dUseCase],
  ['fig3-2-auth-flow', dAuthFlow],
  ['fig3-3-resume-flow', dResumeFlow],
  ['fig3-4-jd-flow', dJdFlow],
  ['fig3-5-radar-flow', dRadarFlow],
  ['fig3-6-match-flow', dMatchFlow],
  ['fig3-7-aitask-flow', dAiTaskFlow],
  ['fig4-1-arch', dArch],
  ['fig4-2-module-resume', dModuleResume],
  ['fig4-3-module-jobs', dModuleJobs],
  ['fig4-4-module-match', dModuleMatch],
  ['fig4-5-module-radar', dModuleRadar],
  ['fig4-6-module-settings', dModuleSettings],
  ['fig4-7-entity-user', dEntityUser],
  ['fig4-8-entity-resume', dEntityResume],
  ['fig4-9-entity-job', dEntityJob],
  ['fig4-10-entity-match', dEntityMatch],
  ['fig4-11-entity-aitask', dEntityAiTask],
  ['fig4-12-er-total', dErTotal],
];

const outDir = join(dirname(fileURLToPath(import.meta.url)), 'out');
mkdirSync(outDir, { recursive: true });
for (const [name, fn] of DIAGRAMS) {
  const { w, h, svg } = fn();
  const file = join(outDir, `${name}.svg`);
  writeFileSync(file, svg);
  console.log(`✓ ${name}.svg  ${w}x${h}  (${(svg.length / 1024).toFixed(1)} KB)`);
}

// 一键构建：node design/figma/build.mjs
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { themes } from './tokens.mjs';
import { defs } from './components.mjs';

import { loginFrame } from './frames/login.mjs';
import { dashboardFrame } from './frames/dashboard.mjs';
import { jobsFrame } from './frames/jobs.mjs';
import { resumesFrame } from './frames/resumes.mjs';
import { resumeDetailFrame } from './frames/resume-detail.mjs';
import { applicationsFrame } from './frames/applications.mjs';
import { appModalFrame } from './frames/app-modal.mjs';
import { remindersFrame } from './frames/reminders.mjs';

const FRAMES = [
  ['login', loginFrame],
  ['dashboard', dashboardFrame],
  ['jobs', jobsFrame],
  ['resumes', resumesFrame],
  ['resume-detail', resumeDetailFrame],
  ['applications', applicationsFrame],
  ['app-modal', appModalFrame],
  ['reminders', remindersFrame],
];

const outDir = join(dirname(fileURLToPath(import.meta.url)), 'frames');
mkdirSync(outDir, { recursive: true });

const wrap = (inner) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="1440" height="1024" viewBox="0 0 1440 1024">${defs()}${inner}</svg>`;

for (const [name, fn] of FRAMES) {
  for (const t of Object.values(themes)) {
    const svg = wrap(fn(t));
    const file = join(outDir, `${name}.${t.name}.svg`);
    writeFileSync(file, svg);
    console.log(`✓ ${file} (${(svg.length / 1024).toFixed(1)} KB)`);
  }
}

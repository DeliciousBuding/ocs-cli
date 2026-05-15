import { readFileSync, writeFileSync } from 'fs';
const f = 'dist/cli/index.js';
const c = readFileSync(f, 'utf-8');
if (!c.startsWith('#!')) {
  writeFileSync(f, '#!/usr/bin/env node\n' + c);
}

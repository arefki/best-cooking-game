// Sizzle & Serve — entry program (Node 22, standard library only).
//
// What it hands in: the playable game (game/, plain static files a desktop
// browser opens offline) and its screenshots (screenshots/, 3 or 4 real renders
// of the game), copied from beside this file into the grader's output
// directory, plus dossier.json — the summary the AI judge reads — built with
// the vendored make.fun library (vendor/makefun-game.ts, shipped unchanged).
//
// Run it locally the same way the grader does, with MAKEFUN_OUTPUT_DIR
// standing in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
// Play it in a browser with any static server over game/.

import { cpSync, existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// The scorer's own caps (from the kit's gate reference): only text_max_bytes
// shapes the dossier's bytes; the rest refuse an entry the scorer would
// refuse — more than 4 screenshots or one over 256 KiB; more than 993 files
// in game/ or 48 MiB of game files in all; a path under game/ over 1000 bytes.
const CAPS = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
};

mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) {
  cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });
}

writeFileSync(join(out, 'dossier.json'), buildDossier(out, CAPS));

// Fail loudly instead of handing in an empty dossier: the judge reads it.
const dossierBytes = statSync(join(out, 'dossier.json')).size;
if (dossierBytes === 0) throw new Error('dossier.json came out empty');
console.log(`Sizzle & Serve handed in to ${out} (dossier ${dossierBytes} bytes)`);

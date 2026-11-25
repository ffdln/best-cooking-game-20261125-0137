// Warung Sizzle — main.ts (Node 22, standard library only)
// Menyerahkan game ke penilai: menyalin game/ dan screenshots/ dari direktori
// ini ke direktori output, lalu menulis /output/dossier.json — ringkasan yang
// dibaca juri — memakai library dossier make.fun yang sudah di-vendor.
// Di luar grader, MAKEFUN_OUTPUT_DIR menggantikan /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(outDir, { recursive: true });
cpSync(join(here, 'game'), join(outDir, 'game'), { recursive: true });
mkdirSync(join(outDir, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) {
  cpSync(join(here, 'screenshots'), join(outDir, 'screenshots'), { recursive: true });
}

// Batas dari scorer sendiri: hanya text_max_bytes yang membentuk byte;
// sisanya menolak entry yang memang akan ditolak scorer (lebih dari 4
// screenshot atau satu di atas 256 KiB; lebih dari 993 file di game/ atau
// 48 MiB total file game, atau path di bawah game/ lebih dari 1000 byte).
// Catatan: dossier.json selalu ditulis terakhir, setelah game/ dan
// screenshots/ lengkap disalin, supaya ukurannya dihitung dari hasil akhir.
writeFileSync(
  join(outDir, 'dossier.json'),
  buildDossier(outDir, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  }),
);

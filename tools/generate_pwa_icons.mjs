// Render platform-specific PWA/Web Clip icons from the shared vector source.
// node tools/generate_pwa_icons.mjs [path-to-sharp]
import { createRequire } from 'node:module';
import { readFile, writeFile } from 'node:fs/promises';

const require = createRequire(import.meta.url);
const sharp = require(process.argv[2] || 'sharp');
const directory = new URL('../web/icons/', import.meta.url);
const svg = await readFile(new URL('photographic-styles.svg', directory));

// Windows/Chrome/Edge "any" icons keep transparent rounded corners.
for (const size of [192, 512]) {
  await writeFile(new URL(`icon-${size}.png`, directory),
    await sharp(svg).resize(size, size).png().toBuffer());
}

// iOS/macOS Web Clips receive one opaque icon, matching Shalielie's structure.
// Do not swap light/dark files in page code: installed web-app icons are cached,
// while the system can apply its own Home Screen appearance treatment dynamically.
await writeFile(new URL('icon-180.png', directory),
  await sharp(svg).resize(180, 180).flatten({background:'#0894ff'}).png().toBuffer());

// Maskable desktop/mobile PWA icon remains separate so "any" icons stay rounded.
await writeFile(new URL('icon-512-maskable.png', directory),
  await sharp(svg).resize(512, 512).flatten({background:'#0894ff'}).png().toBuffer());

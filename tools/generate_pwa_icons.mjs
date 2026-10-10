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

// iOS Web Clips need a fully opaque square source so iOS can apply its own
// Light/Dark/Tinted Home Screen treatment. Maskable PWAs use the same rule.
await writeFile(new URL('icon-180-ios.png', directory),
  await sharp(svg).resize(180, 180).flatten({background:'#0894ff'}).png().toBuffer());
await writeFile(new URL('icon-512-maskable.png', directory),
  await sharp(svg).resize(512, 512).flatten({background:'#0894ff'}).png().toBuffer());

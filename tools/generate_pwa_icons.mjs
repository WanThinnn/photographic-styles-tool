// Render the shared vector source for Safari and installed web apps.
// node tools/generate_pwa_icons.mjs [path-to-sharp]
import { createRequire } from 'node:module';
import { readFile, writeFile } from 'node:fs/promises';
const require = createRequire(import.meta.url);
const sharp = require(process.argv[2] || 'sharp');
const directory = new URL('../web/icons/', import.meta.url);
const svg = await readFile(new URL('photographic-styles.svg', directory));
for (const size of [180, 192, 512]) {
  await writeFile(new URL(`icon-${size}.png`, directory), await sharp(svg).resize(size, size).png().toBuffer());
}

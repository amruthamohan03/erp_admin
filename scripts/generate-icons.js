/*
 * Rasterises public/brand/erp-admin-mark.svg into the browser icon files.
 *
 *   node scripts/generate-icons.js
 *
 * Run it after editing the mark, and commit what it writes. The outputs are
 * committed assets, not build artefacts — that is deliberate, so a deploy does
 * not need an image toolchain and `next build` stays the only build step.
 *
 * sharp is not a dependency of this project; it arrives transitively with Next
 * and is used here only as a developer tool. If it is ever absent, this script
 * says so and exits — nothing at runtime depends on it.
 */
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const SOURCE = path.join(ROOT, 'public', 'brand', 'erp-admin-mark.svg');
const APP_DIR = path.join(ROOT, 'src', 'app');

/**
 * sharp arrives as an optional dependency of Next rather than a direct one, so
 * under pnpm's strict layout it is not resolvable from the project root — it
 * lives in the .pnpm store. Look there before giving up.
 */
function loadSharp() {
  try {
    return require('sharp');
  } catch {
    /* not hoisted — fall through to the store */
  }
  const store = path.join(ROOT, 'node_modules', '.pnpm');
  const dir = fs.existsSync(store)
    ? fs.readdirSync(store).find((d) => d.startsWith('sharp@'))
    : null;
  if (dir) {
    try {
      return require(path.join(store, dir, 'node_modules', 'sharp'));
    } catch {
      /* fall through to the error below */
    }
  }
  return null;
}

const sharp = loadSharp();
if (!sharp) {
  console.error(
    'sharp is not resolvable. It normally ships with Next; run `pnpm install` and retry.\n' +
      'Nothing at runtime needs it — this script only regenerates the committed icon files.',
  );
  process.exit(1);
}

/**
 * Minimal ICO container around PNG payloads.
 *
 * The ICO directory is a 6-byte header plus one 16-byte entry per image; PNG
 * payloads are legal inside ICO for every browser that still asks for favicon.ico.
 * Written by hand rather than pulling in an encoder for ~40 lines of struct.
 */
function buildIco(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type 1 = icon
  header.writeUInt16LE(images.length, 4);

  let offset = 6 + images.length * 16;
  const entries = [];
  for (const { size, data } of images) {
    const e = Buffer.alloc(16);
    // 256 is stored as 0 — the field is one byte.
    e.writeUInt8(size >= 256 ? 0 : size, 0); // width
    e.writeUInt8(size >= 256 ? 0 : size, 1); // height
    e.writeUInt8(0, 2); // palette size (0 = truecolour)
    e.writeUInt8(0, 3); // reserved
    e.writeUInt16LE(1, 4); // colour planes
    e.writeUInt16LE(32, 6); // bits per pixel
    e.writeUInt32LE(data.length, 8);
    e.writeUInt32LE(offset, 12);
    entries.push(e);
    offset += data.length;
  }

  return Buffer.concat([header, ...entries, ...images.map((i) => i.data)]);
}

async function main() {
  const svg = fs.readFileSync(SOURCE);
  const png = (size) => sharp(svg, { density: 384 }).resize(size, size).png().toBuffer();

  // Next.js file conventions: app/icon.svg, app/apple-icon.png and
  // app/favicon.ico are picked up automatically and emitted as <link> tags —
  // but ONLY when generateMetadata does not supply `icons` itself, which is
  // exactly the layering we want (uploaded favicon wins, this is the default).
  fs.copyFileSync(SOURCE, path.join(APP_DIR, 'icon.svg'));

  // 180×180 is what iOS asks for; it also has no transparency, hence the flatten.
  const apple = await sharp(svg, { density: 384 })
    .resize(180, 180)
    .flatten({ background: '#ffffff' })
    .png()
    .toBuffer();
  fs.writeFileSync(path.join(APP_DIR, 'apple-icon.png'), apple);

  const ico = buildIco(
    await Promise.all([16, 32, 48].map(async (size) => ({ size, data: await png(size) }))),
  );
  fs.writeFileSync(path.join(APP_DIR, 'favicon.ico'), ico);

  for (const f of ['icon.svg', 'apple-icon.png', 'favicon.ico']) {
    const p = path.join(APP_DIR, f);
    console.log(`  src/app/${f} — ${fs.statSync(p).size} bytes`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

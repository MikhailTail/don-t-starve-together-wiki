// tools/generate-sprite.js
// Splits the site images into per-section sprite sheets:
//   assets/sprite-<group>.png  (one PNG per page section)
//   assets/sprites.css          (slice rules pointing to the right sheet)
//   assets/sprite-map.json      (slice -> sheet + position)
//
// Groups follow the page sections. Images used by several sections go into
// the "shared" sheet (img-001 header logo, img-063/065/067 shared icons).
//
// Requires: sharp
//
// Run with no arguments:
//   node tools/generate-sprite.js
// If index.html still contains <img src="data:..."> it is first converted to
// <span class="sprite sprite-img-NNN ..."> (original kept as index.html.bak).

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const ROOT = path.join(__dirname, '..');
const INDEX_HTML = path.join(ROOT, 'index.html');
const OUT_IMAGES_DIR = path.join(ROOT, 'images');
const OUT_ASSETS_DIR = path.join(ROOT, 'assets');
const SPRITES_CSS = path.join(OUT_ASSETS_DIR, 'sprites.css');
const SPRITE_MAP = path.join(OUT_ASSETS_DIR, 'sprite-map.json');

// Display box size (px) per size-token: { desktop, mobile }.
// Keep in sync with the .game-img.* rules in index.html (incl. media query).
const SIZE_TOKENS = {
  'site-logo': { desktop: 34, mobile: 34 },
  'portrait':  { desktop: 48, mobile: 36 },
  'item':      { desktop: 40, mobile: 32 },
  'creature':  { desktop: 48, mobile: 36 },
  'icon':      { desktop: 24, mobile: 24 },
  'season':    { desktop: 64, mobile: 48 },
};
const MOBILE_MEDIA = '@media (max-width: 480px)';

// Icons are rendered at 24-64px, so the source artwork is downscaled to
// (largest display size * DPR) before compositing. Feeding the sheets the
// original artwork is wasteful: PNG is lossless and 1300x1300+ BOSS art
// decompressed from webp bloats the sheet to multiple MB.
const DPR = 3;

function getSizeToken(classes) {
  const tokens = String(classes || '').split(/\s+/);
  for (const name of Object.keys(SIZE_TOKENS)) {
    if (tokens.includes(name)) return name;
  }
  return null;
}

function round(v) {
  const r = Math.round(v * 1000) / 1000;
  return Number.isInteger(r) ? String(r) : String(r);
}

// ---- Per-section grouping -------------------------------------------------
// Every image in images/ (img-001..img-116) must appear in exactly one group.
const rangeFiles = (a, b) =>
  Array.from({ length: b - a + 1 }, (_, i) => `img-${String(a + i).padStart(3, '0')}.webp`);

const GROUPS = {
  shared: ['img-001.webp', 'img-063.webp', 'img-065.webp', 'img-067.webp'],
  characters: rangeFiles(2, 20),
  items: rangeFiles(21, 36),
  creatures: rangeFiles(37, 52),
  survival: rangeFiles(53, 60),
  weather: ['img-061.webp', 'img-062.webp', 'img-064.webp', 'img-066.webp'],
  caves: rangeFiles(68, 84),
  crafting: rangeFiles(85, 116),
};

const GROUP_OF = {};
for (const [group, files] of Object.entries(GROUPS)) {
  for (const f of files) GROUP_OF[f] = group;
}

// ---- Extract embedded base64 images (first conversion only) ---------------
function extractBase64Images(html) {
  const imgTagRegex =
    /<img\s+([^>]*?)src=("|')(data:(?<mime>image\/(?:png|jpeg|jpg|webp));base64,(?<b64>[A-Za-z0-9+/=]+))(\2)([^>]*?)>/gi;
  const usages = [];
  const seenB64 = new Map();
  let counter = 1;
  let match;
  while ((match = imgTagRegex.exec(html)) !== null) {
    const beforeAttrs = match[1] || '';
    const mime = match.groups.mime;
    const b64 = match.groups.b64;
    const afterAttrs = match[7] || '';
    const attrs = (beforeAttrs + ' ' + (afterAttrs || '')).trim();

    let cls = '';
    let alt = '';
    const classMatch = /class=("|')([^"']+)("|')/i.exec(attrs);
    if (classMatch) cls = classMatch[2];
    const altMatch = /alt=("|')([^"']*)("|')/i.exec(attrs);
    if (altMatch) alt = altMatch[2];

    let filename = seenB64.get(b64);
    if (!filename) {
      const ext = mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : 'jpg';
      filename = `img-${String(counter).padStart(3, '0')}.${ext}`;
      fs.writeFileSync(path.join(OUT_IMAGES_DIR, filename), Buffer.from(b64, 'base64'));
      seenB64.set(b64, filename);
      counter++;
    }
    usages.push({ fullTag: match[0], filename, classes: cls, alt });
  }
  return usages;
}

function extractSpriteUsages(html) {
  // Already-converted index.html: <span class="sprite sprite-img-NNN token">
  const usages = [];
  const spanRe = /class="([^"]*sprite-img-(\d+)[^"]*)"/g;
  let match;
  while ((match = spanRe.exec(html)) !== null) {
    const classes = match[1].split(/\s+/).filter((c) => c && !c.startsWith('sprite'));
    usages.push({ filename: `img-${String(+match[2]).padStart(3, '0')}.webp`, classes: classes.join(' ') });
  }
  return usages;
}

(async () => {
  try {
    if (!fs.existsSync(INDEX_HTML)) {
      console.error('index.html not found in repository root');
      process.exit(1);
    }
    if (!fs.existsSync(OUT_IMAGES_DIR)) fs.mkdirSync(OUT_IMAGES_DIR, { recursive: true });
    if (!fs.existsSync(OUT_ASSETS_DIR)) fs.mkdirSync(OUT_ASSETS_DIR, { recursive: true });

    let html = fs.readFileSync(INDEX_HTML, 'utf8');

    // 1. First conversion: extract <img src="data:..."> to images/ + <span>.
    if (/<img[^>]*src="data:/.test(html)) {
      const usages = extractBase64Images(html);
      if (usages.length === 0) {
        console.log('No embedded data:image images found.');
        process.exit(1);
      }
      let newHtml = html;
      for (const entry of usages) {
        const name = path.basename(entry.filename, path.extname(entry.filename));
        const escaped = entry.fullTag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const classPart = entry.classes ? entry.classes + ' ' : '';
        const aria = entry.alt ? ` aria-label="${entry.alt.replace(/"/g, '&quot;')}"` : '';
        const replacement = `<span class="sprite sprite-${name} ${classPart.trim()}" role="img"${aria}></span>`;
        newHtml = newHtml.replace(new RegExp(escaped, 'g'), replacement);
      }
      fs.writeFileSync(path.join(ROOT, 'index.html.bak'), html, 'utf8');
      fs.writeFileSync(INDEX_HTML, newHtml, 'utf8');
      html = newHtml;
      console.log('Converted embedded images to sprite spans.');
    }

    // 2. Read image metadata from images/ dir.
    const imageFiles = fs.readdirSync(OUT_IMAGES_DIR).filter((f) => /^img-\d+\.\w+$/i.test(f));
    if (imageFiles.length === 0) {
      console.error('No images found in images/ directory.');
      process.exit(1);
    }
    const metas = [];
    for (const f of imageFiles) {
      const meta = await sharp(fs.readFileSync(path.join(OUT_IMAGES_DIR, f))).metadata();
      metas.push({ filename: f, width: meta.width, height: meta.height, path: path.join(OUT_IMAGES_DIR, f) });
    }

    // 3. Determine the size-token(s) used per image from index.html.
    const tokenByFile = {};
    for (const u of extractSpriteUsages(html)) {
      const t = getSizeToken(u.classes);
      if (!t) continue;
      if (!tokenByFile[u.filename]) tokenByFile[u.filename] = new Set();
      tokenByFile[u.filename].add(t);
    }

    // 4. Verify grouping covers every image exactly once.
    const covered = new Set();
    for (const files of Object.values(GROUPS)) for (const f of files) covered.add(f);
    for (const m of metas) {
      if (!covered.has(m.filename)) console.warn(`WARNING: ${m.filename} not in any group (will be skipped).`);
      if (!GROUP_OF[m.filename]) continue;
      const group = GROUP_OF[m.filename];
      if (m.filename.endsWith('.webp') !== true) continue;
    }

    // 5. Pack each group into its own sheet + build css.
    // Every slice in one sheet must share the same height for the CSS
    // slice-position formula to hold. The shared height H is chosen as:
    //   - display-driven target (largest token * DPR) when the group contains
    //     large artwork that must be downscaled (creatures, caves)
    //   - the tallest source image otherwise, so small-icon groups
    //     (items, crafting, characters) are never upscaled.
    const sheetSize = {}; // group -> { SW, SH }
    const groupMap = {};  // filename -> { group, left, top, width, height }
    for (const [group, files] of Object.entries(GROUPS)) {
      const present = files.filter((f) => fs.existsSync(path.join(OUT_IMAGES_DIR, f)));
      const info = present.map((f) => metas.find((x) => x.filename === f)).filter(Boolean);
      const tokens = [...new Set(info.flatMap((m) => [...(tokenByFile[m.filename] || [])]))];
      const maxS = tokens.length ? Math.max(...tokens.map((t) => SIZE_TOKENS[t].desktop)) : 48;
      const targetH = Math.max(maxS * DPR, 24);
      const maxOrigH = Math.max(...info.map((m) => m.height));
      const H = maxOrigH > targetH ? targetH : maxOrigH; // only downscale, never upscale
      const planned = info.map((m) => ({ ...m, targetH: H }));

      const prepared = [];
      for (const m of planned) {
        const buf = await sharp(m.path)
          .resize({ height: m.targetH })
          .png({ compressionLevel: 9 })
          .toBuffer({ resolveWithObject: true });
        prepared.push({ filename: m.filename, data: buf.data, width: buf.info.width, height: buf.info.height });
      }
      const SW = Math.max(...prepared.map((m) => m.width));
      const SH = prepared.reduce((s, m) => s + m.height, 0);
      sheetSize[group] = { SW, SH };

      let y = 0;
      const composite = [];
      for (const m of prepared) {
        composite.push({ input: m.data, top: y, left: 0 });
        groupMap[m.filename] = { group, left: 0, top: y, width: m.width, height: m.height };
        y += m.height;
      }
      await sharp({
        create: { width: SW, height: SH, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
      })
        .composite(composite)
        .png({ compressionLevel: 9 })
        .toFile(path.join(OUT_ASSETS_DIR, `sprite-${group}.png`));
      const kb = Math.round(fs.statSync(path.join(OUT_ASSETS_DIR, `sprite-${group}.png`)).size / 1024);
      console.log(`sprite-${group}.png  ${SW}x${SH}  ${kb} KB`);
    }

    // 6. Write sprites.css. Slice rule formula for a sheet (SW,SH):
    //    background-size  = (s*SW/w) (s*SH/h);  background-position-y = -(s*T/h)
    const rule = (filename, token, s) => {
      const info = groupMap[filename];
      const { SW, SH } = sheetSize[info.group];
      const base = `sprite-${path.basename(filename, path.extname(filename))}`;
      const bx = (s * SW) / info.width;
      const by = (s * SH) / info.height;
      const py = (s * info.top) / info.height;
      return `.${base}.${token} { background-image: url("sprite-${info.group}.png"); background-size: ${round(bx)}px ${round(by)}px; background-position: 0 ${round(-py)}px; }`;
    };

    const css = [];
    css.push('/* Generated by tools/generate-sprite.js */');
    css.push('.sprite { background-repeat: no-repeat; display: inline-block; }');
    css.push('');

    const orderedFiles = Object.values(GROUPS).flat().filter((f) => groupMap[f]);
    for (const f of orderedFiles) {
      for (const token of tokenByFile[f] || []) {
        css.push(rule(f, token, SIZE_TOKENS[token].desktop));
      }
    }

    const mobileNeeded = orderedFiles.some((f) =>
      [...(tokenByFile[f] || [])].some((t) => SIZE_TOKENS[t].mobile !== SIZE_TOKENS[t].desktop)
    );
    if (mobileNeeded) {
      css.push('', `${MOBILE_MEDIA} {`);
      for (const f of orderedFiles) {
        for (const token of tokenByFile[f] || []) {
          if (SIZE_TOKENS[token].mobile === SIZE_TOKENS[token].desktop) continue;
          css.push('    ' + rule(f, token, SIZE_TOKENS[token].mobile));
        }
      }
      css.push('}');
    }

    fs.writeFileSync(SPRITES_CSS, css.join('\n') + '\n', 'utf8');
    fs.writeFileSync(SPRITE_MAP, JSON.stringify(groupMap, null, 2), 'utf8');

    // 7. Remove the old monolithic sheet (if present).
    const oldSheet = path.join(OUT_ASSETS_DIR, 'sprite.png');
    if (fs.existsSync(oldSheet)) {
      fs.unlinkSync(oldSheet);
      console.log('Removed old assets/sprite.png');
    }

    const linkTag = '<link rel="stylesheet" href="assets/sprites.css">';
    if (!html.includes(linkTag)) {
      fs.writeFileSync(
        INDEX_HTML,
        html.replace('</head>', linkTag + '</head>'),
        'utf8'
      );
      console.log('Injected sprites.css link.');
    }

    console.log('Done. Generated assets/sprites.css + assets/sprite-<group>.png');
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
})();

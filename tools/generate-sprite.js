// tools/generate-sprite.js
// Generates assets/sprite.png + assets/sprites.css, and replaces every
// <img src="data:image/...;base64,..."> in index.html with
// <span class="sprite sprite-img-NNN [original classes]" role="img" ...>.
//
// Display model:
//   The element box size is owned by the existing CSS classes
//   (.game-img.portrait = 48px, .game-img.item = 40px, ...) which also have a
//   responsive override inside @media (max-width: 480px). The sprite sheet keeps
//   the natural image sizes, and each slice rule computes background-size /
//   background-position so the slice scales exactly into its box, for both the
//   desktop and the mobile variant.
//
// Requires: sharp

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const ROOT = path.join(__dirname, '..');
const INDEX_HTML = path.join(ROOT, 'index.html');
const OUT_IMAGES_DIR = path.join(ROOT, 'images');
const OUT_ASSETS_DIR = path.join(ROOT, 'assets');
const SPRITE_PNG = path.join(OUT_ASSETS_DIR, 'sprite.png');
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

if (!fs.existsSync(INDEX_HTML)) {
  console.error('index.html not found in repository root');
  process.exit(1);
}
if (!fs.existsSync(OUT_IMAGES_DIR)) fs.mkdirSync(OUT_IMAGES_DIR, { recursive: true });
if (!fs.existsSync(OUT_ASSETS_DIR)) fs.mkdirSync(OUT_ASSETS_DIR, { recursive: true });

let html = fs.readFileSync(INDEX_HTML, 'utf8');

// Find all <img ... src="data:..." ...>
const imgTagRegex = /<img\s+([^>]*?)src=("|')(data:(?<mime>image\/(?:png|jpeg|jpg|webp));base64,(?<b64>[A-Za-z0-9+/=]+))(\2)([^>]*?)>/gi;

const usages = []; // { fullTag, filename, classes, alt } for every <img>
const seenB64 = new Map(); // b64 -> filename
let match;
let counter = 1;

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
    const ext = mime === 'image/png' ? 'png' : (mime === 'image/webp' ? 'webp' : (mime === 'image/jpeg' ? 'jpg' : 'bin'));
    filename = `img-${String(counter).padStart(3, '0')}.${ext}`;
    fs.writeFileSync(path.join(OUT_IMAGES_DIR, filename), Buffer.from(b64, 'base64'));
    seenB64.set(b64, filename);
    counter++;
  }
  usages.push({ fullTag: match[0], filename, classes: cls, alt });
}

if (usages.length === 0) {
  console.log('No embedded data:image base64 images found in index.html.');
  console.log('(Already converted? Restore index.html.bak first, then re-run.)');
  process.exit(0);
}

(async () => {
  try {
    // Size-token set per unique image (union of tokens used across usages)
    const tokenByFile = {};
    for (const u of usages) {
      const t = getSizeToken(u.classes);
      if (!t) continue;
      if (!tokenByFile[u.filename]) tokenByFile[u.filename] = new Set();
      tokenByFile[u.filename].add(t);
    }

    const uniqueFiles = [...new Set(usages.map((u) => u.filename))];
    const metas = [];
    for (const f of uniqueFiles) {
      const p = path.join(OUT_IMAGES_DIR, f);
      const meta = await sharp(fs.readFileSync(p)).metadata();
      metas.push({ filename: f, width: meta.width, height: meta.height, path: p });
    }

    // Vertical packing (natural sizes)
    const spriteWidth = Math.max(...metas.map((m) => m.width));
    const spriteHeight = metas.reduce((s, m) => s + m.height, 0);

    let yOffset = 0;
    const composite = [];
    const map = {};
    for (const m of metas) {
      composite.push({ input: m.path, top: yOffset, left: 0 });
      map[m.filename] = { left: 0, top: yOffset, width: m.width, height: m.height };
      yOffset += m.height;
    }

    await sharp({
      create: { width: spriteWidth, height: spriteHeight, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
    })
      .composite(composite)
      .png()
      .toFile(SPRITE_PNG);

    // ---- sprites.css ----
    // For a slice with natural size (w,h) at top T in a sheet of (SW,SH),
    // displayed in a box of size s x s:
    //   background-size  = (s*SW/w)  (s*SH/h)
    //   background-position-y = -(s*T/h)
    const rule = (m, token, s) => {
      const base = `sprite-${path.basename(m.filename, path.extname(m.filename))}`;
      const bx = (s * spriteWidth) / m.width;
      const by = (s * spriteHeight) / m.height;
      const py = (s * map[m.filename].top) / m.height;
      return `.${base}.${token} { background-size: ${round(bx)}px ${round(by)}px; background-position: 0 ${round(-py)}px; }`;
    };

    const css = [];
    css.push('/* Generated by tools/generate-sprite.js */');
    css.push('.sprite { background-image: url("sprite.png"); background-repeat: no-repeat; display: inline-block; }');
    css.push('');

    for (const m of metas) {
      for (const token of tokenByFile[m.filename] || []) {
        css.push(rule(m, token, SIZE_TOKENS[token].desktop));
      }
    }

    const mobileNeeded = metas.some((m) =>
      [...(tokenByFile[m.filename] || [])].some((t) => SIZE_TOKENS[t].mobile !== SIZE_TOKENS[t].desktop)
    );
    if (mobileNeeded) {
      css.push('', `${MOBILE_MEDIA} {`);
      for (const m of metas) {
        for (const token of tokenByFile[m.filename] || []) {
          if (SIZE_TOKENS[token].mobile === SIZE_TOKENS[token].desktop) continue;
          css.push('    ' + rule(m, token, SIZE_TOKENS[token].mobile));
        }
      }
      css.push('}');
    }

    fs.writeFileSync(SPRITES_CSS, css.join('\n') + '\n', 'utf8');
    fs.writeFileSync(SPRITE_MAP, JSON.stringify(map, null, 2), 'utf8');

    console.log('Created sprite and mapping. Updating index.html...');

    // Replace <img ... src="data:..."> with <span class="sprite sprite-<name> [orig classes]">
    let newHtml = html;
    for (const entry of usages) {
      const name = path.basename(entry.filename, path.extname(entry.filename));
      const escaped = entry.fullTag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const classPart = entry.classes ? entry.classes + ' ' : '';
      const aria = entry.alt ? ` aria-label="${entry.alt.replace(/"/g, '&quot;')}"` : '';
      const replacement = `<span class="sprite sprite-${name} ${classPart.trim()}" role="img"${aria}></span>`;
      newHtml = newHtml.replace(new RegExp(escaped, 'g'), replacement);
    }

    // Inject stylesheet link after the first </style>
    const linkTag = '<link rel="stylesheet" href="assets/sprites.css">';
    if (!newHtml.includes(linkTag)) {
      if (/<\/style>/.test(newHtml)) {
        newHtml = newHtml.replace(/<\/style>/, '</style>\n' + linkTag);
      } else {
        newHtml = newHtml.replace('</head>', linkTag + '</head>');
      }
    }

    // Backup original
    fs.writeFileSync(path.join(ROOT, 'index.html.bak'), html, 'utf8');
    fs.writeFileSync(INDEX_HTML, newHtml, 'utf8');

    console.log('index.html updated. Generated files:');
    console.log(' -', SPRITE_PNG);
    console.log(' -', SPRITES_CSS);
    console.log(' -', SPRITE_MAP);
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
})();

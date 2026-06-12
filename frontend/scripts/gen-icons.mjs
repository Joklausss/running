// Generates the PWA / apple-touch icons as PNGs (no native deps — pure JS).
// Design: brand-green field, white running "loop" ring, dark start marker.
import { PNG } from 'pngjs';
import { mkdirSync, createWriteStream } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(__dirname, '../public');
mkdirSync(outDir, { recursive: true });

const GREEN = [0, 200, 83];
const WHITE = [245, 246, 248];
const NAVY = [15, 17, 23];

function px(data, i, [r, g, b]) {
  data[i] = r;
  data[i + 1] = g;
  data[i + 2] = b;
  data[i + 3] = 255;
}

function render(size) {
  const png = new PNG({ width: size, height: size });
  const c = size / 2;
  const rOuter = size * 0.34;
  const rInner = size * 0.25;
  const rMid = (rOuter + rInner) / 2;
  const mark = { x: c, y: c - rMid }; // start marker sits on top of the loop
  const markR = size * 0.075;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (size * y + x) << 2;
      const r = Math.hypot(x - c, y - c);
      let color = GREEN;
      if (r <= rOuter && r >= rInner) color = WHITE; // the loop
      if (Math.hypot(x - mark.x, y - mark.y) <= markR) color = NAVY; // start dot
      px(png.data, i, color);
    }
  }
  return png;
}

function write(size, name) {
  return new Promise((resolve, reject) => {
    const stream = createWriteStream(path.join(outDir, name));
    render(size).pack().pipe(stream).on('finish', resolve).on('error', reject);
  });
}

await Promise.all([
  write(192, 'pwa-192x192.png'),
  write(512, 'pwa-512x512.png'),
  write(180, 'apple-touch-icon.png'),
  write(32, 'favicon-32.png'),
]);
console.log('icons written to public/');

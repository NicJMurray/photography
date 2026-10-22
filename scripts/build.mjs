import { cp, mkdir, readFile, rm, access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, 'dist');
const gallery = JSON.parse(await readFile(path.join(root, 'gallery.json'), 'utf8'));
if (!Array.isArray(gallery) || !gallery.length) throw new Error('Gallery is empty');
for (const photo of gallery) {
  for (const key of ['src', 'large']) {
    const file = path.resolve(root, photo[key]);
    if (!file.startsWith(root + path.sep)) throw new Error('Invalid image path');
    await access(file);
  }
}
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
for (const file of ['index.html', 'photography-20260727.css', 'gallery-20260727.js', 'gallery.json', 'og.jpg', 'photos']) {
  await cp(path.join(root, file), path.join(output, file), { recursive: true });
}
console.log(`Built gallery with ${gallery.length} photographs.`);

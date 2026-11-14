import { cp, mkdir, readFile, rm, access, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(import.meta.url);
const repository = path.resolve(path.dirname(script), '..');
const fingerprint = source => createHash('sha256').update(source).digest('hex').slice(0, 16);

export async function buildSite(root = repository, output = path.join(root, 'dist')) {
  const gallery = JSON.parse(await readFile(path.join(root, 'gallery.json'), 'utf8'));
  if (!Array.isArray(gallery) || !gallery.length) throw new Error('Gallery is empty');
  for (const photo of gallery) {
    for (const key of ['src', 'large']) {
      const file = path.resolve(root, photo[key]);
      if (!file.startsWith(root + path.sep)) throw new Error('Invalid image path');
      await access(file);
    }
  }

  const helper = await readFile(path.join(root, 'photo-processing.js'), 'utf8');
  const helperName = `photo-processing-${fingerprint(helper)}.js`;
  const core = await readFile(path.join(root, 'vendor/photoswipe/photoswipe.esm.min.js'), 'utf8');
  const coreName = `photoswipe-${fingerprint(core)}.js`;
  const viewerSource = await readFile(path.join(root, 'viewer.js'), 'utf8');
  const viewer = viewerSource.replace("import('./vendor/photoswipe/photoswipe.esm.min.js')", `import('./${coreName}')`);
  if (viewer === viewerSource) throw new Error('Photo viewer import was not versioned');
  const viewerName = `viewer-${fingerprint(viewer)}.js`;
  const entrySource = await readFile(path.join(root, 'gallery-20260727.js'), 'utf8');
  if (!entrySource.includes("from './photo-processing.js'") || !entrySource.includes("from './viewer.js'")) throw new Error('Gallery module imports are missing');
  const entry = entrySource
    .replace("from './photo-processing.js'", `from './${helperName}'`)
    .replace("from './viewer.js'", `from './${viewerName}'`);
  const entryName = `gallery-${fingerprint(entry)}.js`;
  const style = await readFile(path.join(root, 'vendor/photoswipe/photoswipe.css'), 'utf8') + '\n' + await readFile(path.join(root, 'photography-20260727.css'), 'utf8');
  const styleName = `photography-${fingerprint(style)}.css`;
  const htmlSource = await readFile(path.join(root, 'index.html'), 'utf8');
  if (!htmlSource.includes('href="photography-20260727.css"') || !htmlSource.includes('src="gallery-20260727.js"')) throw new Error('Gallery asset references are missing');
  const html = htmlSource
    .replace('href="photography-20260727.css"', `href="/assets/${styleName}"`)
    .replace('src="gallery-20260727.js"', `src="/assets/${entryName}"`);

  await rm(output, { recursive: true, force: true });
  await mkdir(path.join(output, 'assets'), { recursive: true });
  // Keep the old URLs usable for already-open pages. New HTML uses only the
  // content-addressed URLs, including the processing module imported by JS.
  for (const file of ['gallery-20260727.js', 'photo-processing.js', 'viewer.js', 'vendor/photoswipe', 'gallery.json', 'og.jpg', 'photos', '_headers']) {
    await cp(path.join(root, file), path.join(output, file), { recursive: true });
  }
  await Promise.all([
    writeFile(path.join(output, 'index.html'), html),
    writeFile(path.join(output, 'assets', helperName), helper),
    writeFile(path.join(output, 'assets', coreName), core),
    writeFile(path.join(output, 'assets', viewerName), viewer),
    writeFile(path.join(output, 'assets', entryName), entry),
    writeFile(path.join(output, 'assets', styleName), style),
    writeFile(path.join(output, 'photography-20260727.css'), style),
  ]);
  console.log(`Built gallery with ${gallery.length} photographs and versioned assets.`);
  return { entryName, helperName, viewerName, coreName, styleName };
}

if (process.argv[1] && path.resolve(process.argv[1]) === script) await buildSite();

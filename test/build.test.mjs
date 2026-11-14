import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { buildSite } from '../scripts/build.mjs';

test('changed dependency and CSS receive fresh URLs while identical builds stay stable', async t => {
  const root = await mkdtemp(path.join(tmpdir(), 'photography-build-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, 'photos'));
  const sources = {
    'gallery.json': JSON.stringify([{ src: 'photos/small.webp', large: 'photos/large.webp' }]),
    'photos/small.webp': 'fixture', 'photos/large.webp': 'fixture',
    'photo-processing.js': 'export const order = "old";',
    'gallery-20260727.js': "import { order } from './photo-processing.js'; import { viewer } from './viewer.js'; console.log(order, viewer);",
    'viewer.js': "export const viewer = () => import('./vendor/photoswipe/photoswipe.esm.min.js');",
    'vendor/photoswipe/photoswipe.esm.min.js': 'export default class PhotoSwipe {}',
    'vendor/photoswipe/photoswipe.css': '.pswp { position: fixed; }',
    'photography-20260727.css': 'body { color: black; }',
    'index.html': '<link rel="stylesheet" href="photography-20260727.css"><script src="gallery-20260727.js" type="module"></script>',
    'og.jpg': 'fixture', '_headers': '/assets/*\n  Cache-Control: public, max-age=31536000, immutable',
    'PRIVATE.txt': 'must never be published',
  };
  for (const [file, contents] of Object.entries(sources)) {
    await mkdir(path.dirname(path.join(root, file)), { recursive: true });
    await writeFile(path.join(root, file), contents);
  }
  const first = await buildSite(root);
  const html = await readFile(path.join(root, 'dist/index.html'), 'utf8');
  assert.ok(html.includes(`/assets/${first.entryName}`));
  assert.ok(html.includes(`/assets/${first.styleName}`));
  const entry = await readFile(path.join(root, 'dist/assets', first.entryName), 'utf8');
  assert.ok(entry.includes(`from './${first.helperName}'`));
  assert.ok(!entry.includes("from './photo-processing.js'"));
  assert.ok(entry.includes(`from './${first.viewerName}'`));
  const viewer = await readFile(path.join(root, 'dist/assets', first.viewerName), 'utf8');
  assert.ok(viewer.includes(`import('./${first.coreName}')`));
  assert.ok(!viewer.includes("import('./vendor/photoswipe/"));
  assert.ok((await readFile(path.join(root, 'dist/assets', first.styleName), 'utf8')).includes('.pswp'));
  assert.ok(!(await readdir(path.join(root, 'dist'))).includes('PRIVATE.txt'));
  assert.deepEqual(await buildSite(root), first, 'Unchanged sources must keep reusable cache URLs.');
  await writeFile(path.join(root, 'photo-processing.js'), 'export const order = "new";');
  const second = await buildSite(root);
  assert.notEqual(second.helperName, first.helperName);
  assert.notEqual(second.entryName, first.entryName, 'Changing a dependency must also change the entry URL.');
  assert.equal(second.styleName, first.styleName);
  await writeFile(path.join(root, 'photography-20260727.css'), 'body { color: green; }');
  const third = await buildSite(root);
  assert.notEqual(third.styleName, second.styleName);
  assert.equal(third.entryName, second.entryName);
  const finalHtml = await readFile(path.join(root, 'dist/index.html'), 'utf8');
  assert.ok(finalHtml.includes(`/assets/${third.entryName}`));
  assert.ok(finalHtml.includes(`/assets/${third.styleName}`));
  assert.ok(!finalHtml.includes(first.entryName));
  assert.ok(!finalHtml.includes(first.styleName));
  await writeFile(path.join(root, 'gallery-20260727.js'), sources['gallery-20260727.js'] + '\n// Updated swipe controls');
  const fourth = await buildSite(root);
  assert.notEqual(fourth.entryName, third.entryName);
  assert.equal(fourth.helperName, third.helperName);
  assert.equal(fourth.styleName, third.styleName);
  await writeFile(path.join(root, 'vendor/photoswipe/photoswipe.esm.min.js'), 'export default class UpdatedPhotoSwipe {}');
  const fifth = await buildSite(root);
  assert.notEqual(fifth.coreName, fourth.coreName);
  assert.notEqual(fifth.viewerName, fourth.viewerName);
  assert.notEqual(fifth.entryName, fourth.entryName);
  assert.equal(fifth.helperName, fourth.helperName);
  assert.equal(fifth.styleName, fourth.styleName);
});

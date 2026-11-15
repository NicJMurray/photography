import test from 'node:test';
import assert from 'node:assert/strict';
import { viewerItems } from '../viewer.js';

test('viewer geometry uses the actual published WebP dimensions without enlarging small sources', () => {
  const photos = [
    { id: 'landscape', width: 6240, height: 4160, src: '/landscape-960.webp', large: '/landscape-1920.webp', alt: 'Landscape' },
    { id: 'portrait', width: 4160, height: 6240, src: '/portrait-960.webp', large: '/portrait-1920.webp', title: 'Portrait' },
    { id: 'small', width: 800, height: 600, src: '/small-960.webp', large: '/small-1920.webp' },
  ];
  const original = structuredClone(photos);
  const items = viewerItems(photos);
  assert.deepEqual(items.map(({ width, height }) => [width, height]), [[1920, 1280], [1920, 2880], [800, 600]]);
  assert.deepEqual(items.map(({ alt }) => alt), ['Landscape', 'Portrait', 'Photograph']);
  assert.equal(items[0].src, '/landscape-1920.webp');
  assert.equal(items[0].msrc, '/landscape-960.webp');
  assert.equal(items[0].photoId, 'landscape');
  assert.deepEqual(photos, original);
});

test('high-quality photographs offer responsive sources and retain medium fallback', () => {
  const [landscape, portrait, small] = viewerItems([
    { id: 'landscape', width: 6240, height: 4160, src: '/small.webp', large: '/medium.webp', high: '/high.webp', highWidth: 3840, highHeight: 2560 },
    { id: 'portrait', width: 4160, height: 6240, src: '/p-small.webp', large: '/p-medium.webp', high: '/p-high.webp', highWidth: 3840, highHeight: 5760 },
    { id: 'small', width: 800, height: 600, src: '/s-small.webp', large: '/s-medium.webp', high: '/s-high.webp', highWidth: 800, highHeight: 600 },
  ]);
  assert.deepEqual([landscape.width, landscape.height], [3840, 2560]);
  assert.equal(landscape.src, '/medium.webp');
  assert.equal(landscape.msrc, '/small.webp');
  assert.equal(landscape.srcset, '/small.webp 960w, /medium.webp 1920w, /high.webp 3840w');
  assert.deepEqual([portrait.width, portrait.height], [3840, 5760]);
  assert.equal(small.srcset, '/s-high.webp 800w', 'Small sources must not create duplicate srcset widths.');
});

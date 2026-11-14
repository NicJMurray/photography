import test from 'node:test';
import assert from 'node:assert/strict';
import { readExifDate, readJPEGMetadata, dateFromFilename, sortPhotos, stripWebPMetadata, processJPEG } from '../photo-processing.js';

function jpeg({ date = '2026:07:25 14:23:01', offset = '+01:00', little = true, width = 6240, height = 4160 } = {}) {
  const tiff = new Uint8Array(120);
  const view = new DataView(tiff.buffer);
  view.setUint16(0, little ? 0x4949 : 0x4d4d);
  const u16 = (at, value) => view.setUint16(at, value, little);
  const u32 = (at, value) => view.setUint32(at, value, little);
  u16(2, 42); u32(4, 8);
  u16(8, 1); u16(10, 0x8769); u16(12, 4); u32(14, 1); u32(18, 26);
  u16(26, 2);
  u16(28, 0x9003); u16(30, 2); u32(32, 20); u32(36, 56);
  u16(40, 0x9011); u16(42, 2); u32(44, 7); u32(48, 76);
  tiff.set(new TextEncoder().encode(date), 56);
  tiff.set(new TextEncoder().encode(offset), 76);
  const app = [0xff, 0xe1, 0, 128, 0x45, 0x78, 0x69, 0x66, 0, 0, ...tiff];
  const sof = [0xff, 0xc0, 0, 11, 8, height >> 8, height & 255, width >> 8, width & 255, 1, 1, 0x11, 0];
  return new Uint8Array([0xff, 0xd8, ...app, ...sof, 0xff, 0xd9]).buffer;
}

function webp(chunks) {
  const body = chunks.flatMap(([type, bytes]) => [...new TextEncoder().encode(type), bytes.length & 255, (bytes.length >> 8) & 255, (bytes.length >> 16) & 255, (bytes.length >> 24) & 255, ...bytes, ...(bytes.length % 2 ? [0] : [])]);
  const size = body.length + 4;
  return new Blob([new Uint8Array([82, 73, 70, 70, size & 255, (size >> 8) & 255, (size >> 16) & 255, (size >> 24) & 255, 87, 69, 66, 80, ...body])], { type: 'image/webp' });
}

test('reads capture date and explicit timezone from little and big endian EXIF', () => {
  for (const little of [true, false]) {
    assert.equal(readExifDate(jpeg({ little })), '2026-07-25T13:23:01.000Z');
    assert.deepEqual(readJPEGMetadata(jpeg({ little })), { capturedAt: '2026-07-25T13:23:01.000Z', width: 6240, height: 4160 });
  }
});

test('rejects impossible EXIF dates and tolerates broken offsets and truncated segments', () => {
  assert.equal(readExifDate(jpeg({ date: '2026:02:30 14:23:01' })), null);
  const broken = jpeg();
  new DataView(broken).setUint32(14, 0xffffffff, true);
  assert.equal(readExifDate(broken), null);
  for (let length = 0; length < 140; length++) assert.doesNotThrow(() => readExifDate(jpeg().slice(0, length)));
  assert.throws(() => readJPEGMetadata(new Uint8Array([0x89, 0x50, 0x4e, 0x47]).buffer), /JPEG/);
});

test('uses only real filename timestamps, never camera sequence numbers or modified time', () => {
  assert.equal(dateFromFilename('IMG_20260725_142301.jpg'), '2026-07-25T14:23:01.000Z');
  assert.equal(dateFromFilename('2026-07-25 14-23-01.jpg'), '2026-07-25T14:23:01.000Z');
  assert.equal(dateFromFilename('trip-2026-07-25.jpg'), '2026-07-25T00:00:00.000Z');
  assert.equal(dateFromFilename('DSCF0907.jpg'), null);
  assert.equal(dateFromFilename('IMG_20260230.jpg'), null);
  assert.equal(dateFromFilename('IMG_20261325.jpg'), null);
});

test('sorts mixed dated uploads newest first and undated originals by descending natural filename', () => {
  const photos = [
    { id: 'seed-2', file: 'DSCF2.jpg' },
    { id: 'upload-old', file: 'DSCF9999.jpg', capturedAt: '2026-07-01T00:00:00Z' },
    { id: 'seed-10', file: 'DSCF10.jpg' },
    { id: 'upload-new', file: 'DSCF1.jpg', capturedAt: '2026-08-01T00:00:00Z' },
  ];
  const snapshot = structuredClone(photos);
  const expected = ['upload-new', 'upload-old', 'seed-10', 'seed-2'];
  // Every permutation must produce the same result, including the formerly
  // problematic date/filename mixtures that can create comparator cycles.
  function permutations(items) {
    return items.length ? items.flatMap((item, index) => permutations(items.filter((_, at) => at !== index)).map((rest) => [item, ...rest])) : [[]];
  }
  for (const input of permutations(photos)) assert.deepEqual(sortPhotos(input).map((photo) => photo.id), expected);
  assert.deepEqual(photos, snapshot);
  assert.deepEqual(sortPhotos([]), []);
});

test('uses creation time only for unknown-date upload rows and preserves unknown capture metadata', () => {
  const photos = [
    { id: 'original', file: 'DSCF10.jpg', capturedAt: null, createdAt: '2026-12-01T00:00:00Z' },
    { id: 'upload-new', file: 'DSCF2.jpg', capturedAt: '2026-08-01T00:00:00Z', createdAt: '2026-01-01T00:00:00Z' },
    { id: 'upload-unknown', file: 'DSCF3.jpg', capturedAt: null, createdAt: '2026-07-01T00:00:00Z' },
    { id: 'upload-invalid', file: 'DSCF4.jpg', capturedAt: 'invalid date', createdAt: '2026-06-01T00:00:00Z' },
    { id: 'upload-no-date', file: 'DSCF5.jpg', capturedAt: 12345, createdAt: 'invalid date' },
    { id: 'upload-old', file: 'DSCF6.jpg', capturedAt: '2026-05-01T00:00:00Z', createdAt: '2026-12-01T00:00:00Z' },
  ];
  assert.deepEqual(sortPhotos(photos).map((photo) => photo.id), ['upload-new', 'upload-unknown', 'upload-invalid', 'upload-old', 'original', 'upload-no-date']);
  assert.equal(photos[2].capturedAt, null);
  assert.equal(photos[3].capturedAt, 'invalid date');
});

test('breaks equal timestamp and filename ties deterministically without inferring capture dates from filenames', () => {
  const capturedAt = '2026-07-01T00:00:00Z';
  const photos = [
    { id: 'upload-a', file: 'DSCF2.jpg', capturedAt },
    { id: 'upload-b', file: 'DSCF2.jpg', capturedAt },
    { id: 'upload-c', file: 'DSCF10.jpg', capturedAt },
    { id: 'seed-date', file: '20991231.jpg' },
  ];
  assert.deepEqual(sortPhotos(photos).map((photo) => photo.id), ['upload-c', 'upload-b', 'upload-a', 'seed-date']);
  assert.deepEqual(sortPhotos([...photos].reverse()).map((photo) => photo.id), ['upload-c', 'upload-b', 'upload-a', 'seed-date']);
});

test('strips EXIF, XMP and colour metadata chunks and clears their WebP flags', async () => {
  const source = webp([['VP8X', [0x2c, 0, 0, 0, 0, 0, 0, 0, 0, 0]], ['ICCP', [1, 2]], ['EXIF', [...new TextEncoder().encode('GPS longitude secret')]], ['XMP ', [3]], ['VP8 ', [1, 2, 3, 4]]]);
  const clean = new Uint8Array(await (await stripWebPMetadata(source)).arrayBuffer());
  assert.equal(new DataView(clean.buffer).getUint32(4, true), clean.length - 8);
  const text = new TextDecoder().decode(clean);
  assert.equal(text.includes('GPS'), false);
  assert.equal(text.includes('EXIF'), false);
  assert.equal(text.includes('XMP '), false);
  assert.equal(text.includes('ICCP'), false);
  assert.equal(clean[20], 0);
  assert.equal(text.includes('VP8 '), true);
});

test('rejects unsupported canvas output and malformed WebP chunks', async () => {
  await assert.rejects(stripWebPMetadata(new Blob(['PNG fallback'], { type: 'image/png' })), /browser/);
  const broken = new Uint8Array(await webp([['VP8 ', [1, 2]]]).arrayBuffer());
  new DataView(broken.buffer).setUint32(16, 100, true);
  await assert.rejects(stripWebPMetadata(new Blob([broken])), /incomplete/);
});

test('rejects oversized and non-JPEG uploads before decoding', async () => {
  await assert.rejects(processJPEG({ size: 41 * 1024 * 1024 }), /40 MB/);
  await assert.rejects(processJPEG({ size: 4, arrayBuffer: async () => new Uint8Array([1, 2, 3, 4]).buffer }), /JPEG/);
  await assert.rejects(processJPEG({ size: 150, arrayBuffer: async () => jpeg({ width: 20000, height: 20000 }) }), /80 megapixels/);
});

test('creates two aspect-preserving WebPs, retries size, and closes the decoded image', async () => {
  const original = { document: globalThis.document, createImageBitmap: globalThis.createImageBitmap };
  const rendered = [];
  let closed = false;
  globalThis.createImageBitmap = async () => ({ width: 6240, height: 4160, close() { closed = true; } });
  globalThis.document = { createElement() {
    return {
      width: 0, height: 0,
      getContext() { return { drawImage() {} }; },
      toBlob(callback, type, quality) {
        rendered.push({ width: this.width, height: this.height, quality, type });
        callback(webp([['VP8 ', quality === 0.84 ? new Array(2 * 1024 * 1024).fill(1) : [1, 2, 3, 4]]]));
      },
    };
  } };
  try {
    const result = await processJPEG({ name: 'photo.jpg', size: 150, arrayBuffer: async () => jpeg() });
    assert.equal(result.file, 'photo.jpg');
    assert.equal(result.dateSource, 'exif');
    assert.equal(result.capturedAt, '2026-07-25T13:23:01.000Z');
    assert.equal(result.width, 6240);
    assert.equal(result.height, 4160);
    assert.deepEqual(rendered.map(({ width, height, quality }) => ({ width, height, quality })), [
      { width: 960, height: 640, quality: 0.84 }, { width: 960, height: 640, quality: 0.74 },
      { width: 1920, height: 1280, quality: 0.84 }, { width: 1920, height: 1280, quality: 0.74 },
    ]);
    assert.equal(result.small.type, 'image/webp');
    assert.ok(result.large.size <= 2 * 1024 * 1024);
    assert.equal(closed, true);
  } finally {
    for (const [name, value] of Object.entries(original)) {
      if (value === undefined) delete globalThis[name]; else globalThis[name] = value;
    }
  }
});

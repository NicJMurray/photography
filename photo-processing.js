// JPEGs stay on this device. Only re-encoded, metadata-free WebP files are uploaded.
const MAX_FILE_BYTES = 40 * 1024 * 1024;
const MAX_PIXELS = 80_000_000;
const MAX_WEBP_BYTES = 2_000_000;
const naturalOrder = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });

function captureDate(value, offset = '') {
  const match = /^(\d{4})[:-](\d{2})[:-](\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/.exec(value || '');
  if (!match) return null;
  const [, year, month, day, hour, minute, second] = match.map(Number);
  if (year < 1900 || year > 2199 || month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59 || second > 59) return null;
  const date = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  if (date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  if (offset) {
    const zone = /^([+-])(\d{2}):(\d{2})$/.exec(offset);
    if (zone && Number(zone[2]) <= 14 && Number(zone[3]) <= 59 && (Number(zone[2]) !== 14 || Number(zone[3]) === 0)) {
      const minutes = (Number(zone[2]) * 60 + Number(zone[3])) * (zone[1] === '+' ? 1 : -1);
      date.setUTCMinutes(date.getUTCMinutes() - minutes);
    }
  }
  return date.toISOString();
}

function readExif(view, start, end) {
  // The offsets in a TIFF directory are relative to the TIFF header, not the JPEG.
  const has = (offset, bytes) => Number.isInteger(offset) && offset >= start && offset + bytes <= end;
  if (!has(start, 8)) return null;
  const order = view.getUint16(start);
  if (order !== 0x4949 && order !== 0x4d4d) return null;
  const little = order === 0x4949;
  const u16 = (offset) => view.getUint16(offset, little);
  const u32 = (offset) => view.getUint32(offset, little);
  if (u16(start + 2) !== 42) return null;

  function directory(offset) {
    if (!has(offset, 2)) return new Map();
    const count = u16(offset);
    if (count > 512 || !has(offset + 2, count * 12)) return new Map();
    const fields = new Map();
    for (let index = 0; index < count; index++) {
      const entry = offset + 2 + index * 12;
      const tag = u16(entry);
      const type = u16(entry + 2);
      const length = u32(entry + 4);
      if (type === 4 && length === 1) fields.set(tag, u32(entry + 8));
      if (type === 2 && length > 0 && length <= 64) {
        const data = length <= 4 ? entry + 8 : start + u32(entry + 8);
        if (!has(data, length)) continue;
        let value = '';
        for (let char = 0; char < length && view.getUint8(data + char); char++) value += String.fromCharCode(view.getUint8(data + char));
        fields.set(tag, value.trim());
      }
    }
    return fields;
  }

  const main = directory(start + u32(start + 4));
  const exifOffset = main.get(0x8769);
  const details = typeof exifOffset === 'number' ? directory(start + exifOffset) : new Map();
  return captureDate(details.get(0x9003), details.get(0x9011))
    || captureDate(details.get(0x9004), details.get(0x9012))
    || captureDate(main.get(0x0132), details.get(0x9010));
}

export function readJPEGMetadata(buffer) {
  const view = new DataView(buffer);
  if (view.byteLength < 4 || view.getUint16(0) !== 0xffd8) throw new Error('Choose a JPEG photograph.');
  let capturedAt = null;
  let width = 0;
  let height = 0;
  let offset = 2;
  while (offset + 1 < view.byteLength) {
    if (view.getUint8(offset++) !== 0xff) break;
    while (offset < view.byteLength && view.getUint8(offset) === 0xff) offset++;
    if (offset >= view.byteLength) break;
    const marker = view.getUint8(offset++);
    if (marker === 0xda || marker === 0xd9) break;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 2 > view.byteLength) break;
    const length = view.getUint16(offset);
    const end = offset + length;
    if (length < 2 || end > view.byteLength) break;
    if (marker === 0xe1 && length >= 8 && view.getUint32(offset + 2) === 0x45786966 && view.getUint16(offset + 6) === 0) {
      capturedAt ||= readExif(view, offset + 8, end);
    }
    if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker) && length >= 8) {
      height = view.getUint16(offset + 3);
      width = view.getUint16(offset + 5);
    }
    offset = end;
  }
  return { capturedAt, width, height };
}

export function readExifDate(buffer) {
  try { return readJPEGMetadata(buffer).capturedAt; } catch { return null; }
}

export function dateFromFilename(name) {
  const match = /(?:^|[^0-9])((?:19|20|21)\d{2})[-_]?([01]\d)[-_]?([0-3]\d)(?:[T _-]?([0-2]\d)[-_:]?([0-5]\d)[-_:]?([0-5]\d))?(?!\d)/.exec(name || '');
  if (!match) return null;
  const [, year, month, day, hour = '00', minute = '00', second = '00'] = match;
  return captureDate(`${year}:${month}:${day} ${hour}:${minute}:${second}`);
}

function compareFilenamesDescending(a, b) {
  const filenames = naturalOrder.compare(b.file || b.id || '', a.file || a.id || '');
  if (filenames) return filenames;
  const aId = String(a.id || '');
  const bId = String(b.id || '');
  return aId < bId ? 1 : aId > bId ? -1 : 0;
}

function orderingTime(photo) {
  const timestamp = (value) => typeof value === 'string' && value.trim() && Number.isFinite(Date.parse(value)) ? Date.parse(value) : null;
  const capturedAt = timestamp(photo.capturedAt);
  if (capturedAt !== null) return capturedAt;
  // Upload time helps place an upload with no capture date. It never becomes
  // capture metadata, and it must not give the original static photos a date.
  return typeof photo.id === 'string' && photo.id.startsWith('upload-') ? timestamp(photo.createdAt) : null;
}

export function sortPhotos(photos) {
  // Known dates sort newest first; undated originals follow in descending
  // camera filename order. Fixed groups make mixed-date ordering transitive.
  return photos.map((photo) => ({ photo, time: orderingTime(photo) })).sort((a, b) => {
    if ((a.time === null) !== (b.time === null)) return a.time === null ? 1 : -1;
    return (a.time !== null ? b.time - a.time : 0) || compareFilenamesDescending(a.photo, b.photo);
  }).map(({ photo }) => photo);
}

export async function stripWebPMetadata(blob) {
  const source = new Uint8Array(await blob.arrayBuffer());
  const view = new DataView(source.buffer);
  const text = (offset) => String.fromCharCode(...source.subarray(offset, offset + 4));
  if (source.length < 12 || text(0) !== 'RIFF' || text(8) !== 'WEBP' || view.getUint32(4, true) + 8 !== source.length) {
    throw new Error('This browser could not create WebP images. Try a current browser.');
  }
  const chunks = [];
  let imageFound = false;
  for (let offset = 12; offset < source.length;) {
    if (offset + 8 > source.length) throw new Error('The converted image is incomplete. Please try again.');
    const type = text(offset);
    const length = view.getUint32(offset + 4, true);
    const end = offset + 8 + length + (length % 2);
    if (end > source.length) throw new Error('The converted image is incomplete. Please try again.');
    if (type === 'VP8 ' || type === 'VP8L') imageFound = true;
    if (!['EXIF', 'XMP ', 'ICCP'].includes(type)) {
      const chunk = source.slice(offset, end);
      if (type === 'VP8X' && length >= 1) chunk[8] &= ~0x2c;
      chunks.push(chunk);
    }
    offset = end;
  }
  if (!imageFound) throw new Error('The converted image is incomplete. Please try again.');
  const total = 12 + chunks.reduce((size, chunk) => size + chunk.length, 0);
  const header = source.slice(0, 12);
  new DataView(header.buffer).setUint32(4, total - 8, true);
  return new Blob([header, ...chunks], { type: 'image/webp' });
}

async function decodeJPEG(file) {
  if (typeof createImageBitmap === 'function') {
    try { return await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch { /* Try the standard image decoder. */ }
  }
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    return image;
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function encodeWebP(image, target) {
  const sourceWidth = image.naturalWidth || image.width;
  const sourceHeight = image.naturalHeight || image.height;
  const canvas = document.createElement('canvas');
  canvas.width = Math.min(target, sourceWidth);
  canvas.height = Math.max(1, Math.round(sourceHeight * canvas.width / sourceWidth));
  const context = canvas.getContext('2d');
  if (!context) throw new Error('This browser could not prepare the photograph.');
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  try {
    for (const quality of [0.84, 0.74, 0.64, 0.5]) {
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/webp', quality));
      if (!blob) throw new Error('This browser could not create WebP images.');
      const clean = await stripWebPMetadata(blob);
      if (clean.size <= MAX_WEBP_BYTES) return clean;
    }
    throw new Error('This photograph is too detailed to upload at this size. Try a less detailed JPEG.');
  } finally {
    canvas.width = canvas.height = 1;
  }
}

export async function processJPEG(file) {
  if (!file.size || file.size > MAX_FILE_BYTES) throw new Error('Choose JPEGs smaller than 40 MB each.');
  const metadata = readJPEGMetadata(await file.arrayBuffer());
  if (!metadata.width || !metadata.height || metadata.width * metadata.height > MAX_PIXELS) {
    throw new Error('Choose a JPEG photograph smaller than 80 megapixels.');
  }
  let image;
  try {
    image = await decodeJPEG(file);
  } catch {
    throw new Error('This JPEG could not be opened. Try exporting it again.');
  }
  try {
    const width = image.naturalWidth || image.width;
    const height = image.naturalHeight || image.height;
    if (!width || !height || width * height > MAX_PIXELS) throw new Error('Choose a JPEG photograph smaller than 80 megapixels.');
    const small = await encodeWebP(image, 960);
    const large = await encodeWebP(image, 1920);
    const filenameDate = dateFromFilename(file.name);
    return { small, large, file: file.name, capturedAt: metadata.capturedAt || filenameDate, dateSource: metadata.capturedAt ? 'exif' : filenameDate ? 'filename' : null, width, height };
  } finally {
    image.close?.();
  }
}

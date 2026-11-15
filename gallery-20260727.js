import { processJPEG, sortPhotos, planReplacements } from './photo-processing.js';
import { createPhotoViewer } from './viewer.js';

const API = 'https://recipes.njmurray.com';
const galleryElement = document.querySelector('#gallery');
const viewerStatus = document.querySelector('#viewer-status');
const editor = document.querySelector('#photo-editor');
const uploadButton = document.querySelector('#upload-photos');
const replaceButton = document.querySelector('#replace-photos');
const editButton = document.querySelector('#edit-photos');
const fileInput = document.querySelector('#photo-files');
const replaceInput = document.querySelector('#replace-files');
const statusElement = document.querySelector('#photo-status');
const orderElement = document.querySelector('#photo-order');
const queueElement = document.querySelector('#photo-queue');
const previewURLs = new Set();
const galleryCards = new Map();
let seeds = [];
let uploaded = [];
let replacements = new Map();
let hidden = new Set();
let photos = [];
let galleryLoaded = false;
let galleryLoadFailed = false;
let authenticated = false;
let editing = false;
let busy = false;
let storageAvailable = false;
let galleryAvailable = false;
let admin;
let request;
let imageSequence = 0;
const photoViewer = createPhotoViewer({ getPhotos: () => photos });

document.querySelector('#year').textContent = new Date().getFullYear();

function setStatus(message, error = false) {
  statusElement.textContent = message;
  statusElement.toggleAttribute('data-error', error);
}

function updateControls() {
  editor.hidden = !authenticated;
  uploadButton.disabled = busy || !storageAvailable || !galleryAvailable;
  replaceButton.disabled = busy || !storageAvailable || !galleryAvailable;
  editButton.disabled = busy || !galleryAvailable;
  editButton.textContent = editing ? 'Done' : 'Remove photos';
  editButton.setAttribute('aria-pressed', String(editing));
}

function assignPhotoImage(image, photo, responsive = false) {
  const token = String(++imageSequence);
  image.dataset.retryToken = token;
  let attempts = 0;
  const apply = () => {
    const suffix = attempts ? `?retry=${attempts}` : '';
    if (responsive) {
      const smallWidth = Math.min(960, photo.width);
      const largeWidth = Math.min(1920, photo.width);
      image.srcset = smallWidth === largeWidth
        ? `${photo.large}${suffix} ${largeWidth}w`
        : `${photo.src}${suffix} ${smallWidth}w, ${photo.large}${suffix} ${largeWidth}w`;
    }
    image.src = (responsive ? photo.src : photo.large) + suffix;
  };
  image.onerror = photo.src.startsWith(`${API}/media/photography/`) ? () => {
    if (attempts >= 3) return;
    const delay = [2000, 5000, 10000][attempts++];
    window.setTimeout(() => {
      if (image.isConnected && image.dataset.retryToken === token) apply();
    }, delay);
  } : null;
  apply();
}

async function openLightbox(index, trigger) {
  viewerStatus.hidden = true;
  try {
    await photoViewer.open(index, trigger);
  } catch {
    viewerStatus.textContent = 'The photo viewer could not open. Please try again.';
    viewerStatus.hidden = false;
  }
}

function buildGallery() {
  if (!galleryLoaded || galleryLoadFailed) return;
  const originals = seeds.map(photo => mergeReplacement(photo, replacements.get(photo.id)));
  photos = sortPhotos([...originals, ...uploaded].filter((photo) => !hidden.has(photo.id)));
  orderElement.textContent = 'Newest first.';
  const visibleIds = new Set(photos.map((photo) => photo.id));
  for (const [id, card] of galleryCards) {
    if (!visibleIds.has(id)) {
      card.figure.remove();
      galleryCards.delete(id);
    }
  }
  galleryElement.querySelector('.gallery__loading')?.remove();

  photos.forEach((photo, index) => {
    let card = galleryCards.get(photo.id);
    if (!card) {
      const figure = document.createElement('figure');
      figure.className = 'gallery-item';
      const button = document.createElement('button');
      button.type = 'button';
      const image = document.createElement('img');
      image.sizes = '(max-width: 600px) 100vw, (max-width: 940px) 50vw, 33vw';
      image.loading = index === 0 ? 'eager' : 'lazy';
      image.decoding = 'async';
      button.append(image);
      button.addEventListener('click', () => {
        const currentIndex = photos.findIndex((item) => item.id === photo.id);
        if (currentIndex >= 0) openLightbox(currentIndex, button);
      });
      figure.append(button);
      card = { figure, button, image, imageKey: null };
      galleryCards.set(photo.id, card);
    }
    const { figure, button, image } = card;
    button.setAttribute('aria-label', `View ${photo.title || 'photograph'} fullscreen`);
    image.width = photo.width;
    image.height = photo.height;
    image.alt = photo.alt || photo.title || 'Photograph';
    const imageKey = JSON.stringify([photo.src, photo.large, photo.width, photo.height]);
    if (card.imageKey !== imageKey) {
      card.imageKey = imageKey;
      assignPhotoImage(image, photo, true);
    }

    let remove = figure.querySelector('.photo-remove');
    if (authenticated && editing) {
      if (!remove) {
        remove = document.createElement('button');
        remove.className = 'photo-remove';
        remove.type = 'button';
        remove.textContent = 'Remove';
        remove.addEventListener('click', () => {
          const current = photos.find((item) => item.id === photo.id);
          if (current) removePhoto(current);
        });
        figure.append(remove);
      }
      remove.disabled = busy;
      remove.setAttribute('aria-label', `Remove ${photo.title || photo.file || 'photograph'}`);
    } else remove?.remove();
    // Keep existing image nodes and their decoded pixels when auth or content
    // changes. Move a card only when its chronological position actually changes.
    if (galleryElement.children[index] !== figure) {
      galleryElement.insertBefore(figure, galleryElement.children[index] || null);
    }
  });

  if (!photos.length) {
    const empty = document.createElement('p');
    empty.className = 'gallery__loading';
    empty.textContent = 'No photographs yet.';
    galleryElement.append(empty);
  }

  photoViewer.reconcile();
}

function mergeReplacement(photo, replacement) {
  if (!replacement) return photo;
  const result = { ...photo };
  // A replacement changes pixels, not the photograph's identity or chronology.
  for (const key of ['width', 'height', 'src', 'large', 'high', 'highWidth', 'highHeight', 'revision']) {
    if (replacement[key] !== undefined) result[key] = replacement[key];
  }
  return result;
}

async function loadGallery() {
  const loadSeeds = async () => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 3000);
    try {
      const response = await fetch('gallery.json', { signal: controller.signal });
      if (!response.ok) throw new Error('Could not load the gallery.');
      const result = await response.json();
      if (!Array.isArray(result)) throw new Error('Invalid gallery response.');
      return result;
    } finally {
      window.clearTimeout(timeout);
    }
  };
  const loadPublished = async () => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 3000);
    try {
      const response = await fetch(`${API}/api/shared/gallery`, { cache: 'no-store', signal: controller.signal });
      if (!response.ok) throw new Error('Could not load saved photographs.');
      const result = await response.json();
      if (!Array.isArray(result.photos) || !Array.isArray(result.hidden) || (result.replacements !== undefined && !Array.isArray(result.replacements))) throw new Error('Invalid gallery response.');
      return result;
    } finally {
      window.clearTimeout(timeout);
    }
  };
  // Start both reads together and present one combined collection, instead of
  // painting seeds, saved photos and the session as three separate galleries.
  const [originals, published] = await Promise.allSettled([loadSeeds(), loadPublished()]);
  if (originals.status === 'fulfilled') seeds = originals.value;
  if (published.status === 'fulfilled') {
    const result = published.value;
    uploaded = result.photos;
    replacements = new Map((result.replacements || []).map(photo => [photo.id, photo]));
    hidden = new Set(result.hidden);
    storageAvailable = result.available === true;
    galleryAvailable = true;
  }
  galleryLoaded = true;
  galleryLoadFailed = originals.status === 'rejected' && published.status === 'rejected';
  if (galleryLoadFailed) {
    galleryElement.querySelector('.gallery__loading').textContent = 'The photographs could not be loaded. Please try refreshing the page.';
  } else buildGallery();
  updateControls();
  if (authenticated && !galleryAvailable) setStatus('Saved photographs could not be loaded. Refresh the page before editing.', true);
  else if (authenticated && !storageAvailable) setStatus('Photo uploads are not available yet.', true);
}

async function removePhoto(photo) {
  if (busy || !authenticated || !request) return;
  if (!window.confirm(`Remove “${photo.title || photo.file || 'this photograph'}” from the gallery?`)) return;
  busy = true;
  updateControls();
  buildGallery();
  try {
    await request(`/api/shared/gallery/${encodeURIComponent(photo.id)}`, { method: 'DELETE' });
    hidden.add(photo.id);
    uploaded = uploaded.filter((item) => item.id !== photo.id);
    setStatus('Photograph removed.');
  } catch (error) {
    setStatus(error.message || 'The photograph could not be removed. Please try again.', true);
    if (error.status === 401) await admin.refresh();
  } finally {
    busy = false;
    updateControls();
    buildGallery();
  }
}

async function uploadPhotos(files, mode = 'upload') {
  if (busy || !authenticated || !request || !files.length) return;
  if (!galleryAvailable || !storageAvailable) {
    setStatus('Photo uploads are not available yet.', true);
    return;
  }
  const replacing = mode === 'replace';
  if (!replacing && files.length > 50) {
    setStatus('Please select up to 50 JPEGs at a time.', true);
    return;
  }
  let jobs = files.map(file => ({ file, target: null }));
  let skipped = 0;
  let ambiguous = 0;
  if (replacing) {
    const plan = planReplacements(files, photos);
    jobs = plan.matches;
    skipped = plan.skipped.length;
    ambiguous = plan.skipped.filter(item => item.reason === 'ambiguous').length;
  }
  previewURLs.forEach(url => URL.revokeObjectURL(url));
  previewURLs.clear();
  queueElement.replaceChildren();
  queueElement.hidden = jobs.length === 0;
  const skippedSummary = () => skipped ? `${skipped} ${skipped === 1 ? 'file' : 'files'} skipped.${ambiguous ? ` ${ambiguous} had duplicate filenames.` : ''}` : '';
  if (!jobs.length) {
    replaceInput.value = '';
    setStatus(`0 photographs replaced. ${skippedSummary()}`.trim());
    return;
  }
  busy = true;
  updateControls();
  buildGallery();
  let published = 0;
  let replaced = 0;
  let alreadyPresent = 0;
  const failures = [];
  const queue = jobs.map(({ file }) => {
    const item = document.createElement('li');
    const name = document.createElement('strong');
    name.textContent = file.name;
    const image = document.createElement('img');
    image.alt = `Preview of ${file.name}`;
    image.loading = 'lazy';
    image.decoding = 'async';
    image.hidden = true;
    const status = document.createElement('span');
    status.textContent = 'Waiting';
    item.append(image, name, status);
    return { item, image, status };
  });
  queueElement.replaceChildren(...queue.map(entry => entry.item));
  for (const [index, { file, target }] of jobs.entries()) {
    const preview = queue[index];
    let originalPreview;
    try {
      preview.status.textContent = 'Preparing…';
      originalPreview = URL.createObjectURL(file);
      preview.image.src = originalPreview;
      preview.image.hidden = false;
      setStatus(`Preparing ${index + 1} of ${jobs.length}: ${file.name}${skipped ? ` (${skipped} skipped)` : ''}`);
      const processed = await processJPEG(file);
      const thumbnail = URL.createObjectURL(processed.small);
      previewURLs.add(thumbnail);
      preview.image.src = thumbnail;
      preview.status.textContent = replacing ? 'Replacing…' : 'Uploading…';
      const form = new FormData();
      form.append('small', processed.small, '960.webp');
      form.append('large', processed.large, '1920.webp');
      form.append('high', processed.high, '3840.webp');
      form.append('metadata', JSON.stringify({
        file: processed.file,
        capturedAt: processed.capturedAt,
        width: processed.width,
        height: processed.height,
        ...(replacing ? { photoId: target.id, revision: target.revision || 0 } : {}),
      }));
      setStatus(`${replacing ? 'Replacing' : 'Publishing'} ${index + 1} of ${jobs.length}: ${file.name}`);
      const result = await request(replacing ? '/api/shared/gallery/replace' : '/api/shared/gallery', { method: 'POST', body: form });
      if (replacing && result.skipped) {
        skipped += 1;
        if (result.reason === 'ambiguous') ambiguous += 1;
        preview.status.textContent = result.reason === 'ambiguous' ? 'Skipped: more than one matching photograph.' : 'Skipped: no exact filename match.';
        continue;
      }
      if (!result.photo?.id || (replacing && result.photo.id !== target.id)) throw new Error('Upload response was incomplete. Refresh the gallery before retrying.');
      if (replacing) {
        const updated = mergeReplacement(target, result.photo);
        const existing = uploaded.findIndex(photo => photo.id === target.id);
        if (existing >= 0) uploaded[existing] = updated;
        else replacements.set(target.id, updated);
        replaced += 1;
        preview.status.textContent = 'Replaced';
      } else {
        const existing = uploaded.findIndex(photo => photo.id === result.photo.id);
        if (existing >= 0) uploaded[existing] = result.photo;
        else uploaded.push(result.photo);
        hidden.delete(result.photo.id);
        if (result.duplicate) {
          alreadyPresent += 1;
          preview.status.textContent = 'Already in gallery';
        } else {
          published += 1;
          preview.status.textContent = 'Saved';
        }
      }
      buildGallery();
    } catch (error) {
      preview.status.textContent = `Failed: ${error.message || 'Upload failed.'}`;
      failures.push(`${file.name}: ${error.message || 'Upload failed.'}`);
      if (error.status === 401) {
        await admin.refresh();
        failures.push('Please log in again, then select any remaining photographs.');
        queue.slice(index + 1).forEach(entry => { entry.status.textContent = 'Not uploaded — log in and select again.'; });
        break;
      }
    } finally {
      if (originalPreview) {
        if (preview.image.src === originalPreview) {
          preview.image.removeAttribute('src');
          preview.image.hidden = true;
        }
        URL.revokeObjectURL(originalPreview);
      }
    }
  }
  busy = false;
  fileInput.value = '';
  replaceInput.value = '';
  updateControls();
  buildGallery();
  const count = replacing ? replaced : published;
  const summary = `${count} ${count === 1 ? 'photograph' : 'photographs'} ${replacing ? 'replaced' : 'published'}.`;
  const duplicates = alreadyPresent ? `${alreadyPresent} already in the gallery.` : '';
  setStatus([summary, duplicates, skippedSummary(), ...failures].filter(Boolean).join(' '), failures.length > 0);
}

window.addEventListener('pagehide', () => previewURLs.forEach((url) => URL.revokeObjectURL(url)));

async function setupAdmin() {
  try {
    const shared = await import(`${API}/shared-admin.js`);
    request = shared.request;
    admin = shared.mountAdmin({
      container: document.querySelector('#admin-account'),
      onSessionChange(session) {
        authenticated = session.authenticated === true;
        if (!authenticated) editing = false;
        updateControls();
        buildGallery();
        if (authenticated && galleryLoaded && !galleryAvailable) {
          setStatus('Saved photographs could not be loaded. Refresh the page before editing.', true);
        } else if (authenticated && galleryLoaded && !storageAvailable) {
          setStatus('Photo uploads are not available yet.', true);
        }
      },
    });
    await admin.ready;
  } catch (error) {
    // A login service outage must leave the public gallery usable.
    const link = document.createElement('a');
    link.href = `${API}/`;
    link.textContent = 'Log in';
    document.querySelector('#admin-account').replaceChildren(link);
  }
}

uploadButton.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', () => uploadPhotos(Array.from(fileInput.files)));
replaceButton.addEventListener('click', () => replaceInput.click());
replaceInput.addEventListener('change', () => uploadPhotos(Array.from(replaceInput.files), 'replace'));
replaceButton.addEventListener('dragover', event => {
  event.preventDefault();
  if (!replaceButton.disabled) {
    event.dataTransfer.dropEffect = 'copy';
    replaceButton.classList.add('is-drop-target');
  }
});
replaceButton.addEventListener('dragleave', () => replaceButton.classList.remove('is-drop-target'));
replaceButton.addEventListener('drop', event => {
  event.preventDefault();
  replaceButton.classList.remove('is-drop-target');
  if (!replaceButton.disabled) uploadPhotos(Array.from(event.dataTransfer.files), 'replace');
});
editButton.addEventListener('click', () => {
  editing = !editing;
  updateControls();
  buildGallery();
});
await Promise.all([loadGallery(), setupAdmin()]);

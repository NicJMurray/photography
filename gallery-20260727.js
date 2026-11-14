import { processJPEG, sortPhotos } from './photo-processing.js';

const API = 'https://recipes.njmurray.com';
const galleryElement = document.querySelector('#gallery');
const lightbox = document.querySelector('#lightbox');
const lightboxImage = lightbox.querySelector('img');
const closeButton = lightbox.querySelector('.lightbox__close');
const previousButton = lightbox.querySelector('.lightbox__nav--previous');
const nextButton = lightbox.querySelector('.lightbox__nav--next');
const editor = document.querySelector('#photo-editor');
const uploadButton = document.querySelector('#upload-photos');
const editButton = document.querySelector('#edit-photos');
const fileInput = document.querySelector('#photo-files');
const statusElement = document.querySelector('#photo-status');
const orderElement = document.querySelector('#photo-order');
const queueElement = document.querySelector('#photo-queue');
const previewURLs = new Set();
let seeds = [];
let uploaded = [];
let hidden = new Set();
let photos = [];
let activeIndex = 0;
let lastTrigger = null;
let observer;
let authenticated = false;
let editing = false;
let busy = false;
let storageAvailable = false;
let galleryAvailable = false;
let admin;
let request;
let imageSequence = 0;

document.querySelector('#year').textContent = new Date().getFullYear();

function setStatus(message, error = false) {
  statusElement.textContent = message;
  statusElement.toggleAttribute('data-error', error);
}

function updateControls() {
  editor.hidden = !authenticated;
  uploadButton.disabled = busy || !storageAvailable || !galleryAvailable;
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
    image.src = (responsive ? photo.src : photo.large) + suffix;
    if (responsive) {
      const smallWidth = Math.min(960, photo.width);
      const largeWidth = Math.min(1920, photo.width);
      image.srcset = smallWidth === largeWidth
        ? `${photo.large}${suffix} ${largeWidth}w`
        : `${photo.src}${suffix} ${smallWidth}w, ${photo.large}${suffix} ${largeWidth}w`;
    }
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

function updateLightbox(index) {
  if (!photos.length) {
    lightbox.close();
    return;
  }
  activeIndex = (index + photos.length) % photos.length;
  const photo = photos[activeIndex];
  assignPhotoImage(lightboxImage, photo);
  lightboxImage.alt = photo.alt || photo.title || 'Photograph';
}

function openLightbox(index, trigger) {
  lastTrigger = trigger;
  updateLightbox(index);
  lightbox.showModal();
}

function buildGallery() {
  observer?.disconnect();
  const currentPhoto = lightbox.open ? photos[activeIndex]?.id : null;
  photos = sortPhotos([...seeds, ...uploaded].filter((photo) => !hidden.has(photo.id)));
  orderElement.textContent = photos.length && photos.every((photo) => photo.capturedAt)
    ? 'Ordered by capture date.'
    : 'Ordered by filename; capture dates are kept when available.';
  const fragment = document.createDocumentFragment();

  photos.forEach((photo, index) => {
    const figure = document.createElement('figure');
    figure.className = 'gallery-item';
    const button = document.createElement('button');
    button.type = 'button';
    button.setAttribute('aria-label', `View ${photo.title || 'photograph'} fullscreen`);
    const image = document.createElement('img');
    assignPhotoImage(image, photo, true);
    image.sizes = '(max-width: 600px) 100vw, (max-width: 940px) 50vw, 33vw';
    image.width = photo.width;
    image.height = photo.height;
    image.alt = photo.alt || photo.title || 'Photograph';
    image.loading = 'lazy';
    image.decoding = 'async';
    button.append(image);
    button.addEventListener('click', () => openLightbox(index, button));
    figure.append(button);

    if (authenticated && editing) {
      const remove = document.createElement('button');
      remove.className = 'photo-remove';
      remove.type = 'button';
      remove.textContent = 'Remove';
      remove.disabled = busy;
      remove.setAttribute('aria-label', `Remove ${photo.title || photo.file || 'photograph'}`);
      remove.addEventListener('click', () => removePhoto(photo));
      figure.append(remove);
    }
    fragment.append(figure);
  });

  if (!photos.length) {
    const empty = document.createElement('p');
    empty.className = 'gallery__loading';
    empty.textContent = 'No photographs yet.';
    fragment.append(empty);
  }
  galleryElement.replaceChildren(fragment);

  if (currentPhoto) {
    const index = photos.findIndex((photo) => photo.id === currentPhoto);
    if (index < 0) lightbox.close();
    else updateLightbox(index);
  }
  const items = galleryElement.querySelectorAll('.gallery-item');
  if (!('IntersectionObserver' in window)) {
    items.forEach((item) => item.classList.add('is-visible'));
    return;
  }
  observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      }
    });
  }, { rootMargin: '80px 0px', threshold: 0.08 });
  items.forEach((item) => observer.observe(item));
}

async function loadGallery() {
  try {
    const response = await fetch('gallery.json');
    if (!response.ok) throw new Error('Could not load the gallery.');
    seeds = await response.json();
    buildGallery();
  } catch (error) {
    const message = document.createElement('p');
    message.className = 'gallery__loading';
    message.textContent = 'The photographs could not be loaded. Please try refreshing the page.';
    galleryElement.replaceChildren(message);
  }
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(`${API}/api/shared/gallery`, { cache: 'no-store', signal: controller.signal });
    if (!response.ok) throw new Error('Could not load saved photographs.');
    const result = await response.json();
    if (!Array.isArray(result.photos) || !Array.isArray(result.hidden)) {
      throw new Error('Invalid gallery response.');
    }
    uploaded = result.photos;
    hidden = new Set(result.hidden);
    storageAvailable = result.available === true;
    galleryAvailable = true;
    buildGallery();
  } catch (error) {
    galleryAvailable = false;
  } finally {
    window.clearTimeout(timeout);
  }
  updateControls();
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

async function uploadPhotos(files) {
  if (busy || !authenticated || !request || !files.length) return;
  if (files.length > 50) {
    setStatus('Please select up to 50 JPEGs at a time.', true);
    return;
  }
  busy = true;
  updateControls();
  buildGallery();
  let published = 0;
  let alreadyPresent = 0;
  const failures = [];
  previewURLs.forEach((url) => URL.revokeObjectURL(url));
  previewURLs.clear();
  const queue = files.map((file) => {
    const item = document.createElement('li');
    const name = document.createElement('strong');
    name.textContent = file.name;
    const image = document.createElement('img');
    image.alt = `Preview of ${file.name}`;
    image.hidden = true;
    const status = document.createElement('span');
    status.textContent = 'Waiting';
    item.append(image, name, status);
    return { item, image, status };
  });
  queueElement.replaceChildren(...queue.map((entry) => entry.item));
  queueElement.hidden = false;
  for (const [index, file] of files.entries()) {
    const preview = queue[index];
    let originalPreview;
    try {
      preview.status.textContent = 'Preparing…';
      originalPreview = URL.createObjectURL(file);
      preview.image.src = originalPreview;
      preview.image.hidden = false;
      setStatus(`Preparing ${index + 1} of ${files.length}: ${file.name}`);
      const processed = await processJPEG(file);
      const thumbnail = URL.createObjectURL(processed.small);
      previewURLs.add(thumbnail);
      preview.image.src = thumbnail;
      preview.status.textContent = 'Uploading…';
      const form = new FormData();
      form.append('small', processed.small, '960.webp');
      form.append('large', processed.large, '1920.webp');
      form.append('metadata', JSON.stringify({
        file: processed.file,
        capturedAt: processed.capturedAt,
        width: processed.width,
        height: processed.height,
      }));
      setStatus(`Publishing ${index + 1} of ${files.length}: ${file.name}`);
      const result = await request('/api/shared/gallery', { method: 'POST', body: form });
      if (!result.photo?.id) throw new Error('Upload response was incomplete. Refresh the gallery before retrying.');
      const existing = uploaded.findIndex((photo) => photo.id === result.photo.id);
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
      buildGallery();
    } catch (error) {
      preview.status.textContent = `Failed: ${error.message || 'Upload failed.'}`;
      failures.push(`${file.name}: ${error.message || 'Upload failed.'}`);
      if (error.status === 401) {
        await admin.refresh();
        failures.push('Please log in again, then select any remaining photographs.');
        queue.slice(index + 1).forEach((entry) => { entry.status.textContent = 'Not uploaded — log in and select again.'; });
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
  updateControls();
  buildGallery();
  const summary = `${published} ${published === 1 ? 'photograph' : 'photographs'} published.`;
  const duplicates = alreadyPresent ? `${alreadyPresent} already in the gallery.` : '';
  setStatus([summary, duplicates, ...failures].filter(Boolean).join(' '), failures.length > 0);
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
        if (authenticated && !galleryAvailable) {
          setStatus('Saved photographs could not be loaded. Refresh the page before editing.', true);
        } else if (authenticated && !storageAvailable) {
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
editButton.addEventListener('click', () => {
  editing = !editing;
  updateControls();
  buildGallery();
});
closeButton.addEventListener('click', () => lightbox.close());
previousButton.addEventListener('click', () => updateLightbox(activeIndex - 1));
nextButton.addEventListener('click', () => updateLightbox(activeIndex + 1));
lightbox.addEventListener('click', (event) => {
  if (event.target === lightbox || event.target.classList.contains('lightbox__stage')) lightbox.close();
});
lightbox.addEventListener('close', () => {
  lightboxImage.dataset.retryToken = '';
  lightboxImage.removeAttribute('src');
  if (lastTrigger?.isConnected) lastTrigger.focus();
});
lightbox.addEventListener('keydown', (event) => {
  if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
    event.preventDefault();
    updateLightbox(activeIndex + (event.key === 'ArrowLeft' ? -1 : 1));
  }
});

await loadGallery();
setupAdmin();

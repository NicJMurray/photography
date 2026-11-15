// Locally hosted PhotoSwipe owns gestures, momentum and zoom bounds. Load its
// core only when a photograph is opened; browsing the gallery stays lightweight.
let core;
function loadCore() {
  core ||= import('./vendor/photoswipe/photoswipe.esm.min.js').then(module => module.default).catch(error => {
    core = null;
    throw error;
  });
  return core;
}

export function viewerItems(photos) {
  return photos.map(photo => {
    const hasHigh = typeof photo.high === 'string' && Number.isInteger(photo.highWidth) && photo.highWidth > 0;
    const width = hasHigh ? photo.highWidth : Math.min(1920, photo.width);
    const item = {
      photoId: photo.id,
      src: photo.large,
      msrc: photo.src,
      width,
      height: hasHigh && Number.isInteger(photo.highHeight) ? photo.highHeight : Math.max(1, Math.round(photo.height * width / photo.width)),
      alt: photo.alt || photo.title || 'Photograph',
    };
    if (hasHigh) {
      // Browsers pick the smallest source that suits the display/zoom. Preserve
      // the fast 960/1920px files instead of downloading 3840px for every view.
      const sources = new Map([
        [Math.min(960, photo.width), photo.src],
        [Math.min(1920, photo.width), photo.large],
        [width, photo.high],
      ]);
      item.srcset = [...sources].sort(([a], [b]) => a - b).map(([size, url]) => `${url} ${size}w`).join(', ');
    }
    return item;
  });
}

export function createPhotoViewer({ getPhotos }) {
  let instance = null;
  let opening = false;

  async function open(index, trigger) {
    if (opening || instance) return;
    const selected = getPhotos()[index];
    if (!selected) return;
    opening = true;
    trigger?.setAttribute('aria-busy', 'true');
    let closeWatcher;
    let dismissed = false;
    try {
      // Android sends a native close request for its Back gesture. Start
      // listening before the lazy import so Back can dismiss a pending open.
      if (typeof window.CloseWatcher === 'function') {
        closeWatcher = new window.CloseWatcher();
        closeWatcher.addEventListener('close', () => {
          dismissed = true;
          instance?.close();
        });
      }
      const PhotoSwipe = await loadCore();
      if (dismissed) return;
      const photos = getPhotos();
      const currentIndex = photos.findIndex(photo => photo.id === selected.id);
      if (currentIndex < 0) return;
      const viewer = new PhotoSwipe({
        dataSource: viewerItems(photos),
        index: currentIndex,
        mainClass: 'photo-viewer',
        bgOpacity: 1,
        initialZoomLevel: 'fit',
        allowPanToNext: false,
        pinchToClose: false,
        closeOnVerticalDrag: false,
        clickToCloseNonZoomable: false,
        imageClickAction: 'zoom',
        doubleTapAction: 'zoom',
        tapAction: 'toggle-controls',
        wheelToZoom: true,
        showHideAnimationType: 'fade',
        showAnimationDuration: 180,
        hideAnimationDuration: 160,
        zoomAnimationDuration: 240,
        preloaderDelay: 500,
        preload: [1, 2],
        paddingFn: viewport => ({ top: 64, bottom: 24, left: viewport.x < 600 ? 12 : 24, right: viewport.x < 600 ? 12 : 24 }),
        closeTitle: 'Close photograph',
        zoomTitle: 'Zoom in or out',
        arrowPrevTitle: 'Previous photograph',
        arrowNextTitle: 'Next photograph',
        errorMsg: 'This photograph could not be loaded. Please close and try again.',
      });
      instance = viewer;
      viewer.addFilter('srcsetSizesWidth', (width, content) => {
        // Neighbours stay at medium resolution while preloading. The active
        // photo can request its high-resolution file when it becomes useful.
        return content.slide?.isActive ? width : Math.min(width, 1920 / (window.devicePixelRatio || 1));
      });
      document.body.classList.add('photo-viewer-open');
      viewer.on('close', () => closeWatcher?.destroy());
      viewer.on('destroy', () => {
        closeWatcher?.destroy();
        if (instance === viewer) instance = null;
        document.body.classList.remove('photo-viewer-open');
        if (trigger?.isConnected) trigger.focus({ preventScroll: true });
      });
      viewer.on('afterInit', () => {
        viewer.element.setAttribute('aria-label', 'Fullscreen photographs');
        viewer.element.setAttribute('aria-modal', 'true');
      });
      viewer.init();
    } catch (error) {
      instance?.destroy();
      instance = null;
      document.body.classList.remove('photo-viewer-open');
      throw error;
    } finally {
      if (!instance) closeWatcher?.destroy();
      opening = false;
      trigger?.removeAttribute('aria-busy');
    }
  }

  function reconcile() {
    // An auth refresh or a new upload must not reset a zoomed photograph.
    // Keep this viewing session's order until it closes; if its current image
    // is removed from the collection, close rather than showing a stale photo.
    const id = instance?.currSlide?.data.photoId;
    if (id && !getPhotos().some(photo => photo.id === id)) instance.close();
  }

  return { open, reconcile };
}

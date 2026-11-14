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
    const width = Math.min(1920, photo.width);
    return {
      photoId: photo.id,
      src: photo.large,
      msrc: photo.src,
      width,
      height: Math.max(1, Math.round(photo.height * width / photo.width)),
      alt: photo.alt || photo.title || 'Photograph',
    };
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
    try {
      const PhotoSwipe = await loadCore();
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
      document.body.classList.add('photo-viewer-open');
      viewer.on('destroy', () => {
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

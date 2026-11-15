# Photography

Source for [photography.njmurray.com](https://photography.njmurray.com/), a minimal gallery with responsive 960px, 1920px and 3840px WebP images.

## Editing in the browser

Use **Log in** in the top navigation with the same account as recipes, then choose **Upload photos**. Select several JPEGs to publish them in sequence. Each photograph gets a local preview and its own Preparing, Uploading, Saved or Failed status. Successful uploads appear immediately; a failed file does not stop the rest. Selecting the same photograph again does not add another tile.

Only the optimized WebP versions leave your device. The browser applies JPEG orientation, extracts the capture date, and removes EXIF, GPS, XMP and colour-profile metadata from the published files. Originals are not kept. New uploads create 960px and 1920px renditions at WebP quality 84 and a 3840px rendition starting at quality 90. Images keep their aspect ratio and are never enlarged; quality is reduced if necessary to stay below 2 MB for each smaller rendition and 6 MB for the high-resolution file. Each original JPEG must be under 40 MB and 80 megapixels; select up to 50 new uploads at a time.

When logged in, **Replace photos** lets you select a batch or drop files onto the button. Only files with an exact filename match to one visible photograph are processed; case and extension must also match. Unmatched files, ambiguous existing names, and duplicate names in the selected batch are skipped without reading their image bytes or uploading them. There is no 50-file selection limit for replacement, so a folder's contents can be selected together. Replacement changes the image versions while preserving the photograph's identity, caption, capture date and position. It never adds a new gallery entry or restores a removed photograph. **Upload photos** remains the way to add new photographs. Simultaneous replacements use a revision check so a stale tab cannot overwrite a newer version.

The gallery shows the newest photographs first using capture dates from EXIF or recognizable date filenames; an upload without a capture date uses its publication date. The original 21 photographs have no capture dates and follow in descending natural filename order (`DSCF0907.jpg` before `DSCF0881.jpg`). File modification time is never treated as capture time. Fullscreen navigation follows the same order.

Choose **Remove photos**, then **Remove** on an image to remove it from the public gallery. **Done** hides the removal controls. Public visitors can browse the gallery and fullscreen viewer without logging in.

The initial gallery loads as one collection, and existing photographs stay in place when login status or editing controls change. The fullscreen viewer supports pinch or double-tap to zoom and dragging to explore a magnified photograph. Panning stays within that photograph, including at its edges. Zoom back out to resume swipe navigation; the next and previous photographs follow your finger and settle smoothly. Arrow buttons and keyboard navigation also work, and desktop scrolling zooms the image. Escape or Close returns focus to the gallery. Reduced-motion preferences are respected.

The viewer uses the locally hosted, MIT-licensed PhotoSwipe 5.4.4 core, loaded only when a photograph is opened. Adjacent photographs preload for smooth navigation. The core, its integration module and styles receive content-hashed URLs during the build; the viewer makes no runtime CDN requests.

The gallery continues to use only the 960px/1920px renditions. The fullscreen viewer offers the 3840px file through responsive image sources, selecting it when the display or zoom benefits from more detail. Neighbouring photographs preload at no more than 1920px. Existing photographs stay at their previous quality until original JPEGs are supplied through Replace photos.

## Storage and authentication

The existing recipes Pages application provides the shared editor API and authentication. Its secure, HttpOnly cookie stays on the recipes host; requests from the photography and homepage sites use an exact origin allowlist. Passwords, session tokens and GitHub credentials are not stored in this site's source or browser storage.

New WebP renditions are committed to this GitHub repository through the protected backend. Cloudflare's existing Git integration deploys them automatically. Gallery metadata, replacements and removal overrides are stored in the existing recipes D1 database, so uploads appear as soon as the GitHub commit succeeds, with no deployment wait. Replacement versions get unique image URLs so older cached files cannot hide the change. The media endpoint uses the deployed image when available and the immutable GitHub commit while deployment catches up.

GitHub was chosen to reuse the current infrastructure without enabling R2 billing. It is practical for a personal collection of optimized images; repository size and build time grow with the collection, and removed files remain in Git history. R2 is the simpler future storage choice for a large or frequently changing collection: object uploads need no code commit or build, and R2 has no egress fee. That migration can retain the same gallery and editor API.

If the shared API is temporarily unavailable, the original static collection still loads. Saved additions and removal overrides require that API and may be absent during the outage; editing is disabled until it recovers.

## Files and checks

- `index.html`, `photography-20260727.css` — public page and layout.
- `gallery-20260727.js` — gallery, fullscreen viewer and signed-in editing controls.
- `photo-processing.js` — bounded JPEG decoding, date extraction and metadata-free WebP conversion.
- `viewer.js`, `vendor/photoswipe/` — fullscreen zoom, pan and swipe navigation, with the vendored license.
- `gallery.json`, `photo-details.json`, `photos/` — original collection.
- `test/photo-processing.test.mjs` — date, malformed input, metadata removal, ordering and conversion tests.

Run `node --test test/*.test.mjs` and `node scripts/build.mjs`. The build stages only explicit public files into `dist`; it never publishes tests, credentials or repository configuration. It gives the gallery, its imported processing module and stylesheet content-hashed URLs so updates reach existing browsers on a normal refresh. See [DEPLOYMENT.md](DEPLOYMENT.md) for setup and publishing.

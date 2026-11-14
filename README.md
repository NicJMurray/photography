# Photography

Source for [photography.njmurray.com](https://photography.njmurray.com/), a minimal gallery with responsive 960px and 1920px WebP images.

## Editing in the browser

Use **Log in** in the top navigation with the same account as recipes, then choose **Upload photos**. Select several JPEGs to publish them in sequence. Each photograph gets a local preview and its own Preparing, Uploading, Saved or Failed status. Successful uploads appear immediately; a failed file does not stop the rest. Selecting the same photograph again does not add another tile.

Only the optimized WebP versions leave your device. The browser applies JPEG orientation, extracts the capture date, and removes EXIF, GPS, XMP and colour-profile metadata from the published files. Originals are not kept. Images keep their aspect ratio, are never enlarged, and use progressively lower WebP quality if necessary to stay below 2 MB per rendition. Each original JPEG must be under 40 MB and 80 megapixels; select up to 50 at a time.

The gallery shows the newest photographs first using capture dates from EXIF or recognizable date filenames; an upload without a capture date uses its publication date. The original 21 photographs have no capture dates and follow in descending natural filename order (`DSCF0907.jpg` before `DSCF0881.jpg`). File modification time is never treated as capture time. Fullscreen navigation follows the same order.

Choose **Remove photos**, then **Remove** on an image to remove it from the public gallery. **Done** hides the removal controls. Public visitors can browse the gallery and fullscreen viewer without logging in.

The initial gallery loads as one collection, and existing photographs stay in place when login status or editing controls change. In the fullscreen viewer, swipe left for the next photograph and right for the previous one. Pinch and vertical gestures do not change photographs; arrow buttons and keyboard navigation also work.

## Storage and authentication

The existing recipes Pages application provides the shared editor API and authentication. Its secure, HttpOnly cookie stays on the recipes host; requests from the photography and homepage sites use an exact origin allowlist. Passwords, session tokens and GitHub credentials are not stored in this site's source or browser storage.

New WebP pairs are committed to this GitHub repository through the protected backend. Cloudflare's existing Git integration deploys them automatically. Gallery metadata and removal overrides are stored in the existing recipes D1 database, so uploads appear as soon as the GitHub commit succeeds, with no deployment wait. The media endpoint uses the deployed image when available and the immutable GitHub commit while deployment catches up.

GitHub was chosen to reuse the current infrastructure without enabling R2 billing. It is practical for a personal collection of optimized images; repository size and build time grow with the collection, and removed files remain in Git history. R2 is the simpler future storage choice for a large or frequently changing collection: object uploads need no code commit or build, and R2 has no egress fee. That migration can retain the same gallery and editor API.

If the shared API is temporarily unavailable, the original static collection still loads. Saved additions and removal overrides require that API and may be absent during the outage; editing is disabled until it recovers.

## Files and checks

- `index.html`, `photography-20260727.css` — public page and layout.
- `gallery-20260727.js` — gallery, fullscreen viewer and signed-in editing controls.
- `photo-processing.js` — bounded JPEG decoding, date extraction and metadata-free WebP conversion.
- `gallery.json`, `photo-details.json`, `photos/` — original collection.
- `test/photo-processing.test.mjs` — date, malformed input, metadata removal, ordering and conversion tests.

Run `node --test test/*.test.mjs` and `node scripts/build.mjs`. The build stages only explicit public files into `dist`; it never publishes tests, credentials or repository configuration. It gives the gallery, its imported processing module and stylesheet content-hashed URLs so updates reach existing browsers on a normal refresh. See [DEPLOYMENT.md](DEPLOYMENT.md) for setup and publishing.

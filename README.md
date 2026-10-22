# Photography

Source files for [photography.njmurray.com](https://photography.njmurray.com/).

The gallery currently contains 21 photographs, each stored in responsive
960-pixel and 1920-pixel WebP versions.

## Structure

- `index.html` — Photography page
- `photography-20260727.css` — layout and styling
- `gallery-20260727.js` — gallery and fullscreen viewer
- `gallery.json` — generated gallery manifest
- `photo-details.json` — photo metadata
- `photos/` — responsive gallery images
- `og.jpg` — social sharing image

The gallery deploys independently from this repository through Cloudflare Pages. See [DEPLOYMENT.md](DEPLOYMENT.md) for the build and publishing workflow.

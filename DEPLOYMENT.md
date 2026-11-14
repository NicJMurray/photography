# Deployment

- Source: `NicJMurray/photography`, branch `main`.
- Live URL: https://photography.njmurray.com/
- Cloudflare Pages project: `photography`.
- Build command: `node scripts/build.mjs`; output directory: `dist`.
- DNS: proxied CNAME `photography.njmurray.com` to the project's Pages hostname.

Pushes to `main` build and deploy automatically through Cloudflare's GitHub integration. No manual upload or GitHub deployment secret is needed. A failed build leaves the previous successful release live.

Run `node scripts/build.mjs` before pushing. The build validates both image sizes in `gallery.json` and stages only public gallery files.

The homepage links here; its old `/photography/` URLs redirect here. Changes to photographs belong in this repository, not in the legacy copy in `homepage`.

## Shared editor setup

The photography site stays static. Authentication and writes run in the existing `recipes` Pages application at `https://recipes.njmurray.com`; it serves `shared-admin.js`, `shared-admin.css`, `/api/shared/gallery` and `/media/photography/…`. No new login service, photo-processing service or GitHub Actions workflow is needed.

Configure `PHOTO_GITHUB_TOKEN` as an encrypted **production** secret on the recipes Pages project, never here or in public JavaScript. Use a fine-grained GitHub token restricted to `NicJMurray/photography` with **Contents: read and write** and no other optional permissions. It authorizes the backend to commit only the WebP image pairs; existing Cloudflare GitHub integration performs deployments. Keep the existing recipes `ADMIN_AUTH` secret and `RECIPES_DB` binding intact. See that repository's deployment instructions for its shared gallery schema and production configuration.

Preview Pages deployments intentionally cannot authenticate against the production editor; only the exact production photography and homepage origins are allowed. Local browser verification should mock the shared API or use the recipes local test harness, never production credentials.

The build now includes `_headers` and `photo-processing.js` explicitly. New source photo paths are under `photos/uploads/`; existing images and their manifest remain intact. Removal updates the gallery visibility; GitHub history is retained. After a code push, verify the successful deployment commit and the live gallery, including the shared editor assets and an original image.

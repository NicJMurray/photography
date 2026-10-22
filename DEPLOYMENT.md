# Deployment

- Source: `NicJMurray/photography`, branch `main`.
- Live URL: https://photography.njmurray.com/
- Cloudflare Pages project: `photography`.
- Build command: `node scripts/build.mjs`; output directory: `dist`.
- DNS: proxied CNAME `photography.njmurray.com` to the project's Pages hostname.

Pushes to `main` build and deploy automatically through Cloudflare's GitHub integration. No manual upload or GitHub deployment secret is needed. A failed build leaves the previous successful release live.

Run `node scripts/build.mjs` before pushing. The build validates both image sizes in `gallery.json` and stages only public gallery files.

The homepage links here; its old `/photography/` URLs redirect here. Changes to photographs belong in this repository, not in the legacy copy in `homepage`.

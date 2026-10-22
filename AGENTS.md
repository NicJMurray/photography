# Working on photography

This repository is the source of the live gallery at https://photography.njmurray.com/. Keep the existing gallery design and responsive image sizes unless the task requests a change.

Read README.md and DEPLOYMENT.md, inspect git status, edit here, and run `node scripts/build.mjs`. Commit and push the intended change to `main` when publishing is requested; Cloudflare Pages builds automatically. Verify the latest Cloudflare deployment and the live page before reporting it published. Never commit `dist/`, local credentials, or dependencies.

The homepage project index is in `NicJMurray/homepage`; change it only if the gallery's link or description changes. Do not edit its legacy photography copy to update this gallery.

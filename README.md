# My Trading

A React single-page app (Vite + React 19) deployed to **GitHub Pages**.

🔗 **Live site:** https://gowthamgsv32.github.io/My-Trading/

## Getting started

```bash
npm install      # install dependencies
npm run dev      # start the dev server (http://localhost:5173)
npm run build    # production build into dist/
npm run preview  # preview the production build locally
npm run lint     # run oxlint
```

## Deployment

Deployment is automated with GitHub Actions
(`.github/workflows/deploy.yml`): every push to the `main` branch builds
the app and publishes `dist/` to GitHub Pages. You can also trigger it
manually from the **Actions** tab.

### One-time setup in GitHub

Enable Pages to serve from the workflow:

1. Go to the repository's **Settings → Pages**.
2. Under **Build and deployment → Source**, choose **GitHub Actions**.

After the first successful run of the "Deploy to GitHub Pages" workflow the
site will be live at the URL above.

> **Note on the base path:** `vite.config.js` sets `base: '/My-Trading/'`
> so asset URLs resolve under the repository sub-path. If you rename the
> repository, update this value to match.

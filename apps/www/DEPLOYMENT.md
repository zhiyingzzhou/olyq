# Olyq Website Deployment

## GitHub Pages

- Build command: `pnpm --filter @olyq/www build`
- Output directory: `apps/www/dist`
- Vite base: `/`
- Node.js version: 22

The repository includes `.github/workflows/pages.yml` as a manual deployment workflow. It is intentionally not triggered by `main` pushes.

Before the first manual run, enable GitHub Pages for the repository and set **Build and deployment** to **GitHub Actions** in Settings -> Pages. Then run **Actions -> Pages -> Run workflow**.

## Cloudflare Pages

- Root directory: repository root
- Build command: `pnpm install --frozen-lockfile && pnpm --filter @olyq/www build`
- Build output directory: `apps/www/dist`
- Node.js version: 22, matching `.node-version`, `.nvmrc`, and GitHub Actions

## Docker

Build from the repository root:

```bash
docker build -f apps/www/Dockerfile -t olyq-www:local .
```

Run:

```bash
docker run --rm -p 8080:80 olyq-www:local
```

The nginx runtime serves `/healthz`, immutable static assets, and SPA fallback through `try_files $uri $uri/ /index.html`.

## References

- Vite static deploy: https://vite.dev/guide/static-deploy.html
- Cloudflare Pages build configuration: https://developers.cloudflare.com/pages/configuration/build-configuration/
- React Router basename API: https://api.reactrouter.com/v7/functions/react-router.BrowserRouter.html
- web.dev image lazy loading and fetch priority: https://web.dev/articles/lazy-loading

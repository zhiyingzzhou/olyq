FROM node:22-alpine AS build

WORKDIR /repo
ENV CI=true

RUN corepack enable

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY apps/www/package.json apps/www/package.json
COPY scripts/sync-product-assets.mjs scripts/sync-product-assets.mjs
COPY assets/product assets/product
COPY apps/extension/public/icons apps/extension/public/icons
RUN pnpm install --frozen-lockfile --filter @olyq/www...

COPY apps/www apps/www
RUN pnpm --filter @olyq/www build

FROM nginx:1.27-alpine AS runtime

COPY apps/www/nginx/default.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/apps/www/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1/healthz || exit 1

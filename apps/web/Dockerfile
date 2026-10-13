# Web image. Build from the repository root:
#   docker build -f apps/web/Dockerfile -t openeam-web .
#
# Builds the SPA, then serves it from nginx, which also proxies /graphql,
# /health and /api to the API container so the browser talks to one origin
# (no CORS, and the session cookie is first-party). See nginx.conf.

FROM node:24-alpine AS build
RUN npm install -g pnpm@12.11.2
WORKDIR /app
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile --filter @openeam/web
COPY apps/web apps/web
# VITE_API_URL stays empty: the API is same-origin behind nginx.
RUN pnpm --filter @openeam/web build

FROM nginx:1.29-alpine
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 80

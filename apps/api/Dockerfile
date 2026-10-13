# API image. Build from the repository root:
#   docker build -f apps/api/Dockerfile -t openeam-api .
#
# Three stages: a full install to compile @openeam/db and the API, a separate
# production-only install so dev tooling never reaches the image, and a slim
# runtime that applies migrations before it starts (see packages/db/src/migrate.ts).
# @openeam/db has to be built before the API, which consumes its compiled dist.

FROM node:24-alpine AS base
RUN npm install -g pnpm@12.11.2
WORKDIR /app
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY packages/db/package.json packages/db/
COPY apps/api/package.json apps/api/

FROM base AS build
RUN pnpm install --frozen-lockfile --filter @openeam/api...
COPY packages/db packages/db
COPY apps/api apps/api
RUN pnpm --filter @openeam/db build && pnpm --filter @openeam/api build

FROM base AS prod-deps
RUN pnpm install --frozen-lockfile --prod --filter @openeam/api...

FROM node:24-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=prod-deps /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=prod-deps /app/packages/db/node_modules ./packages/db/node_modules
COPY --from=build /app/packages/db/package.json ./packages/db/
COPY --from=build /app/packages/db/dist ./packages/db/dist
COPY --from=build /app/packages/db/drizzle ./packages/db/drizzle
COPY --from=build /app/apps/api/package.json ./apps/api/
COPY --from=build /app/apps/api/dist ./apps/api/dist
USER node
WORKDIR /app/apps/api
EXPOSE 4000
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s \
  CMD wget -qO- http://localhost:4000/health || exit 1
CMD ["sh", "-c", "node ../../packages/db/dist/migrate.js && node dist/main.js"]

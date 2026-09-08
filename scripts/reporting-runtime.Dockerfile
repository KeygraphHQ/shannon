# A test-only package of the worker; the assessment entrypoint is never started.
FROM node:22-bookworm-slim

RUN npm install --global --ignore-scripts pnpm@10.33.0
WORKDIR /app

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc ./
COPY apps/worker/package.json ./apps/worker/
COPY apps/cli/package.json ./apps/cli/
RUN pnpm install --frozen-lockfile

COPY tsconfig.base.json ./
COPY apps/worker/tsconfig.json ./apps/worker/
COPY apps/worker/src ./apps/worker/src
RUN pnpm --filter @shannon/worker build

# The host creates this context from an explicit reporting/review test allowlist.
COPY apps/worker/test ./apps/worker/test
COPY scripts ./scripts/

USER node
ENV NODE_ENV=test
CMD ["node", "--test", "--test-reporter=spec", "apps/worker/test/reporting-runtime.test.mjs"]

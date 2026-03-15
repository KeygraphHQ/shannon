#
# Shannon Dashboard — Lightweight Astro SSR container
#

FROM node:22-slim AS builder

WORKDIR /app

# Copy package files first for better caching
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY . .

# Build the Astro SSR app
RUN npm run build

# ── Runtime stage ──────────────────────────────────────────────────────────────
FROM node:22-slim

WORKDIR /app

# Copy built output and runtime dependencies
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./

# Non-root user for security
RUN addgroup --system dashboard && \
    adduser --system --ingroup dashboard dashboard && \
    mkdir -p /app/audit-logs && \
    chown -R dashboard:dashboard /app

USER dashboard

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=4321

EXPOSE 4321

# Astro Node standalone server
CMD ["node", "dist/server/entry.mjs"]

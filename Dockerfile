#
# Multi-stage Dockerfile for Pentest Agent
# Uses Chainguard Wolfi for minimal attack surface and supply chain security

# Builder stage - Install tools and dependencies
FROM cgr.dev/chainguard/wolfi-base:latest AS builder

# Install system dependencies available in Wolfi
RUN apk update && apk add --no-cache \
    # Core build tools
    build-base \
    git \
    curl \
    wget \
    ca-certificates \
    # Language runtimes
    nodejs-22 \
    npm \
    # Additional utilities
    bash

# Install pnpm
RUN npm install -g --ignore-scripts pnpm@10.33.0

# Build Node.js application in builder to avoid QEMU emulation failures in CI
WORKDIR /app

# Copy workspace manifests for install layer caching
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc ./
COPY apps/worker/package.json ./apps/worker/
COPY apps/cli/package.json ./apps/cli/

RUN pnpm install --frozen-lockfile

COPY . .

# Build worker. CLI not needed in Docker
RUN pnpm --filter @shannon/worker run build

# Production-only deps (pnpm recommends install --prod over prune in monorepos)
RUN rm -rf node_modules apps/*/node_modules && pnpm install --frozen-lockfile --prod

# Runtime stage - Minimal production image
FROM cgr.dev/chainguard/wolfi-base:latest AS runtime

# Lifecycle protocol consumed by the CLI before it trusts a container workflow-id label.
LABEL shannon.worker-protocol="workflow-id-v1"

# Install only runtime dependencies
USER root
RUN apk update && apk add --no-cache \
    # Core utilities
    git \
    bash \
    curl \
    ca-certificates \
    shadow \
    # Typst tarball decompression
    xz \
    # Language runtimes (minimal)
    nodejs-22 \
    npm \
    python3 \
    # Chromium browser and dependencies for Playwright
    chromium \
    # Additional libraries Chromium needs
    nss \
    freetype \
    harfbuzz \
    # X11 libraries for headless browser
    libx11 \
    libxcomposite \
    libxdamage \
    libxext \
    libxfixes \
    libxrandr \
    mesa-gbm \
    # Font rendering
    fontconfig

# Install Typst (report PDF compilation)
ARG TYPST_VERSION=0.14.2
RUN case "$(uname -m)" in \
      x86_64) TYPST_ARCH=x86_64-unknown-linux-musl ;; \
      aarch64) TYPST_ARCH=aarch64-unknown-linux-musl ;; \
      *) echo "unsupported arch $(uname -m)" && exit 1 ;; \
    esac && \
    mkdir -p /tmp/typst-dl /usr/local/bin && cd /tmp/typst-dl && \
    curl -fsSL "https://github.com/typst/typst/releases/download/v${TYPST_VERSION}/typst-${TYPST_ARCH}.tar.xz" -o typst.tar.xz && \
    xz -d typst.tar.xz && \
    tar -xf typst.tar && \
    mv "typst-${TYPST_ARCH}/typst" /usr/local/bin/typst && \
    chmod +x /usr/local/bin/typst && \
    cd / && rm -rf /tmp/typst-dl && \
    typst --version

# Create non-root user
RUN addgroup -g 1001 pentest && \
    adduser -u 1001 -G pentest -s /bin/bash -D pentest

# System-level git config (survives UID remapping in entrypoint)
RUN git config --system user.email "agent@localhost" && \
    git config --system user.name "Pentest Agent" && \
    git config --system --add safe.directory '*'

# Set working directory
WORKDIR /app

# Copy only what the worker needs (skip CLI source, infra, tsdown artifacts)
COPY --from=builder /app/package.json /app/pnpm-workspace.yaml /app/pnpm-lock.yaml /app/.npmrc /app/
COPY --from=builder /app/node_modules /app/node_modules
COPY --from=builder /app/apps/worker /app/apps/worker
COPY --from=builder /app/apps/cli/package.json /app/apps/cli/package.json

# Third-party license and notice material travels with the distributed image
COPY LICENSE THIRD_PARTY_NOTICES.md /usr/share/licenses/shannon/
COPY LICENSES/ /usr/share/licenses/shannon/LICENSES/

RUN npm install -g --ignore-scripts @playwright/cli@0.1.1
RUN mkdir -p /tmp/.claude/skills && \
    playwright-cli install --skills && \
    cp -r .claude/skills/playwright-cli /tmp/.claude/skills/ && \
    rm -rf .claude

# Symlink CLI tools onto PATH
RUN ln -s /app/apps/worker/dist/scripts/save-deliverable.js /usr/local/bin/save-deliverable && \
    chmod +x /app/apps/worker/dist/scripts/save-deliverable.js && \
    ln -s /app/apps/worker/dist/scripts/generate-totp.js /usr/local/bin/generate-totp && \
    chmod +x /app/apps/worker/dist/scripts/generate-totp.js && \
    ln -s /app/apps/worker/dist/scripts/set-report-meta.js /usr/local/bin/set-report-meta && \
    chmod +x /app/apps/worker/dist/scripts/set-report-meta.js

# Create directories for session data and ensure proper permissions
RUN mkdir -p /app/sessions /app/repos /app/workspaces && \
    mkdir -p /tmp/.cache /tmp/.config /tmp/.npm /tmp/.pi/agent && \
    chmod 777 /app && \
    chmod 777 /tmp/.cache && \
    chmod 777 /tmp/.config && \
    chmod 777 /tmp/.npm && \
    chown -R pentest:pentest /app /tmp/.claude /tmp/.pi

COPY entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

# Set environment variables
ENV NODE_ENV=production
ENV PATH="/usr/local/bin:$PATH"
ENV SHANNON_DOCKER=true
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
ENV PLAYWRIGHT_MCP_EXECUTABLE_PATH=/usr/bin/chromium-browser
ENV npm_config_cache=/tmp/.npm
ENV HOME=/tmp
ENV XDG_CACHE_HOME=/tmp/.cache
ENV XDG_CONFIG_HOME=/tmp/.config

ENTRYPOINT ["/app/entrypoint.sh"]
CMD ["node", "apps/worker/dist/temporal/worker.js"]

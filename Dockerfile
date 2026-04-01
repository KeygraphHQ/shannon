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
    # Network libraries for Go tools
    libpcap-dev \
    linux-headers \
    # Language runtimes
    go \
    nodejs-22 \
    npm \
    python3 \
    py3-pip \
    ruby \
    ruby-dev \
    # Security tools available in Wolfi
    nmap \
    # Additional utilities
    bash

# Set environment variables for Go
ENV GOPATH=/go
ENV PATH=$GOPATH/bin:/usr/local/go/bin:$PATH
ENV CGO_ENABLED=1

# Create directories
RUN mkdir -p $GOPATH/bin

# Install Go-based security tools
RUN go install -v github.com/projectdiscovery/subfinder/v2/cmd/subfinder@v2.13.0
# Install WhatWeb from release tarball (Ruby-based tool)
RUN curl -sL https://github.com/urbanadventurer/WhatWeb/archive/refs/tags/v0.6.3.tar.gz | tar xz -C /opt && \
    mv /opt/WhatWeb-0.6.3 /opt/whatweb && \
    chmod +x /opt/whatweb/whatweb && \
    gem install addressable -v 2.8.9 && \
    echo '#!/bin/bash' > /usr/local/bin/whatweb && \
    echo 'cd /opt/whatweb && exec ./whatweb "$@"' >> /usr/local/bin/whatweb && \
    chmod +x /usr/local/bin/whatweb

# Install Python-based tools
RUN pip3 install --no-cache-dir schemathesis==4.13.0

# Install pnpm
RUN npm install -g pnpm@10.33.0

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

# Install only runtime dependencies
USER root
RUN apk update && apk add --no-cache \
    # Core utilities
    git \
    bash \
    curl \
    ca-certificates \
    # Network libraries (runtime)
    libpcap \
    # Security tools
    nmap \
    # Language runtimes (minimal)
    nodejs-22 \
    npm \
    python3 \
    ruby \
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

# Copy Go binaries from builder
COPY --from=builder /go/bin/subfinder /usr/local/bin/

# Copy WhatWeb from builder
COPY --from=builder /opt/whatweb /opt/whatweb
COPY --from=builder /usr/local/bin/whatweb /usr/local/bin/whatweb

# Install WhatWeb Ruby dependencies in runtime stage
RUN gem install addressable -v 2.8.9

# Copy Python packages from builder
COPY --from=builder /usr/lib/python3.*/site-packages /usr/lib/python3.12/site-packages
COPY --from=builder /usr/bin/schemathesis /usr/bin/

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

RUN npm install -g @anthropic-ai/claude-code@2.1.84 @playwright/cli@0.1.1
RUN mkdir -p /tmp/.claude/skills && \
    playwright-cli install --skills && \
    cp -r .claude/skills/playwright-cli /tmp/.claude/skills/ && \
    rm -rf .claude

# Symlink CLI tools onto PATH
RUN ln -s /app/apps/worker/dist/scripts/save-deliverable.js /usr/local/bin/save-deliverable && \
    chmod +x /app/apps/worker/dist/scripts/save-deliverable.js && \
    ln -s /app/apps/worker/dist/scripts/generate-totp.js /usr/local/bin/generate-totp && \
    chmod +x /app/apps/worker/dist/scripts/generate-totp.js

# Create directories for session data and ensure proper permissions
RUN mkdir -p /app/sessions /app/deliverables /app/repos /app/workspaces && \
    mkdir -p /tmp/.cache /tmp/.config /tmp/.npm && \
    chmod 777 /app && \
    chmod 777 /tmp/.cache && \
    chmod 777 /tmp/.config && \
    chmod 777 /tmp/.npm && \
    chown -R pentest:pentest /app /tmp/.claude

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

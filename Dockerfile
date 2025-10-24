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
RUN go install -v github.com/projectdiscovery/subfinder/v2/cmd/subfinder@latest
# Install WhatWeb from GitHub (Ruby-based tool)
RUN git clone --depth 1 https://github.com/urbanadventurer/WhatWeb.git /opt/whatweb && \
    chmod +x /opt/whatweb/whatweb && \
    gem install addressable && \
    echo '#!/bin/bash' > /usr/local/bin/whatweb && \
    echo 'cd /opt/whatweb && exec ./whatweb "$@"' >> /usr/local/bin/whatweb && \
    chmod +x /usr/local/bin/whatweb

# Install Python-based tools
RUN pip3 install --no-cache-dir schemathesis

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
RUN gem install addressable

# Copy Python packages from builder
COPY --from=builder /usr/lib/python3.*/site-packages /usr/lib/python3.12/site-packages
COPY --from=builder /usr/bin/schemathesis /usr/bin/

# Create non-root user for security
RUN addgroup -g 1001 pentest && \
    adduser -u 1001 -G pentest -s /bin/bash -D pentest

# Set working directory
WORKDIR /app

# Copy package.json and package-lock.json first for better caching
COPY package*.json ./

# Install Node.js dependencies as root
RUN npm ci --only=production && \
    npm install -g zx && \
    npm install -g @anthropic-ai/claude-agent-sdk && \
    npm cache clean --force

# Copy application code
COPY . .

# Create directories for session data and ensure proper permissions

RUN mkdir -p /app/sessions /app/deliverables /app/repos && \
    chown -R pentest:pentest /app /app/repos && \
    chmod +x /app/shannon.mjs


# Switch to non-root user
USER pentest

# Set environment variables
ENV NODE_ENV=production
ENV PATH="/usr/local/bin:$PATH"
ENV SHANNON_DOCKER=true
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
ENV PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium-browser


# Set entrypoint
ENTRYPOINT ["./shannon.mjs"]
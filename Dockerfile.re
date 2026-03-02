# Dockerfile for Shannon Reverse Engineering Tools
# These tools are used by Phase 6 agents (re-binary, re-mobile, re-firmware, re-malware)
# Uses Chainguard Wolfi for consistency with main Shannon image

FROM cgr.dev/chainguard/wolfi-base:latest

USER root

# Install system dependencies and tools available in Wolfi
RUN apk update && apk add --no-cache \
    # Core utilities
    bash \
    curl \
    wget \
    git \
    ca-certificates \
    file \
    # Language runtimes
    python3 \
    py3-pip \
    ruby \
    ruby-dev \
    # Java for Ghidra and MobSF
    openjdk-17 \
    # Build tools for compiling tools from source
    build-base \
    go \
    # Network tools
    libpcap-dev \
    linux-headers

# Install Rizin (Binary Analysis) - available in Wolfi
RUN apk add --no-cache rizin

# Install Binwalk (Firmware Extraction)
RUN pip3 install --no-cache-dir binwalk

# Install YARA (Malware Signatures) - available in Wolfi  
RUN apk add --no-cache yara

# Install Detect It Easy (DIE) - File identification
RUN git clone --depth 1 https://github.com/horsicq/Detect-It-Easy.git /opt/die && \
    cd /opt/die && \
    chmod +x die && \
    ln -s /opt/die/die /usr/local/bin/die

# Install Ghidra (Advanced Binary Analysis)
RUN wget -q https://github.com/NationalSecurityAgency/ghidra/releases/download/Ghidra_11.2.1_build/ghidra_11.2.1_PUBLIC_20241105.zip && \
    unzip -q ghidra_11.2.1_PUBLIC_20241105.zip -d /opt && \
    rm ghidra_11.2.1_PUBLIC_20241105.zip && \
    ln -s /opt/ghidra_11.2.1_PUBLIC/support/analyzeHeadless /usr/local/bin/ghidra

# Install MobSF dependencies (Mobile Analysis)
RUN pip3 install --no-cache-dir \
    mobsf \
    androguard \
    apkid \
    quark-engine

# Install JADX (Android Decompiler)
RUN wget -q https://github.com/skylot/jadx/releases/download/v1.4.7/jadx-1.4.7.zip && \
    unzip -q jadx-1.4.7.zip -d /opt/jadx && \
    rm jadx-1.4.7.zip && \
    ln -s /opt/jadx/bin/jadx /usr/local/bin/jadx

# Install apktool (APK manipulation)
RUN wget -q https://raw.githubusercontent.com/iBotPeaches/Apktool/master/scripts/linux/apktool -O /usr/local/bin/apktool && \
    wget -q https://bitbucket.org/iBotPeaches/apktool/downloads/apktool_2.9.3.jar -O /usr/local/bin/apktool.jar && \
    chmod +x /usr/local/bin/apktool

# Install additional RE tools
RUN go install -v github.com/radareorg/r2pipe-go/...@latest

# Create non-root user for security
RUN addgroup -g 1001 pentest && \
    adduser -u 1001 -G pentest -s /bin/bash -D pentest

# Create directories for samples and deliverables
RUN mkdir -p /samples /deliverables /app/audit-logs && \
    chown -R pentest:pentest /samples /deliverables /app

# Set working directory
WORKDIR /samples

# Switch to non-root user
USER pentest

# Set environment variables
ENV PATH="/usr/local/bin:/opt/jadx/bin:$PATH"
ENV JAVA_HOME=/usr/lib/jvm/java-17-openjdk
ENV GHIDRA_INSTALL_DIR=/opt/ghidra_11.2.1_PUBLIC

# Default command - keep container running
CMD ["tail", "-f", "/dev/null"]

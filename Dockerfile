# Multi-stage Dockerfile for building mujoco_wasm on x86_64
# Stage 1: Build environment
FROM --platform=linux/amd64 ubuntu:22.04 AS builder

# Prevent interactive prompts during package installation
ENV DEBIAN_FRONTEND=noninteractive

# Install system dependencies
RUN apt-get update && apt-get install -y \
    git \
    python3 \
    python3-pip \
    cmake \
    make \
    build-essential \
    wget \
    xz-utils \
    && rm -rf /var/lib/apt/lists/*

# Install Emscripten (using version 3.1.55 to stay under 3.1.56)
WORKDIR /opt
RUN git clone https://github.com/emscripten-core/emsdk.git
WORKDIR /opt/emsdk
RUN ./emsdk install 3.1.55 && \
    ./emsdk activate 3.1.55

# Set up Emscripten environment
ENV PATH="/opt/emsdk:/opt/emsdk/upstream/emscripten:/opt/emsdk/node/16.20.0_64bit/bin:${PATH}"
ENV EMSDK="/opt/emsdk"
ENV EM_CONFIG="/opt/emsdk/.emscripten"

# Create working directory
WORKDIR /app

# Stage 2: Runtime environment with web server
FROM --platform=linux/amd64 ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive

# Install runtime dependencies
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    git \
    cmake \
    make \
    build-essential \
    wget \
    xz-utils \
    nginx \
    && rm -rf /var/lib/apt/lists/*

# Copy Emscripten from builder
COPY --from=builder /opt/emsdk /opt/emsdk

# Set up Emscripten environment
ENV PATH="/opt/emsdk:/opt/emsdk/upstream/emscripten:/opt/emsdk/node/16.20.0_64bit/bin:${PATH}"
ENV EMSDK="/opt/emsdk"
ENV EM_CONFIG="/opt/emsdk/.emscripten"

# Create working directory
WORKDIR /app

# Copy entrypoint script (we'll create this next)
COPY docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# Expose port for web server
EXPOSE 8080

# Set entrypoint
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["build-and-serve"]

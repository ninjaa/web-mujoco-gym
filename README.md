# MuJoCo WASM Docker Setup

This project provides a Docker-based environment for building and running [mujoco_wasm](https://github.com/zalo/mujoco_wasm) on Apple Silicon Macs by using an x86_64 container.

## Quick Start

1. **Build and run the container:**
   ```bash
   docker-compose up --build
   ```

2. **Access the MuJoCo WASM demo:**
   Open your browser to [http://localhost:8080](http://localhost:8080)

## Available Commands

### Using Docker Compose (Recommended)
```bash
# Build and start the container with web server
docker-compose up --build

# Run in detached mode
docker-compose up -d

# Stop the container
docker-compose down

# View logs
docker-compose logs -f

# Access container shell
docker-compose exec mujoco-wasm bash
```

### Using Docker directly
```bash
# Build the image
docker build --platform linux/amd64 -t mujoco-wasm .

# Run with build and serve
docker run --platform linux/amd64 -p 8080:8080 mujoco-wasm

# Just build without serving
docker run --platform linux/amd64 mujoco-wasm build

# Interactive shell
docker run --platform linux/amd64 -it mujoco-wasm bash
```

## Architecture

- **Base Image**: Ubuntu 22.04 x86_64
- **Emscripten**: Version 3.1.55 (for WASM compilation)
- **Web Server**: Nginx on port 8080
- **Build System**: CMake with Emscripten toolchain

## Project Structure
```
.
├── Dockerfile          # Multi-stage Docker build
├── docker-compose.yml  # Docker Compose configuration
├── docker-entrypoint.sh # Container entrypoint script
├── workspace/          # Mounted volume for development
└── README.md          # This file
```

## Troubleshooting

### Apple Silicon Performance
The container runs in x86_64 emulation mode on Apple Silicon, which may impact build performance. The compiled WASM files will run at native speed in your browser.

### Port Already in Use
If port 8080 is already in use, modify the port mapping in `docker-compose.yml`:
```yaml
ports:
  - "8081:8080"  # Change 8081 to your preferred port
```

### Build Cache
To force a complete rebuild:
```bash
docker-compose build --no-cache
docker-compose up
```

## Next Steps

1. **Multiple Environments**: Create additional HTML pages to run multiple MuJoCo simulations
2. **RL Integration**: Add JavaScript code to load and run RL model inference
3. **Custom Models**: Add your own MuJoCo XML models to the workspace directory

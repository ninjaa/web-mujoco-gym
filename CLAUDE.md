# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This project aims to run the [mujoco_wasm](https://github.com/zalo/mujoco_wasm) MuJoCo WebAssembly playground in a Docker container to solve Apple Silicon compilation issues. The ultimate goal is to demonstrate multiple MuJoCo environments running inference from fine-tuned RL models.

### Key Components:
- **MuJoCo WASM**: A WebAssembly port of MuJoCo physics engine that runs in browsers
- **Docker Container**: x86_64 environment to handle compilation issues on Apple Silicon
- **RL Model Integration**: Multiple parallel MuJoCo instances showcasing trained models

## Common Development Commands

### Build and Run
```bash
# Build and start the entire system
docker-compose up --build -d

# View build logs
docker logs -f mujoco-wasm-container

# Stop the system
docker-compose down
```

### Development Workflow
```bash
# Access the main demo
open http://localhost:8080/workspace/multi-env-demo.html

# Access container for debugging
docker exec -it mujoco-wasm-container bash

# Rebuild only the WASM components
docker exec -it mujoco-wasm-container build

# Restart web server only
docker exec -it mujoco-wasm-container serve
```

## Development Setup

### MuJoCo WASM Build Requirements
1. **Emscripten**: WebAssembly compiler toolchain (version 3.1.55, staying under 3.1.56)
2. **Python**: For autogenerating bindings (`src/parse_mjxmacro.py`)
3. **CMake & Make**: Build tools
4. **MuJoCo libs**: Currently includes v2.3.1

### Docker Strategy
Using x86_64 Docker container to address Apple Silicon compatibility issues:
- Base image: Ubuntu 22.04 x86_64
- Install Emscripten SDK v3.1.55
- Clone and build mujoco_wasm
- Serve compiled WASM files via nginx on port 8080

## Architecture

### Modular Design (v2)
The latest refactor splits functionality into focused modules:
- `mujoco-orchestrator.js` - Manages worker pool and environment distribution  
- `mujoco-rl-worker-v2.js` - Runs MuJoCo physics in Web Workers
- `ui-controls.js` - UI state management and render loop
- `visualization-2d.js` - 2D stick figure rendering  
- `threejs-modal.js` - 3D visualization popup (click any environment)
- `mujoco-model-parser.js` - Parses and processes MuJoCo XML models

### Worker Architecture
```
┌─────────────────────────────────────────┐
│          Browser Main Thread            │
│  ┌─────────────┐  ┌──────────────┐    │
│  │ Orchestrator │  │ Visualization │    │
│  └─────────────┘  └──────────────┘    │
└─────────────┬───────────────────────────┘
               │
     ┌─────────┴─────────┬─────────────┐
     ▼                   ▼             ▼
┌─────────┐      ┌─────────┐    ┌─────────┐
│Worker 1 │      │Worker 2 │    │Worker N │
│┌───────┐│      │┌───────┐│    │┌───────┐│
││MuJoCo ││      ││MuJoCo ││    ││MuJoCo ││
│└───────┘│      │└───────┘│    │└───────┘│
│ Env 1-20│      │Env 21-40│    │   ...   │
└─────────┘      └─────────┘    └─────────┘
```

### Build Process
1. Docker container installs Emscripten v3.1.55
2. Clone mujoco_wasm repository  
3. Run `src/parse_mjxmacro.py` to autogenerate bindings
4. Build with CMake:
   ```bash
   mkdir build
   cd build
   emcmake cmake ..
   make -j$(nproc)
   ```
5. Nginx serves built WASM files with proper CORS headers

### JavaScript API Overview
```javascript
import load_mujoco from "./mujoco_wasm.js";

// Load the MuJoCo Module
const mujoco = await load_mujoco();

// Set up Virtual File System
mujoco.FS.mkdir('/working');
mujoco.FS.mount(mujoco.MEMFS, { root: '.' }, '/working');
mujoco.FS.writeFile("/working/model.xml", xmlContent);

// Initialize simulation
let model = new mujoco.Model("/working/model.xml");
let state = new mujoco.State(model);
let simulation = new mujoco.Simulation(model, state);
```

### File Organization
- `/workspace/` - Development files (JS modules, HTML demos, XML models)
- `/app/mujoco_wasm/` - Built WASM files (served at root)
- `multi-env-demo.html` - Main parallel RL demonstration
- `humanoid.xml` - MuJoCo humanoid robot model

### Performance Targets  
- **Current**: 120 visual FPS with 12 environments
- **Target**: 1000+ environments at 10,000+ physics steps/second
- **Strategy**: Decouple physics from rendering, batch updates
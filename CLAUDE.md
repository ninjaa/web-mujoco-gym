# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This project aims to run the [mujoco_wasm](https://github.com/zalo/mujoco_wasm) MuJoCo WebAssembly playground in a Docker container to solve Apple Silicon compilation issues. The ultimate goal is to demonstrate multiple MuJoCo environments running inference from fine-tuned RL models.

### Key Components:
- **MuJoCo WASM**: A WebAssembly port of MuJoCo physics engine that runs in browsers
- **Docker Container**: x86_64 environment to handle compilation issues on Apple Silicon
- **RL Model Integration**: Multiple parallel MuJoCo instances showcasing trained models

## Development Setup

### MuJoCo WASM Build Requirements
1. **Emscripten**: WebAssembly compiler toolchain (older version <3.1.56 may be needed)
2. **Python**: For autogenerating bindings (`src/parse_mjxmacro.py`)
3. **CMake & Make**: Build tools
4. **MuJoCo libs**: Currently includes v2.3.1

### Docker Strategy
Using x86_64 Docker container to address Apple Silicon compatibility issues:
- Base image: Ubuntu/Debian x86_64
- Install Emscripten SDK
- Clone and build mujoco_wasm
- Serve compiled WASM files via web server

## Architecture

### Build Process
1. Install emscripten
2. Run `src/parse_mjxmacro.py` to autogenerate bindings
3. Build with CMake:
   ```bash
   mkdir build
   cd build
   emcmake cmake ..
   make
   ```

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

### RL Model Integration Plan
1. Compile mujoco_wasm in Docker
2. Create web interface for multiple parallel simulations
3. Load RL model weights (format TBD)
4. Run inference and visualize results across multiple environments

## Next Steps
1. Create Dockerfile with x86_64 base and required dependencies
2. Test mujoco_wasm compilation in container
3. Set up web server for serving compiled assets
4. Design multi-environment showcase interface
5. Integrate RL model inference pipeline
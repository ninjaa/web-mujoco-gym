# MuJoCo Multi-Environment Demo Instructions

This workspace contains demo pages to test the parallel MuJoCo environment architecture.

## Files Overview

### 1. `multi-env-demo.html`
A full-featured demo showing parallel MuJoCo environments with:
- Visual grid of multiple environments
- Real-time performance metrics
- Control panel for initializing and running simulations
- Mock physics simulation for testing the UI

### 2. `mujoco-parallel-test.html`
A simplified test page that attempts to use actual MuJoCo WASM:
- Creates Web Workers with inline MuJoCo code
- Tests loading and stepping physics simulations
- Basic visualization of pendulum environments

### 3. Supporting Scripts
- `environment-generator.js` - Generates randomized MuJoCo XML environments
- `mujoco-worker.js` - Original worker script (not used by inline workers)
- `rl-orchestrator.js` - Updated orchestrator with real MuJoCo integration

## How to Test

### Option 1: Using the Docker Container

1. Make sure your Docker container is running:
   ```bash
   cd /Users/ad_p_/Projects/mujoco
   docker-compose up
   ```

2. Place these HTML files in the served directory (they should already be in the workspace folder which is mounted)

3. Open in browser:
   - `http://localhost:8080/workspace/multi-env-demo.html` - For the full UI demo
   - `http://localhost:8080/workspace/mujoco-parallel-test.html` - For actual MuJoCo testing

### Option 2: Local Testing

For the `multi-env-demo.html` (doesn't require MuJoCo):
1. Simply open the file in a web browser
2. Click "Initialize" to start the demo

## Expected Behavior

### Multi-Env Demo
- Shows a grid of simulated environments
- Each environment displays a moving agent with velocity vectors
- Performance chart shows FPS over time
- Statistics update in real-time

### MuJoCo Parallel Test
- Will attempt to load actual MuJoCo WASM
- May show errors if MuJoCo files aren't properly served
- If successful, will show pendulum simulations

## Troubleshooting

1. **CORS Errors**: Make sure you're accessing through the Docker container's nginx server
2. **Worker Errors**: Check browser console for detailed error messages
3. **Performance Issues**: Reduce number of environments or workers

## Next Steps

1. Ensure MuJoCo WASM files are properly built and served at `/dist/mujoco_wasm.js`
2. Test with actual MuJoCo models beyond simple pendulum
3. Integrate your RL policy for action selection
4. Scale up to test with more environments

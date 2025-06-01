# Technical Architecture Brief

## Core Innovation

We're using Web Workers to achieve true parallelism in the browser for physics simulation. Each worker runs its own MuJoCo WASM instance, managing multiple environments.

### v2 Modular Architecture
The latest refactor improves maintainability and extensibility:
- **Separation of Concerns**: Physics (workers) vs UI (main thread)
- **ES6 Modules**: Dynamic imports, clean dependencies
- **Event-Driven**: Async message passing between components
- **Pluggable Visualization**: 2D canvas + optional 3D Three.js modal

## Why This Approach Beats Traditional Methods

| Traditional Cloud RL | MuJoCo WebSim |
|---------------------|---------------|
| Spin up 1000 containers | 1 browser tab |
| $100s/day in compute | Free on laptop |
| Complex orchestration | Simple JavaScript |
| No visualization | Real-time rendering |
| Hard to share | Send a URL |

## Architecture Deep Dive

### Message Flow
```
User Input → UI Controls → Orchestrator → Workers → Physics
                ↑                              ↓
           Visualization ← State Updates ← MuJoCo WASM
```

### Current Faux RL Implementation
```javascript
// In mujoco-rl-worker-v2.js
// Random actions simulate untrained policy
const actions = new Float64Array(21);
for (let i = 0; i < actions.length; i++) {
    actions[i] = (Math.random() - 0.5) * 2; // [-1, 1]
}

// Episode logic
if (torsoHeight < 0.1) {
    done = true; // Reset environment
}
```

## Performance Analysis

### Current Bottlenecks
1. **Rendering**: Drawing 12+ environments at 60 FPS
2. **Message Passing**: Worker ↔ main thread communication
3. **Memory**: Each WASM instance needs ~50MB

### Achieved Optimizations
1. **Decoupled Rendering**: Physics runs independently of frame rate
2. **Efficient Updates**: Only send changed state, not full arrays
3. **Lazy Loading**: Three.js loaded only when 3D modal opened

## Technical Achievements

### What's Working
- True parallel physics (not just async)
- Real MuJoCo humanoid with 21 actuators
- Smooth 60 FPS with 12+ environments
- Click-to-zoom 3D visualization
- Real-time action visualizer
- Episode management and auto-reset

### Known Limitations
1. **3D Joint Movement**: Joints don't animate smoothly yet
2. **Robot Appearance**: Missing marionette skin from original
3. **Fall Animation**: Robots reset instead of showing crumpled state

## Integration Points

### RL Frameworks
```javascript
// Ready for real RL policies
class WebSimEnvironment {
  async step(actions) {
    // Currently random, ready for neural network
    return await orchestrator.step(actions);
  }
  
  async reset() {
    return await orchestrator.reset();
  }
}
```

### Model Deployment
- Load ONNX/TensorFlow.js models directly
- Run inference in workers for parallelism
- Export trajectories for offline training

## Quick Wins for Demo

1. **Visual Impact**: 100 robots falling and resetting simultaneously
2. **Interactivity**: Click any robot for 3D view
3. **Debug Mode**: See all 21 actuators in action
4. **Speed**: Step counter showing millions of physics steps

## Next Technical Steps

1. **Real RL Policy**: Replace random actions with trained network
2. **Marionette Skin**: Match original demo appearance
3. **Fall Animation**: Continue simulating after fall detection
4. **Joint Control**: Enable dragging joints in 3D modal

## Scalability Limits

### Local (M1 MacBook Pro)
- **CPU**: 8 cores → ~50 workers practical limit
- **Memory**: 16GB → ~300 WASM instances
- **Realistic**: 200-500 environments at full speed

### Cloud (c5.24xlarge)
- **CPU**: 96 vCPUs → 500+ workers
- **Memory**: 192GB → 3000+ WASM instances  
- **Realistic**: 2000-5000 environments

## Use Case Positioning

### What We're NOT
- Not competing with Isaac Gym on raw throughput
- Not for massive distributed training

### What We ARE
- **Education**: Learn RL without infrastructure
- **Prototyping**: Test ideas in minutes, not hours
- **Visualization**: See what your agent sees
- **Sharing**: Send results with a link
- **Accessibility**: RL for everyone



## Next Developer Steps

1. Pick one demo to polish (recommend multi-env-demo.html)
3. Add FPS/steps decoupling
4. Create 2-minute video showing 100+ envs

The key is to show **accessibility** and **scale** together - something only possible with this architecture.

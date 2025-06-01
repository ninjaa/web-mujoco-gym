# 3D Visualization Upgrade Plan: Interactive Physics

## Goal
Add interactive dragging and visual enhancements to match the original MuJoCo WASM demo.

## Remaining Tasks

### Task 1: Checkered Floor with Reflection
- [ ] Implement Reflector.js for reflective floor
- [ ] Use grid texture from humanoid.xml (already defined)
- [ ] Create 100x100 plane with reflections
- [ ] Apply checkered pattern with proper texture repeat

### Task 2: Interactive Body Dragging
- [ ] Integrate DragStateManager.js
- [ ] Add pointer event handlers to canvas
- [ ] Implement raycasting for body selection
- [ ] Apply physics forces based on drag motion
- [ ] Show arrow helper for force visualization

### Task 3: Visual Polish
- [ ] Adjust camera angle to be lower and more cinematic
- [ ] Fine-tune lighting for more dramatic shadows
- [ ] Add proper fog settings for atmosphere
- [ ] Ensure shadows are properly cast and received

### Task 4: Physics Integration
- [ ] Pass force data from drag manager to worker
- [ ] Apply forces to MuJoCo simulation via `applyForce`
- [ ] Update body positions from physics state
- [ ] Handle body selection highlighting

## Implementation Details

### Floor with Reflection
```javascript
// From original demo
mesh = new Reflector(
  new THREE.PlaneGeometry(100, 100), 
  { clipBias: 0.003, texture: gridTexture }
);
mesh.rotateX(-Math.PI / 2);
```

### DragStateManager Setup
```javascript
this.dragStateManager = new DragStateManager(
  this.scene, 
  this.renderer, 
  this.camera, 
  this.container.parentElement, 
  this.controls
);
```

### Force Application
```javascript
// In animation loop
let dragged = this.dragStateManager.physicsObject;
if (dragged && dragged.bodyID) {
  let bodyID = dragged.bodyID;
  let force = toMujocoPos(
    this.dragStateManager.currentWorld.clone()
    .sub(this.dragStateManager.worldHit)
    .multiplyScalar(this.model.body_mass[bodyID] * 250)
  );
  // Apply force to simulation
}
```

### Texture Loading from Model
The humanoid.xml already defines:
- Grid texture: `builtin="checker"` with `rgb1=".1 .2 .3" rgb2=".2 .3 .4"`
- Body texture: `builtin="flat"` with skin tone

## Files to Modify
1. `threejs-modal.js` - Add drag interaction and reflective floor
2. `mujoco-orchestrator.js` - Add force application method
3. `mujoco-rl-worker.js` - Handle force application in physics

## Resources
- DragStateManager.js - Copied from original demo
- Reflector.js - Copied from original demo
- Original implementation: `/app/mujoco_wasm/examples/`
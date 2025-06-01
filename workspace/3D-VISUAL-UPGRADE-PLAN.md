# 3D Visualization Upgrade Plan: Marionette-Style Rendering

## Goal
Transform our basic 3D visualization to match the visual quality of the original MuJoCo WASM demo's marionette-style humanoid.

## Current Issues
1. Gray, flat-shaded robot vs. skin-colored marionette
2. Static geometry vs. physics-driven animation
3. No joint movement vs. smooth articulation
4. Basic materials vs. physical materials with textures

## Step-by-Step Implementation Tasks

### Step 1: Fix Immediate Error (Quick Fix)
- [ ] Fix "openModal function not found" error
- [ ] Ensure modal can open when clicking environments

### Step 2: Extract MuJoCo Model Data
- [ ] Create `mujoco-model-parser.js` module
- [ ] Parse humanoid.xml for:
  - Body hierarchy and names
  - Geom types, sizes, and positions
  - Material properties and colors
  - Joint locations and axes
- [ ] Convert MuJoCo coordinates to Three.js (Y-up)

### Step 3: Implement Proper Materials
- [ ] Load MuJoCo material data:
  ```javascript
  // Target material from humanoid.xml
  material.color = new THREE.Color(0.8, 0.6, 0.4); // Skin tone
  material.roughness = 0.6;
  material.metalness = 0.1;
  ```
- [ ] Create texture from MuJoCo's "body" texture definition
- [ ] Apply MeshPhysicalMaterial with proper properties

### Step 4: Build Accurate Geometry
- [ ] Replace hardcoded shapes with MuJoCo geoms:
  - Capsules for limbs (CapsuleGeometry)
  - Spheres for joints and head
  - Proper sizes from model data
- [ ] Create body hierarchy matching MuJoCo structure
- [ ] Position bodies at exact MuJoCo coordinates

### Step 5: Sync with Physics Data
- [ ] Pass full MuJoCo state to 3D modal:
  - `xpos` array (body positions)
  - `xquat` array (body rotations)
  - Joint angles
- [ ] Update robot pose each frame:
  ```javascript
  // For each body
  getPosition(simulation.xpos, bodyIndex, body.position);
  getQuaternion(simulation.xquat, bodyIndex, body.quaternion);
  ```

### Step 6: Lighting and Atmosphere
- [ ] Match MuJoCo scene settings:
  - Background: `rgb(0.15, 0.25, 0.35)` with fog
  - Spotlight targeting torso
  - Ambient light at 0.1 intensity
- [ ] Enable soft shadows (PCFSoftShadowMap)

### Step 7: Advanced Features
- [ ] Add tendon visualization (red cylinders)
- [ ] Implement joint constraints visualization
- [ ] Add floor reflection (using Reflector)
- [ ] Show contact points when robot touches ground

### Step 8: Performance Optimization
- [ ] Use InstancedMesh for multiple robots
- [ ] LOD (Level of Detail) for distant robots
- [ ] Frustum culling for off-screen geometry

## Technical Reference

### MuJoCo to Three.js Coordinate Conversion
```javascript
// MuJoCo uses Z-up, Three.js uses Y-up
function mujocoToThreePosition(x, y, z) {
  return new THREE.Vector3(x, z, -y);
}
```

### Body Index Mapping
```javascript
// From worker observation
const bodyIndices = {
  world: 0,
  torso: 1,
  head: 2,
  pelvis: 3,
  // ... etc
};
```

### Material Properties from XML
```xml
<material name="body" texture="body" texuniform="true" rgba="0.8 0.6 .4 1"/>
```

## Testing Checklist
- [ ] Robot appears with skin color, not gray
- [ ] Joints move smoothly with physics
- [ ] Shadows cast properly
- [ ] Performance stays above 30 FPS
- [ ] Coordinate axes align correctly

## Resources
- Original demo: `/app/mujoco_wasm/examples/main.js`
- Utils: `/app/mujoco_wasm/examples/mujocoUtils.js`
- Model: `/workspace/humanoid.xml`

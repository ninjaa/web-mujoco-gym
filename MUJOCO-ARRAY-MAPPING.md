# MuJoCo Array Mapping Guide

## How MuJoCo Maps XML Elements to Array Indices

You're absolutely right! MuJoCo maps bodies, joints, actuators, and other elements to array indices based on the order they appear in the XML file.

## Body Indexing

Bodies are indexed in the order they appear in the XML:
- **Index 0**: Always the world body (implicit, even if not defined)
- **Index 1**: First body defined in XML (usually "torso")
- **Index 2**: Second body defined in XML
- etc.

### Example from our Humanoid XML:
```xml
<worldbody>                    <!-- Index 0: world body (implicit) -->
    <body name="torso">        <!-- Index 1: torso -->
        <body name="head">     <!-- Index 2: head -->
        <body name="arm_L">    <!-- Index 3: left arm -->
        <body name="arm_R">    <!-- Index 4: right arm -->
        etc...
</worldbody>
```

### Accessing Body Positions:
```javascript
// Each body has 3 values in xpos array (x, y, z)
let bodyIndex = 1;  // torso
const xposOffset = bodyIndex * 3;
const torsoPosition = [
    simulation.xpos[xposOffset],     // x
    simulation.xpos[xposOffset + 1], // y
    simulation.xpos[xposOffset + 2]  // z
];
```

## Joint Indexing (qpos array)

Joints are indexed by their degrees of freedom (DOF) in order of appearance:
- Free joint: 7 DOF (3 position + 4 quaternion)
- Hinge joint: 1 DOF
- Ball joint: 3 DOF (quaternion)
- Slide joint: 1 DOF

### Example:
```xml
<body name="torso">
    <joint name="root" type="free"/>     <!-- qpos[0-6]: 7 values -->
    <body name="upper_arm">
        <joint name="shoulder" type="ball"/> <!-- qpos[7-9]: 3 values -->
        <body name="lower_arm">
            <joint name="elbow" type="hinge"/> <!-- qpos[10]: 1 value -->
        </body>
    </body>
</body>
```

## Actuator Indexing (ctrl array)

Actuators are indexed in the order they appear in the `<actuator>` section:

```xml
<actuator>
    <motor joint="hip_x_R"/>    <!-- ctrl[0] -->
    <motor joint="hip_z_R"/>    <!-- ctrl[1] -->
    <motor joint="hip_y_R"/>    <!-- ctrl[2] -->
    <!-- ... -->
</actuator>
```

### In our code:
```javascript
// Apply actions to actuators
for (let i = 0; i < Math.min(actions.length, model.nu); i++) {
    simulation.ctrl[i] = actions[i];  // model.nu = number of actuators
}
```

## Key MuJoCo Properties:
- `model.nbody`: Total number of bodies
- `model.nq`: Size of qpos array (total DOF for positions)
- `model.nv`: Size of qvel array (total DOF for velocities)
- `model.nu`: Number of actuators

## Important Notes:
1. The world body is always index 0, even if not explicitly defined
2. Child bodies come after their parent in the indexing
3. The order in the XML file is what matters, not the names
4. You can use `model.name2id(name)` in some MuJoCo versions, but WASM version uses direct array access

## Debugging Tips:
```javascript
console.log(`Number of bodies: ${model.nbody}`);
console.log(`Number of joints (qpos size): ${model.nq}`);
console.log(`Number of actuators: ${model.nu}`);

// Print all body positions
for (let i = 0; i < model.nbody; i++) {
    const offset = i * 3;
    console.log(`Body ${i}: [${simulation.xpos[offset]}, ${simulation.xpos[offset+1]}, ${simulation.xpos[offset+2]}]`);
}
```

## Official MuJoCo WASM Three.js Implementation

The official MuJoCo WASM examples use the exact same array indexing approach! From `/app/mujoco_wasm/examples/mujocoUtils.js`:

### getPosition Function
```javascript
export function getPosition(buffer, index, target, swizzle = true) {
  if (swizzle) {
    return target.set(
       buffer[(index * 3) + 0],  // X coordinate
       buffer[(index * 3) + 2],  // Z coordinate (swapped with Y for Three.js)
      -buffer[(index * 3) + 1]); // -Y coordinate (negated for Three.js)
  } else {
    return target.set(
       buffer[(index * 3) + 0],  // X
       buffer[(index * 3) + 1],  // Y
       buffer[(index * 3) + 2]); // Z
  }
}
```

### Usage in main.js
```javascript
// They iterate through all bodies by index
for (let b = 0; b < this.model.nbody; b++) {
    if (this.bodies[b]) {
        getPosition(this.simulation.xpos, b, this.bodies[b].position);
        getQuaternion(this.simulation.xquat, b, this.bodies[b].quaternion);
        this.bodies[b].updateWorldMatrix();
    }
}
```

### Key Insights from Official Implementation:
1. **No name-based lookups** - They use direct array indices
2. **Same offset calculation** - `index * 3` for position data
3. **Coordinate swizzling** - They swap Y/Z and negate Y for Three.js convention
4. **Direct buffer access** - No abstraction layer, just array indexing

### Other Useful mujocoUtils Functions:

#### getQuaternion
```javascript
export function getQuaternion(buffer, index, target, swizzle = true) {
  if (swizzle) {
    // Convert MuJoCo quaternion (w,x,y,z) to Three.js format with coordinate swap
    target.set(
      buffer[(index * 4) + 1],  // x
      buffer[(index * 4) + 3],  // z (was y)
     -buffer[(index * 4) + 2],  // -y (was z)
      buffer[(index * 4) + 0]   // w
    );
  } else {
    target.set(
      buffer[(index * 4) + 1],  // x
      buffer[(index * 4) + 2],  // y
      buffer[(index * 4) + 3],  // z
      buffer[(index * 4) + 0]   // w
    );
  }
}
```

#### toMujocoPos (Inverse coordinate transform)
```javascript
export function toMujocoPos(target, source) {
  // Convert Three.js coordinates back to MuJoCo
  return target.set(
    source.x,
   -source.z,  // Three.js Z becomes MuJoCo -Y
    source.y   // Three.js Y becomes MuJoCo Z
  );
}
```

### Coordinate System Notes:
- **MuJoCo**: Z-up coordinate system
- **Three.js**: Y-up coordinate system
- **Swizzle transformation**: (x,y,z) → (x,z,-y)

This validates that our direct array indexing approach is the standard way to work with MuJoCo WASM!

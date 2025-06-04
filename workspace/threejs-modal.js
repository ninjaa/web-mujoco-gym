// Three.js Modal for 3D environment visualization
// VERSION: 2024-06-01-00:08 - Added debug logging

// Import Three.js and OrbitControls as ES modules
import * as THREE from './node_modules/three/build/three.module.js';
import { OrbitControls } from './node_modules/three/examples/jsm/controls/OrbitControls.js';
import { Reflector } from './Reflector.js';
import { DragStateManager } from './DragStateManager.js';

let scene, camera, renderer, controls;
let currentEnvId = null;
let animationId = null;
let robotGroup = null;
let updateInterval = null;
let modelData = null;
let resizeHandler = null;
let dragStateManager = null;

// Make THREE available globally for debugging
window.THREE = THREE;

// Import model parser
import { MuJoCoModelParser } from "./mujoco-model-parser.js";

// Coordinate conversion functions
function mujocoToThreePosition(mjPos) {
  // MuJoCo uses Z-up, Three.js uses Y-up
  return {
    x: mjPos[0],
    y: mjPos[2], // Z -> Y
    z: -mjPos[1], // Y -> -Z
  };
}

function threeToMujocoPosition(threeVec) {
  // Three.js Y-up to MuJoCo Z-up
  return [
    threeVec.x,
    -threeVec.z, // -Z -> Y
    threeVec.y   // Y -> Z
  ];
}

function createThreeMaterial(mjMaterial) {
  const material = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(
      mjMaterial.color.r,
      mjMaterial.color.g,
      mjMaterial.color.b
    ),
    roughness: 0.6,
    metalness: 0.1,
    transparent: mjMaterial.opacity < 1,
    opacity: mjMaterial.opacity,
  });

  return material;
}

export async function openEnvironment3D(envId, state) {
  console.log("openEnvironment3D called with envId:", envId, "state:", state);

  // Clean up any existing animation/render state before starting
  if (animationId) {
    console.log(" Found existing animationId:", animationId, "- cleaning up first");
    cancelAnimationFrame(animationId);
    animationId = null;
  }
  
  if (updateInterval) {
    console.log(" Found existing updateInterval - cleaning up first");
    clearInterval(updateInterval);
    updateInterval = null;
  }

  try {
    console.log("Starting function...");

    if (!state) {
      console.error("No state provided to openEnvironment3D");
      return;
    }

    console.log("State check passed");
    console.log("Step 1: Three.js is imported via ES modules");

    currentEnvId = envId;

    // Show modal
    const modal = document.getElementById("threejs-modal");
    if (!modal) {
      console.error("FATAL: Modal element not found!");
      return;
    }
    modal.classList.remove("hidden");
    console.log("Step 3: Modal shown");

    // Update title
    document.getElementById(
      "modal-title"
    ).textContent = `Environment ${envId} - 3D View`;

    // Wait for modal to be visible and have dimensions
    await new Promise((resolve) => setTimeout(resolve, 100));
    console.log("Step 4: Modal ready");

    // Load and parse MuJoCo model first
    if (!modelData) {
      console.log("Loading MuJoCo model data...");
      const parser = new MuJoCoModelParser();
      try {
        // Use relative path that's served by the web server
        modelData = await parser.loadFromXML("/workspace/humanoid.xml");
        console.log(
          " Model data loaded successfully! Bodies:",
          modelData.bodies.length,
          "Materials:",
          Object.keys(modelData.materials)
        );
        

        // Force using the loaded model data
        if (!modelData.bodies || modelData.bodies.length === 0) {
          throw new Error("No bodies found in model data");
        }
      } catch (error) {
        console.error(" Failed to load MuJoCo model:", error);
        throw error; // Just fail instead of falling back
      }
    }

    // Initialize Three.js scene
    try {
      console.log("About to initialize Three.js...");
      await initThreeJS(state);
      console.log("Three.js initialized successfully");

      // Start render loop
      animate(state);

      // Start updating state from orchestrator
      console.log("Setting up update interval for env", envId);
      updateInterval = setInterval(async () => {
        console.log("Update interval tick - checking orchestrator...");
        if (window.demoState?.orchestrator) {
          const newState = window.demoState.orchestrator.getEnvironmentState(envId);
          if (newState) {
            console.log("Got new state, calling updateRobotPose...");
            updateRobotPose(newState);
          } else {
            console.log("No new state available");
          }
        } else {
          console.log("No orchestrator available");
        }
      }, 50); // Update at 20Hz
      
      console.log(" Everything initialized. animationId:", animationId, "updateInterval:", updateInterval);
    } catch (error) {
      console.error("Failed somewhere in initialization:", error);
      console.error("Error stack:", error.stack);
      // Don't try to recover, just show the error
      alert("Failed to open 3D view: " + error.message);
    }
  } catch (outerError) {
    console.error("OUTER ERROR:", outerError);
    console.error("Stack:", outerError.stack);
    alert("Critical error: " + outerError.message);
  }
}

async function initThreeJS(state) {
  // Three.js is already imported as ES module

  // Get container
  const container = document.getElementById("threejs-container");
  
  // Clear any existing canvas elements first
  while (container.firstChild) {
    container.removeChild(container.firstChild);
  }
  
  const width = container.clientWidth;
  const height = container.clientHeight;

  console.log("Initializing Three.js with dimensions:", width, height);

  // Scene setup - match MuJoCo demo atmosphere
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0.15, 0.25, 0.35); // Dark blue background
  scene.fog = new THREE.Fog(0x263238, 5, 20); // Add fog for atmosphere

  // Camera - lower angle for more cinematic view
  camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 100);
  camera.position.set(3, 0.8, 4); // Lower and further back
  camera.lookAt(0, 0.7, 0); // Look at lower torso

  // Renderer
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(width, height);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap; // Soft shadows
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.2;
  renderer.outputEncoding = THREE.sRGBEncoding;
  container.appendChild(renderer.domElement);

  // Controls - OrbitControls is now a global, not part of THREE
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.minDistance = 1;
  controls.maxDistance = 10;
  controls.target.set(0, 0.7, 0); // Target lower torso for better view
  controls.update();

  // Lighting - match MuJoCo demo
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.1); // Very dim ambient
  scene.add(ambientLight);

  // Main spotlight targeting the robot
  const spotLight = new THREE.SpotLight(0xffffff, 2);
  spotLight.position.set(2, 5, 2);
  spotLight.angle = Math.PI / 6;
  spotLight.penumbra = 0.3;
  spotLight.decay = 2;
  spotLight.distance = 20;
  spotLight.castShadow = true;
  spotLight.shadow.mapSize.width = 2048;
  spotLight.shadow.mapSize.height = 2048;
  spotLight.shadow.camera.near = 0.5;
  spotLight.shadow.camera.far = 10;
  scene.add(spotLight);

  // Helper spotlight for visibility
  const helperLight = new THREE.DirectionalLight(0xffffff, 0.3);
  helperLight.position.set(-2, 3, 2);
  scene.add(helperLight);

  // Create checkered texture
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const context = canvas.getContext('2d');
  
  // Create checkered pattern matching the original
  const squareSize = 64;
  for (let i = 0; i < 8; i++) {
    for (let j = 0; j < 8; j++) {
      const isDark = (i + j) % 2 === 0;
      // Using colors from humanoid.xml grid texture
      context.fillStyle = isDark ? 'rgb(26, 51, 77)' : 'rgb(51, 77, 102)'; // rgb1=".1 .2 .3" rgb2=".2 .3 .4"
      context.fillRect(i * squareSize, j * squareSize, squareSize, squareSize);
    }
  }
  
  const checkerTexture = new THREE.CanvasTexture(canvas);
  checkerTexture.wrapS = THREE.RepeatWrapping;
  checkerTexture.wrapT = THREE.RepeatWrapping;
  checkerTexture.repeat.set(10, 10);

  // Create reflective floor with checkered pattern
  const floor = new Reflector(
    new THREE.PlaneGeometry(100, 100),
    {
      clipBias: 0.003,
      texture: checkerTexture,
      color: 0x777777,
      multisample: 4
    }
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = 0;
  scene.add(floor);

  // Create robot
  createRobot();

  // Target spotlight at robot
  if (robotGroup) {
    spotLight.target = robotGroup;
  }

  // Handle window resize - store the handler so we can remove it later
  resizeHandler = onWindowResize;
  window.addEventListener("resize", resizeHandler);
  
  // Initialize drag interaction
  dragStateManager = new DragStateManager(
    scene,
    renderer,
    camera,
    container,
    controls
  );
}

function loadThreeJS() {
  return new Promise((resolve) => {
    // Three.js and OrbitControls are already loaded in the main HTML
    if (window.THREE) {
      console.log("Three.js already loaded");
      resolve();
    } else {
      console.error("Three.js not found! Make sure it is loaded in the HTML.");
      resolve(); // Resolve anyway to avoid blocking
    }
  });
}

function addCoordinateLabels() {
  // Create sprite labels for axes
  const loader = new THREE.FontLoader();

  // For now, use colored boxes to indicate axes
  // Red = X, Green = Y, Blue = Z
  const labelGeometry = new THREE.BoxGeometry(0.1, 0.1, 0.1);

  const xLabel = new THREE.Mesh(
    labelGeometry,
    new THREE.MeshBasicMaterial({ color: 0xff0000 })
  );
  xLabel.position.set(2.2, 0, 0);
  scene.add(xLabel);

  const yLabel = new THREE.Mesh(
    labelGeometry,
    new THREE.MeshBasicMaterial({ color: 0x00ff00 })
  );
  yLabel.position.set(0, 2.2, 0);
  scene.add(yLabel);

  const zLabel = new THREE.Mesh(
    labelGeometry,
    new THREE.MeshBasicMaterial({ color: 0x0000ff })
  );
  zLabel.position.set(0, 0, 2.2);
  scene.add(zLabel);
}

function createRobot() {
  robotGroup = new THREE.Group();

  if (modelData && modelData !== false) {
    // Create robot from MuJoCo model data
    console.log("Creating robot from MuJoCo model data...");

    // Create a map to store body groups by name
    robotGroup.bodyMap = {};

    // Create material from model data
    const mjBodyMaterial = modelData.materials.body || null;
    
    // Create cross-hatch texture for body material
    const textureCanvas = document.createElement('canvas');
    textureCanvas.width = 128;
    textureCanvas.height = 128;
    const textureCtx = textureCanvas.getContext('2d');
    
    // Fill with base skin color
    textureCtx.fillStyle = 'rgb(204, 153, 102)'; // 0.8, 0.6, 0.4 in RGB
    textureCtx.fillRect(0, 0, 128, 128);
    
    // Draw cross-hatch pattern
    textureCtx.strokeStyle = 'rgba(255, 255, 255, 0.3)'; // White marks with transparency
    textureCtx.lineWidth = 1;
    
    // Draw diagonal lines in one direction
    for (let i = -128; i < 256; i += 8) {
      textureCtx.beginPath();
      textureCtx.moveTo(i, 0);
      textureCtx.lineTo(i + 128, 128);
      textureCtx.stroke();
    }
    
    // Draw diagonal lines in the other direction
    for (let i = -128; i < 256; i += 8) {
      textureCtx.beginPath();
      textureCtx.moveTo(i + 128, 0);
      textureCtx.lineTo(i, 128);
      textureCtx.stroke();
    }
    
    const bodyTexture = new THREE.CanvasTexture(textureCanvas);
    bodyTexture.wrapS = THREE.RepeatWrapping;
    bodyTexture.wrapT = THREE.RepeatWrapping;
    
    const bodyMaterial = new THREE.MeshPhysicalMaterial({
      map: bodyTexture,
      roughness: 0.6,
      metalness: 0.1,
      clearcoat: 0.1,
      clearcoatRoughness: 0.8
    });

    // Create groups for each body
    modelData.bodies.forEach((body) => {
      if (body.name === "world") return; // Skip world body

      const bodyGroup = new THREE.Group();
      bodyGroup.name = body.name;
      bodyGroup.bodyIndex = body.index;

      // Store in map for easy access
      robotGroup.bodyMap[body.name] = bodyGroup;
      robotGroup.bodyMap[body.index] = bodyGroup;

      // Create geoms for this body
      body.geoms.forEach((geom) => {
        let geometry;
        let mesh;
        
        // Debug log for key body parts
        if (body.name === "torso" || body.name === "thigh_right" || body.name === "head") {
          console.log(`Geom in ${body.name}: type=${geom.type}, size=${geom.size}, fromto=${geom.fromto}, pos=${geom.position}`);
        }

        switch (geom.type) {
          case "capsule":
            if (geom.fromto && geom.fromto.length === 6) {
              // Calculate capsule from fromto points
              const from = geom.fromto.slice(0, 3);
              const to = geom.fromto.slice(3, 6);
              const dx = to[0] - from[0];
              const dy = to[1] - from[1];
              const dz = to[2] - from[2];
              const length = Math.sqrt(dx*dx + dy*dy + dz*dz);
              const radius = geom.size[0] || 0.046;
              
              geometry = new THREE.CapsuleGeometry(radius, length, 8, 16);
              mesh = new THREE.Mesh(geometry, bodyMaterial);
              
              // Position at midpoint
              const midX = (from[0] + to[0]) / 2;
              const midY = (from[1] + to[1]) / 2;
              const midZ = (from[2] + to[2]) / 2;
              mesh.position.set(midX, midY, midZ);
              
              // Rotate to align with fromto vector
              if (Math.abs(dy) > 0.001) {
                const up = new THREE.Vector3(0, 1, 0);
                const dir = new THREE.Vector3(dx, dy, dz).normalize();
                mesh.quaternion.setFromUnitVectors(up, dir);
              }
            } else {
              // Use size attribute
              const radius = geom.size[0] || 0.046;
              const length = geom.size[1] ? geom.size[1] * 2 : 0.3;
              geometry = new THREE.CapsuleGeometry(radius, length, 8, 16);
              mesh = new THREE.Mesh(geometry, bodyMaterial);
              mesh.position.set(geom.position[0], geom.position[1], geom.position[2]);
            }
            break;
          case "sphere":
            geometry = new THREE.SphereGeometry(geom.size[0] || 0.05, 16, 16);
            mesh = new THREE.Mesh(geometry, bodyMaterial);
            mesh.position.set(geom.position[0], geom.position[1], geom.position[2]);
            break;
          case "box":
            geometry = new THREE.BoxGeometry(
              geom.size[0] * 2 || 0.1,
              geom.size[1] * 2 || 0.1,
              geom.size[2] * 2 || 0.1
            );
            mesh = new THREE.Mesh(geometry, bodyMaterial);
            mesh.position.set(geom.position[0], geom.position[1], geom.position[2]);
            break;
          default:
            // Default to sphere
            geometry = new THREE.SphereGeometry(0.05, 16, 16);
            mesh = new THREE.Mesh(geometry, bodyMaterial);
            mesh.position.set(geom.position[0], geom.position[1], geom.position[2]);
        }

        if (mesh) {
          // Cast shadows
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          // Set bodyID for drag interaction
          mesh.bodyID = body.index;
          bodyGroup.add(mesh);
        }
      });

      // For now, add all bodies directly to robotGroup to debug positioning
      robotGroup.add(bodyGroup);
      
      // Log the body hierarchy for debugging
      if (body.name === "torso" || body.name === "head" || body.name === "pelvis") {
        console.log(`Body ${body.name}: parent=${body.parent}, local pos=${body.position}`);
      }
    });
  } else {
    throw new Error("No model data available for robot creation");
  }

  // Enable shadows for the whole group
  robotGroup.traverse((child) => {
    if (child.isMesh) {
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });

  scene.add(robotGroup);
}

function createSimpleRobot() {
  // Simple fallback robot geometry
  const bodyMaterial = new THREE.MeshStandardMaterial({
    color: 0x4a9eff,
    roughness: 0.5,
    metalness: 0.3,
  });

  const jointMaterial = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.3,
    metalness: 0.7,
  });

  // Torso
  const torsoGeometry = new THREE.BoxGeometry(0.3, 0.5, 0.2);
  const torso = new THREE.Mesh(torsoGeometry, bodyMaterial);
  torso.position.y = 1;
  torso.castShadow = true;
  torso.receiveShadow = true;
  robotGroup.add(torso);

  // Head
  const headGeometry = new THREE.SphereGeometry(0.15, 16, 16);
  const head = new THREE.Mesh(headGeometry, bodyMaterial);
  head.position.y = 1.4;
  head.castShadow = true;
  robotGroup.add(head);

  // Joints (shoulders, hips, elbows, knees)
  const jointGeometry = new THREE.SphereGeometry(0.05, 8, 8);

  // Shoulders
  const leftShoulder = new THREE.Mesh(jointGeometry, jointMaterial);
  leftShoulder.position.set(-0.2, 1.2, 0);
  robotGroup.add(leftShoulder);

  const rightShoulder = new THREE.Mesh(jointGeometry, jointMaterial);
  rightShoulder.position.set(0.2, 1.2, 0);
  robotGroup.add(rightShoulder);

  // Arms
  const armGeometry = new THREE.CylinderGeometry(0.04, 0.04, 0.3);

  const leftUpperArm = new THREE.Mesh(armGeometry, bodyMaterial);
  leftUpperArm.position.set(-0.25, 1.05, 0);
  leftUpperArm.rotation.z = Math.PI / 8;
  leftUpperArm.castShadow = true;
  robotGroup.add(leftUpperArm);

  const rightUpperArm = new THREE.Mesh(armGeometry, bodyMaterial);
  rightUpperArm.position.set(0.25, 1.05, 0);
  rightUpperArm.rotation.z = -Math.PI / 8;
  rightUpperArm.castShadow = true;
  robotGroup.add(rightUpperArm);

  // Hips
  const leftHip = new THREE.Mesh(jointGeometry, jointMaterial);
  leftHip.position.set(-0.1, 0.75, 0);
  robotGroup.add(leftHip);

  const rightHip = new THREE.Mesh(jointGeometry, jointMaterial);
  rightHip.position.set(0.1, 0.75, 0);
  robotGroup.add(rightHip);

  // Legs
  const legGeometry = new THREE.CylinderGeometry(0.05, 0.05, 0.4);

  const leftUpperLeg = new THREE.Mesh(legGeometry, bodyMaterial);
  leftUpperLeg.position.set(-0.1, 0.55, 0);
  leftUpperLeg.castShadow = true;
  robotGroup.add(leftUpperLeg);

  const rightUpperLeg = new THREE.Mesh(legGeometry, bodyMaterial);
  rightUpperLeg.position.set(0.1, 0.55, 0);
  rightUpperLeg.castShadow = true;
  robotGroup.add(rightUpperLeg);

  // Lower legs
  const leftLowerLeg = new THREE.Mesh(legGeometry, bodyMaterial);
  leftLowerLeg.position.set(-0.1, 0.2, 0);
  leftLowerLeg.castShadow = true;
  robotGroup.add(leftLowerLeg);

  const rightLowerLeg = new THREE.Mesh(legGeometry, bodyMaterial);
  rightLowerLeg.position.set(0.1, 0.2, 0);
  rightLowerLeg.castShadow = true;
  robotGroup.add(rightLowerLeg);

  // Feet
  const footGeometry = new THREE.BoxGeometry(0.08, 0.04, 0.15);

  const leftFoot = new THREE.Mesh(footGeometry, bodyMaterial);
  leftFoot.position.set(-0.1, 0.02, 0.03);
  leftFoot.castShadow = true;
  robotGroup.add(leftFoot);

  const rightFoot = new THREE.Mesh(footGeometry, bodyMaterial);
  rightFoot.position.set(0.1, 0.02, 0.03);
  rightFoot.castShadow = true;
  robotGroup.add(rightFoot);
}

function updateRobotPose(state) {
  if (!robotGroup || !state || !state.observation) {
    return;
  }

  // Get body positions and rotations from physics
  const envState = window.demoState?.orchestrator?.getEnvironmentState(currentEnvId);
  if (!envState) {
    console.log("No envState available");
    return;
  }

  // Debug: Check what observation data we have
  console.log("Observation keys:", Object.keys(envState.observation));
  console.log("Has xpos:", !!envState.observation.xpos);
  console.log("Has xquat:", !!envState.observation.xquat);

  // Check if we have access to MuJoCo xpos and xquat data
  if (
    envState.observation &&
    envState.observation.xpos &&
    envState.observation.xquat
  ) {
    console.log("Using full body physics data");
    // Update each body's position and rotation
    if (robotGroup.bodyMap) {
      for (let bodyName in robotGroup.bodyMap) {
        if (typeof bodyName === "string") {
          // Skip numeric indices
          const bodyGroup = robotGroup.bodyMap[bodyName];
          const bodyIndex = bodyGroup.bodyIndex;

          if (
            bodyIndex &&
            envState.observation.xpos &&
            envState.observation.xquat
          ) {
            // Get position from xpos array (3 values per body)
            // Use the same coordinate conversion as the original demo
            const posIndex = bodyIndex * 3;
            if (posIndex + 2 < envState.observation.xpos.length) {
              bodyGroup.position.set(
                envState.observation.xpos[posIndex],      // X stays X
                envState.observation.xpos[posIndex + 2],  // Z -> Y
                -envState.observation.xpos[posIndex + 1]  // Y -> -Z
              );
            }

            // Get quaternion from xquat array (4 values per body)
            const quatIndex = bodyIndex * 4;
            if (quatIndex + 3 < envState.observation.xquat.length) {
              // Match the original demo's quaternion conversion
              // MuJoCo: [w, x, y, z], Three.js also uses [x, y, z, w] but with swizzling
              bodyGroup.quaternion.set(
                -envState.observation.xquat[quatIndex + 1],  // -x
                -envState.observation.xquat[quatIndex + 3],  // -z -> y
                envState.observation.xquat[quatIndex + 2],   // y -> z
                -envState.observation.xquat[quatIndex]        // -w
              );
            }
          }
        }
      }
    }
  } else {
    console.log("Using fallback position update");
    // Fallback to simple position update if full body data not available
    if (state.observation.bodyPos) {
      console.log("Updating robot position:", state.observation.bodyPos);

      // Convert MuJoCo coordinates to Three.js
      const mjPos = state.observation.bodyPos;
      const threePos = mujocoToThreePosition(mjPos);

      robotGroup.position.x = threePos.x;
      robotGroup.position.y = threePos.y;
      robotGroup.position.z = threePos.z;
    }
  }

  // Check if robot has fallen
  const torsoHeight = state.observation.bodyPos
    ? state.observation.bodyPos[2]
    : 1;
  if (torsoHeight < 0.1) {
    console.log("Robot has fallen! Torso height:", torsoHeight);
  }
}

function animate(state) {
  // Cancel any existing animation frame first
  if (animationId) {
    cancelAnimationFrame(animationId);
  }
  
  animationId = requestAnimationFrame(() => animate(state));

  // Update controls
  if (controls) {
    controls.update();
  }

  // Handle drag forces
  if (dragStateManager) {
    dragStateManager.update();
    
    const dragged = dragStateManager.physicsObject;
    if (dragged && dragged.bodyID && window.demoState?.orchestrator) {
      // Calculate force vector
      const force = dragStateManager.currentWorld.clone()
        .sub(dragStateManager.worldHit)
        .multiplyScalar(15); // Balanced force for responsive dragging
      
      // Convert to MuJoCo coordinates
      const mjForce = threeToMujocoPosition(force);
      const mjPoint = threeToMujocoPosition(dragStateManager.worldHit);
      
      // Send force to physics simulation
      window.demoState.orchestrator.applyForce(currentEnvId, dragged.bodyID, mjForce, mjPoint);
    } else if (dragStateManager.lastDraggedBody && !dragged) {
      // Drag ended, clear forces
      if (window.demoState?.orchestrator) {
        window.demoState.orchestrator.applyForce(currentEnvId, dragStateManager.lastDraggedBody, [0, 0, 0], [0, 0, 0]);
      }
      dragStateManager.lastDraggedBody = null;
    }
    
    // Track last dragged body
    if (dragged && dragged.bodyID) {
      dragStateManager.lastDraggedBody = dragged.bodyID;
    }
  }

  // Render
  if (renderer && scene && camera) {
    renderer.render(scene, camera);
  }
}

function onWindowResize() {
  const container = document.getElementById("threejs-container");
  if (!container) return;

  const width = container.clientWidth;
  const height = container.clientHeight;

  if (camera) {
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }

  if (renderer) {
    renderer.setSize(width, height);
  }
}

// Clean up when modal closes
export function closeModal() {
  console.log("closeModal called. animationId:", animationId, "updateInterval:", updateInterval);
  
  if (animationId) {
    cancelAnimationFrame(animationId);
    animationId = null;
  }

  if (updateInterval) {
    clearInterval(updateInterval);
    updateInterval = null;
  }

  // Clean up Three.js resources
  if (renderer) {
    renderer.dispose();
    renderer = null;
  }

  if (scene) {
    // Dispose of geometries and materials
    scene.traverse((object) => {
      if (object.geometry) object.geometry.dispose();
      if (object.material) {
        if (Array.isArray(object.material)) {
          object.material.forEach((material) => material.dispose());
        } else {
          object.material.dispose();
        }
      }
    });
    scene = null;
  }

  camera = null;
  
  // Dispose of controls properly
  if (controls) {
    controls.dispose();
    controls = null;
  }
  
  // Clean up drag state manager
  if (dragStateManager) {
    dragStateManager = null;
  }
  
  robotGroup = null;
  currentEnvId = null;
  
  // Reset modelData so it reloads fresh each time
  modelData = null;
  
  // Remove window resize handler
  if (resizeHandler) {
    window.removeEventListener("resize", resizeHandler);
    resizeHandler = null;
  }

  // Hide modal
  document.getElementById("threejs-modal").classList.add("hidden");
  
  console.log(" Modal cleanup complete");
}

// Three.js Modal for 3D environment visualization
// VERSION: 2024-06-01-00:08 - Added debug logging
// For now, using vanilla Three.js without ES6 modules for simplicity
let scene, camera, renderer, controls;
let currentEnvId = null;
let animationId = null;
let robotGroup = null;
let updateInterval = null;

export async function openEnvironment3D(envId, state) {
    console.log('openEnvironment3D called with envId:', envId, 'state:', state);
    currentEnvId = envId;
    
    // Show modal
    const modal = document.getElementById('threejs-modal');
    modal.classList.remove('hidden');
    
    // Update title
    document.getElementById('modal-title').textContent = `Environment ${envId} - 3D View`;
    
    // Wait for modal to be visible and have dimensions
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Initialize Three.js scene
    try {
        console.log('About to initialize Three.js...');
        await initThreeJS();
        console.log('Three.js initialized successfully');
        
        // Start render loop
        animate(state);
        
        // Start updating state from orchestrator
        console.log('Setting up update interval for env', envId);
        updateInterval = setInterval(async () => {
            console.log('Update interval tick - checking orchestrator...');
            if (window.mujocoOrchestrator) {
                console.log('Orchestrator found, getting state for env', envId);
                const newState = window.mujocoOrchestrator.getEnvironmentState(envId);
                console.log('Got state:', newState);
                if (newState) {
                    updateRobotPose(newState);
                } else {
                    console.log('No state returned for env', envId);
                }
            } else {
                console.log('No orchestrator found on window!');
            }
        }, 50); // Update at 20Hz
    } catch (error) {
        console.error('Failed to initialize Three.js:', error);
        alert('Failed to initialize 3D view. Check console for details.');
    }
}

async function initThreeJS() {
    // Load Three.js from CDN
    if (!window.THREE) {
        await loadThreeJS();
    }
    
    // Get container
    const container = document.getElementById('threejs-container');
    const width = container.clientWidth;
    const height = container.clientHeight;
    
    console.log('Initializing Three.js with dimensions:', width, height);
    
    // Scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x2a2a2a);
    scene.fog = new THREE.Fog(0x2a2a2a, 10, 50);
    
    // Camera
    camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 100);
    camera.position.set(2, 2, 3);
    camera.lookAt(0, 0.5, 0);
    
    // Renderer
    renderer = new THREE.WebGLRenderer({ 
        antialias: true,
        powerPreference: "high-performance"
    });
    renderer.setSize(width, height);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.innerHTML = '';
    container.appendChild(renderer.domElement);
    
    // Controls
    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.minDistance = 1;
    controls.maxDistance = 10;
    controls.target.set(0, 0.5, 0);
    controls.update();
    
    // Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);
    
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(5, 10, 5);
    directionalLight.castShadow = true;
    directionalLight.shadow.camera.near = 0.1;
    directionalLight.shadow.camera.far = 50;
    directionalLight.shadow.camera.left = -5;
    directionalLight.shadow.camera.right = 5;
    directionalLight.shadow.camera.top = 5;
    directionalLight.shadow.camera.bottom = -5;
    scene.add(directionalLight);
    
    // Grid helper (XZ plane for Three.js Y-up system)
    const gridHelper = new THREE.GridHelper(10, 20, 0x444444, 0x333333);
    scene.add(gridHelper);
    
    // Axes helper with labels
    const axesHelper = new THREE.AxesHelper(2);
    scene.add(axesHelper);
    
    // Add coordinate labels
    addCoordinateLabels();
    
    // Ground plane
    const groundGeometry = new THREE.PlaneGeometry(10, 10);
    const groundMaterial = new THREE.MeshStandardMaterial({ 
        color: 0x1a1a1a,
        roughness: 0.8,
        metalness: 0.2
    });
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.01;
    ground.receiveShadow = true;
    scene.add(ground);
    
    // Create robot
    createHumanoidRobot();
    
    // Handle window resize
    window.addEventListener('resize', onWindowResize);
}

function loadThreeJS() {
    return new Promise((resolve, reject) => {
        // Load Three.js
        const threeScript = document.createElement('script');
        threeScript.src = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
        threeScript.onload = () => {
            // Load OrbitControls
            const orbitScript = document.createElement('script');
            orbitScript.src = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r128/examples/js/controls/OrbitControls.js';
            orbitScript.onload = resolve;
            orbitScript.onerror = reject;
            document.head.appendChild(orbitScript);
        };
        threeScript.onerror = reject;
        document.head.appendChild(threeScript);
    });
}

function addCoordinateLabels() {
    // Create sprite labels for axes
    const loader = new THREE.FontLoader();
    
    // For now, use colored boxes to indicate axes
    // Red = X, Green = Y, Blue = Z
    const labelGeometry = new THREE.BoxGeometry(0.1, 0.1, 0.1);
    
    const xLabel = new THREE.Mesh(labelGeometry, new THREE.MeshBasicMaterial({ color: 0xff0000 }));
    xLabel.position.set(2.2, 0, 0);
    scene.add(xLabel);
    
    const yLabel = new THREE.Mesh(labelGeometry, new THREE.MeshBasicMaterial({ color: 0x00ff00 }));
    yLabel.position.set(0, 2.2, 0);
    scene.add(yLabel);
    
    const zLabel = new THREE.Mesh(labelGeometry, new THREE.MeshBasicMaterial({ color: 0x0000ff }));
    zLabel.position.set(0, 0, 2.2);
    scene.add(zLabel);
}

function createHumanoidRobot() {
    // Create robot group
    robotGroup = new THREE.Group();
    robotGroup.position.y = 0;
    
    const bodyMaterial = new THREE.MeshStandardMaterial({ 
        color: 0x4a9eff,
        roughness: 0.5,
        metalness: 0.3
    });
    
    const jointMaterial = new THREE.MeshStandardMaterial({ 
        color: 0xffffff,
        roughness: 0.3,
        metalness: 0.7
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
    
    scene.add(robotGroup);
}

function updateRobotPose(state) {
    console.log('updateRobotPose called with state:', state);
    if (!robotGroup || !state || !state.observation) {
        console.log('Early return - missing:', {robotGroup: !!robotGroup, state: !!state, observation: !!(state?.observation)});
        return;
    }
    
    // Update robot position from physics
    if (state.observation.bodyPos) {
        // MuJoCo uses Z-up, Three.js uses Y-up
        // So MuJoCo's Z becomes Three.js Y, and MuJoCo's Y becomes Three.js -Z
        const x = state.observation.bodyPos[0] || 0;
        const y = state.observation.bodyPos[2] || 0; // Z -> Y
        const z = -(state.observation.bodyPos[1] || 0); // Y -> -Z
        
        // Debug log every 20 updates (1 second)
        if (Math.random() < 0.05) {
            console.log('3D Update - MuJoCo pos:', state.observation.bodyPos, '-> Three.js pos:', {x, y, z});
        }
        
        robotGroup.position.set(x, y, z);
    }
    
    // Check if robot has fallen (torso height < 0.1m in MuJoCo coordinates)
    const torsoHeight = state.observation.bodyPos ? state.observation.bodyPos[2] : 1.282;
    if (torsoHeight < 0.1) {
        // Robot has fallen - lay it on the ground
        robotGroup.rotation.x = Math.PI / 2; // Rotate to lying position
        robotGroup.position.y = Math.max(0.1, robotGroup.position.y); // Keep above ground
    } else {
        // Robot is standing
        robotGroup.rotation.x = 0;
    }
    
    // TODO: Update individual joint rotations from qpos data
}

function animate(state) {
    animationId = requestAnimationFrame(() => animate(state));
    
    // Update controls
    if (controls) {
        controls.update();
    }
    
    // No more fake rotation - pose is updated by updateRobotPose()
    
    // Render
    if (renderer && scene && camera) {
        renderer.render(scene, camera);
    }
}

function onWindowResize() {
    const container = document.getElementById('threejs-container');
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
                    object.material.forEach(material => material.dispose());
                } else {
                    object.material.dispose();
                }
            }
        });
        scene = null;
    }
    
    camera = null;
    controls = null;
    robotGroup = null;
    currentEnvId = null;
    
    // Hide modal
    document.getElementById('threejs-modal').classList.add('hidden');
}

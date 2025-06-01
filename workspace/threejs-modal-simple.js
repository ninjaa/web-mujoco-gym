// Simple Three.js Modal - using global THREE instead of modules
let scene, camera, renderer, controls;
let currentEnvId = null;
let animationId = null;
let robotGroup = null;

// Make functions globally accessible
window.openEnvironment3D = async function(envId, state) {
    currentEnvId = envId;
    
    // Show modal
    const modal = document.getElementById('threejs-modal');
    modal.classList.remove('hidden');
    
    // Update title
    document.getElementById('modal-title').textContent = `Environment ${envId} - 3D View`;
    
    // Initialize Three.js scene after a short delay
    setTimeout(() => {
        initThreeJS();
        animate(state);
    }, 100);
}

// Add alias for compatibility
window.openModal = function(envId) {
    // Get the state from the UI controls
    const uiModule = window.uiControls;
    const state = uiModule ? uiModule.state : null;
    window.openEnvironment3D(envId, state);
}

function initThreeJS() {
    // Get container
    const container = document.getElementById('threejs-container');
    if (!container) {
        console.error('Three.js container not found!');
        return;
    }
    
    const width = container.clientWidth || 800;
    const height = container.clientHeight || 600;
    
    console.log('Initializing Three.js with dimensions:', width, height);
    
    // Scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x2a2a2a);
    
    // Camera
    camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 100);
    camera.position.set(2, 2, 3);
    camera.lookAt(0, 0.5, 0);
    
    // Renderer
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    renderer.shadowMap.enabled = true;
    container.innerHTML = '';
    container.appendChild(renderer.domElement);
    
    // Check if OrbitControls exists
    if (typeof THREE.OrbitControls !== 'undefined') {
        controls = new THREE.OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.dampingFactor = 0.05;
        controls.target.set(0, 0.5, 0);
        controls.update();
    }
    
    // Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);
    
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(5, 10, 5);
    directionalLight.castShadow = true;
    scene.add(directionalLight);
    
    // Grid
    const gridHelper = new THREE.GridHelper(10, 20, 0x444444, 0x333333);
    scene.add(gridHelper);
    
    // Axes
    const axesHelper = new THREE.AxesHelper(2);
    scene.add(axesHelper);
    
    // Ground
    const groundGeometry = new THREE.PlaneGeometry(10, 10);
    const groundMaterial = new THREE.MeshStandardMaterial({ 
        color: 0x1a1a1a,
        roughness: 0.8
    });
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.01;
    ground.receiveShadow = true;
    scene.add(ground);
    
    // Simple robot
    createSimpleRobot();
    
    // Handle resize
    window.addEventListener('resize', onWindowResize);
}

function createSimpleRobot() {
    robotGroup = new THREE.Group();
    
    const bodyMaterial = new THREE.MeshStandardMaterial({ 
        color: 0x4a9eff,
        roughness: 0.5,
        metalness: 0.3
    });
    
    // Torso
    const torso = new THREE.Mesh(
        new THREE.BoxGeometry(0.3, 0.5, 0.2),
        bodyMaterial
    );
    torso.position.y = 1;
    torso.castShadow = true;
    robotGroup.add(torso);
    
    // Head
    const head = new THREE.Mesh(
        new THREE.SphereGeometry(0.15, 16, 16),
        bodyMaterial
    );
    head.position.y = 1.4;
    head.castShadow = true;
    robotGroup.add(head);
    
    // Arms
    const leftArm = new THREE.Mesh(
        new THREE.CylinderGeometry(0.04, 0.04, 0.3),
        bodyMaterial
    );
    leftArm.position.set(-0.25, 1.05, 0);
    leftArm.rotation.z = Math.PI / 8;
    robotGroup.add(leftArm);
    
    const rightArm = new THREE.Mesh(
        new THREE.CylinderGeometry(0.04, 0.04, 0.3),
        bodyMaterial
    );
    rightArm.position.set(0.25, 1.05, 0);
    rightArm.rotation.z = -Math.PI / 8;
    robotGroup.add(rightArm);
    
    // Legs
    const leftLeg = new THREE.Mesh(
        new THREE.CylinderGeometry(0.05, 0.05, 0.8),
        bodyMaterial
    );
    leftLeg.position.set(-0.1, 0.4, 0);
    robotGroup.add(leftLeg);
    
    const rightLeg = new THREE.Mesh(
        new THREE.CylinderGeometry(0.05, 0.05, 0.8),
        bodyMaterial
    );
    rightLeg.position.set(0.1, 0.4, 0);
    robotGroup.add(rightLeg);
    
    scene.add(robotGroup);
}

function animate(state) {
    animationId = requestAnimationFrame(() => animate(state));
    
    // Update controls
    if (controls) {
        controls.update();
    }
    
    // Get current environment state if orchestrator exists
    if (state && state.orchestrator && currentEnvId !== null) {
        const env = state.orchestrator.environments[currentEnvId];
        if (env && env.observation && robotGroup) {
            // Update robot position based on actual state
            const bodyPos = env.observation.bodyPos;
            if (bodyPos) {
                robotGroup.position.x = bodyPos[0] || 0;
                robotGroup.position.z = bodyPos[1] || 0;  // MuJoCo Y -> Three.js Z
                robotGroup.position.y = bodyPos[2] || 0;  // MuJoCo Z -> Three.js Y
            }
            
            // You could also update joint rotations here if needed
            // based on env.observation.qpos
        }
    }
    
    // Rotate robot for visual effect when no data
    if (robotGroup && (!state || !state.orchestrator)) {
        robotGroup.rotation.y += 0.005;
    }
    
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

// Clean up
window.closeModal = function() {
    console.log('Closing modal...');
    
    if (animationId) {
        cancelAnimationFrame(animationId);
        animationId = null;
    }
    
    if (renderer) {
        renderer.dispose();
        renderer = null;
    }
    
    scene = null;
    camera = null;
    controls = null;
    robotGroup = null;
    
    document.getElementById('threejs-modal').classList.add('hidden');
}

// Add event listeners for closing
document.addEventListener('DOMContentLoaded', function() {
    // Close on backdrop click
    const modal = document.getElementById('threejs-modal');
    if (modal) {
        modal.addEventListener('click', function(e) {
            if (e.target === modal) {
                closeModal();
            }
        });
    }
    
    // Close on ESC key
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            const modal = document.getElementById('threejs-modal');
            if (modal && !modal.classList.contains('hidden')) {
                closeModal();
            }
        }
    });
});

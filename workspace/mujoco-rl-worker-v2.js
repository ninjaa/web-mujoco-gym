// MuJoCo RL Worker - Runs physics simulation in a Web Worker

// Import MuJoCo WASM module
importScripts('./enhanced-state-extractor.js');

let mujoco = null;
let model = null;
let state = null;  
let simulation = null;
let envConfig = null;
let envState = null;
let modelConfig = null;
let dragState = null; // Store current drag state
let modelLoaded = false;
let currentRewardFunction = null;
let enhancedExtractor = null; // Enhanced state extractor instance
let dragMissingLogged = false; // Track if we've logged missing dragState

// Debug: Track worker identity
const workerId = Math.random().toString(36).substr(2, 9);
console.log(`🔷 Worker ${workerId} created`);

// Add periodic dragState status check
setInterval(() => {
    if (dragState && dragState.active) {
        console.log(`🔷 Worker ${workerId}: dragState still active for body ${dragState.bodyId}, force: ${dragState.forceMag?.toFixed(0)}N`);
    }
}, 1000);

// Initialize MuJoCo when worker starts
self.onmessage = async function(e) {
    const { type, data, id } = e.data;
    
    if (type === 'error' && data && data.envId !== undefined) {
        console.error('Worker received error:', data);
        return;
    }
    
    try {
        switch (type) {
            case 'init':
                console.log(`🔷 Worker ${workerId} initializing for envId: ${data.envId}`);
                await initializeMuJoCo(data, id);
                break;
                
            case 'step':
                if (simulation) {
                    // Check if this step is for the right environment
                    if (data.envId !== envConfig?.envId) {
                        console.log(`⚠️ Step message for envId ${data.envId} but worker is for envId ${envConfig?.envId}`);
                    }
                    stepSimulation(data, id);
                } else {
                    throw new Error('Simulation not initialized');
                }
                break;
                
            case 'reset':
                if (simulation) {
                    resetEnvironment(data, id);
                } else {
                    throw new Error('Simulation not initialized');
                }
                break;
                
            case 'getState':
                if (simulation) {
                    getEnvironmentState(data, id);
                } else {
                    throw new Error('Simulation not initialized');
                }
                break;
                
            case 'applyForce':
                if (simulation && mujoco) {
                    console.log(`🎯 Worker received applyForce message for envId: ${data.envId}, worker configured for envId: ${envConfig?.envId}`);
                    applyForce(data, id);
                } else {
                    throw new Error('Simulation not initialized');
                }
                break;
                
            case 'clearActuators':
                if (simulation && simulation.ctrl) {
                    for (let i = 0; i < simulation.ctrl.length; i++) {
                        simulation.ctrl[i] = 0;
                    }
                    console.log(`Worker: Cleared ${simulation.ctrl.length} actuator controls for envId ${data.envId}`);
                    // Optionally, send a confirmation back to the orchestrator
                    self.postMessage({
                        type: 'actuatorsCleared',
                        id: id, // Use the orchestrator's message ID for correlation
                        data: {
                            envId: data.envId,
                            clearedControls: simulation.ctrl.length
                        }
                    });
                } else {
                    console.error(`Worker: Could not clear actuators for envId ${data.envId}. Simulation or ctrl array not found.`);
                }
                break;
                
            case 'getTextureData':
                if (model) {
                    getTextureData(data, id);
                } else {
                    throw new Error('Model not initialized');
                }
                break;
                
            default:
                throw new Error(`Unknown message type: ${type}`);
        }
    } catch (error) {
        console.error('Worker error:', error);
        self.postMessage({
            type: 'error',
            id: id,
            data: {
                error: error.message,
                stack: error.stack
            }
        });
    }
};

async function initializeMuJoCo(config, id) {
    console.log('Worker initializing MuJoCo...');
    
    try {
        // Import MuJoCo module dynamically
        const mujocoModule = await import('/dist/mujoco_wasm.js');
        mujoco = await mujocoModule.default();
        
        console.log('MuJoCo loaded successfully');
        
        // Create virtual filesystem
        mujoco.FS.mkdir('/working');
        mujoco.FS.mount(mujoco.MEMFS, { root: '.' }, '/working');
        
        const envType = config.envType || 'humanoid';
        const envId = config.envId || 0;
        
        // Get model XML - use the real humanoid.xml for humanoid
        let modelXML;
        if (envType === 'humanoid') {
            const response = await fetch('/workspace/humanoid.xml');
            modelXML = await response.text();
        } else {
            // Use simple inline models for other types
            const modelData = getSimpleModel(envType);
            modelXML = modelData.xml;
        }
        
        // Store model config for name mappings
        modelConfig = getModelConfig(envType);
        
        // Write model to filesystem
        const modelPath = '/working/model.xml';
        mujoco.FS.writeFile(modelPath, modelXML);
        
        // Initialize simulation with error handling
        try {
            model = new mujoco.Model(modelPath);
            state = new mujoco.State(model);
            simulation = new mujoco.Simulation(model, state);
            // Initialize enhanced state extractor
            if (typeof EnhancedStateExtractor !== 'undefined') {
                enhancedExtractor = new EnhancedStateExtractor();
            }
            
            // Debug: Check available force methods
            console.log('Force methods available:');
            console.log('  simulation.applyForce:', typeof simulation.applyForce);
            console.log('  simulation.xfrc_applied:', simulation.xfrc_applied ? 'array length ' + simulation.xfrc_applied.length : 'undefined');
            console.log('  simulation.qfrc_applied:', simulation.qfrc_applied ? 'array length ' + simulation.qfrc_applied.length : 'undefined');
            console.log('  model.nbody:', model.nbody, '(number of bodies)');
            console.log('  model.nv:', model.nv, '(degrees of freedom)');
        } catch (error) {
            throw new Error(`Failed to create simulation: ${error.message}`);
        }
        
        console.log(`Worker initialized MuJoCo for env ${envId} with model ${envType}, nbody: ${model.nbody}, nu: ${model.nu}`);
        
        // Initialize environment state
        envState = {
            stepCount: 0,
            totalReward: 0,
            lastX: 0
        };
        
        // Store config
        envConfig = config;
        
        // Reset to initial state
        resetEnvironment({ envId: envId });
        
        // Initialize for current environment
        self.postMessage({
            type: 'initialized',
            id: id,
            envId: envId
        });
        
    } catch (error) {
        console.error('MuJoCo initialization error:', error);
        self.postMessage({
            type: 'error',
            id: id,
            data: {
                envId: config.envId,
                error: error.message || 'Failed to initialize MuJoCo'
            }
        });
    }
}

// Model configurations for name-to-index mappings
function getModelConfig(envType) {
    const configs = {
        'humanoid': {
            bodies: {
                torso: 1,  // torso is the first body after world in humanoid.xml
                // We can add more mappings as needed without changing the XML
            }
        },
        'pendulum': {
            bodies: {
                pole: 1
            }
        }
    };
    
    return configs[envType] || configs['humanoid'];
}

// Simple models for non-humanoid types
function getSimpleModel(envType) {
    // Start with very simple models to avoid memory issues
    const models = {
        'pendulum': `
<mujoco>
    <option timestep="0.02"/>
    <worldbody>
        <light diffuse="1 1 1" pos="0 0 3" dir="0 0 -1"/>
        <geom name="floor" type="plane" size="10 10 0.1" rgba="0.8 0.8 0.8 1"/>
        
        <body name="pole" pos="0 0 1">
            <joint name="hinge" type="hinge" axis="0 1 0" damping="0.1"/>
            <geom name="pole_geom" type="capsule" size="0.05" fromto="0 0 0 0 0 1" rgba="0 0.7 0.7 1" mass="1"/>
        </body>
    </worldbody>
    
    <actuator>
        <motor joint="hinge" ctrlrange="-3 3" ctrllimited="true"/>
    </actuator>
</mujoco>`,

        'ant': `
<mujoco>
    <option timestep="0.02"/>
    <worldbody>
        <light diffuse="1 1 1" pos="0 0 3" dir="0 0 -1"/>
        <geom name="floor" type="plane" size="10 10 0.1" rgba="0.8 0.8 0.8 1"/>
        
        <!-- Simplified ant -->
        <body name="torso" pos="0 0 0.5">
            <joint name="root" type="free"/>
            <geom name="torso_geom" type="box" size="0.2 0.2 0.05" rgba="0.5 0.3 0.1 1" mass="5"/>
            
            <!-- Single leg for testing -->
            <body name="leg1" pos="0.2 0 0">
                <joint name="hip1" type="hinge" axis="0 0 1" range="-30 30"/>
                <geom name="leg1_geom" type="capsule" size="0.04" fromto="0 0 0 0.2 0 0" rgba="0.5 0.3 0.1 1" mass="0.5"/>
            </body>
        </body>
    </worldbody>
    
    <actuator>
        <motor joint="hip1" ctrlrange="-1 1" ctrllimited="true"/>
    </actuator>
</mujoco>`,

        'cheetah': `
<mujoco>
    <option timestep="0.02"/>
    <worldbody>
        <light diffuse="1 1 1" pos="0 0 3" dir="0 0 -1"/>
        <geom name="floor" type="plane" size="10 10 0.1" rgba="0.8 0.8 0.8 1"/>
        
        <!-- Simple cheetah body -->
        <body name="torso" pos="0 0 0.3">
            <joint name="root" type="free"/>
            <geom name="torso_geom" type="box" size="0.3 0.1 0.05" rgba="0.8 0.6 0.2 1" mass="5"/>
        </body>
    </worldbody>
</mujoco>`,

        'humanoid': `
<mujoco>
    <option timestep="0.02"/>
    <worldbody>
        <light diffuse="1 1 1" pos="0 0 3" dir="0 0 -1"/>
        <geom name="floor" type="plane" size="10 10 0.1" rgba="0.8 0.8 0.8 1"/>
        
        <!-- Very simple humanoid -->
        <body name="torso" pos="0 0 1">
            <joint name="root" type="free"/>
            <geom name="torso_geom" type="box" size="0.1 0.05 0.2" rgba="0.3 0.3 0.8 1" mass="5"/>
        </body>
    </worldbody>
</mujoco>`
    };
    
    const config = models[envType] || models['pendulum'];
    return {
        xml: config
    };
}

function stepSimulation(data, id) {
    if (!simulation || !model) return;
    
    const { actions, envId } = data || {};
    
    // Removed noisy step logs - only log when drag is active
    
    // Debug: Only log dragState status when it exists
    if (dragState && dragState.active) {
        console.log(`🔷 Worker ${workerId} stepSimulation for envId ${envId}: dragState ACTIVE for body ${dragState.bodyId}, force: ${dragState.forceMag?.toFixed(0)}N`);
    }
    
    // Debug: Log dragState status at start of physics step
    if (dragState && dragState.active && !dragState.startLogged) {
        console.log('📍 stepSimulation START - dragState is ACTIVE:', dragState.bodyId, 'force:', dragState.forceMag?.toFixed(0) + 'N');
        dragState.startLogged = true;
    }
    
    // Ensure envState is initialized
    if (!envState) {
        envState = {
            stepCount: 0,
            totalReward: 0,
            lastX: 0
        };
    }
    
    try {
        // Apply actions (if any)
        if (actions && actions.length > 0) {
            // The humanoid has 21 actuators
            const numActuators = model.nu;
            
            // Log action strength when drag is active
            if (dragState && dragState.active) {
                const actionMag = Math.sqrt(actions.reduce((sum, a) => sum + a*a, 0));
                console.log(`🤖 Applying CleanRL actions during drag: magnitude=${actionMag.toFixed(3)}, max=${Math.max(...actions.map(Math.abs)).toFixed(3)}`);
            }
            
            for (let i = 0; i < Math.min(actions.length, numActuators); i++) {
                simulation.ctrl[i] = actions[i];
            }
        }
        
        // Debug: Check dragState status
        if (!dragState) {
            // Log once when dragState is missing
            if (!dragMissingLogged) {
                console.log('❌ No dragState during physics step');
                dragMissingLogged = true;
            }
        } else {
            // Always log when dragState exists and is active
            if (dragState.active && !dragState.stepLogged) {
                console.log('🔍 DragState ACTIVE in physics step:', dragState.bodyId, 'force mag:', dragState.forceMag?.toFixed(0));
                dragState.stepLogged = true;
            }
        }
        
        // Apply drag forces if active
        if (dragState && dragState.active) {
            const { bodyId, force, point } = dragState;
            const forceMag = Math.sqrt(force[0]**2 + force[1]**2 + force[2]**2);
            console.log(`🚀 FOUND ACTIVE DRAG STATE in physics! Body ${bodyId}, force: ${forceMag.toFixed(0)}N`);
            // Only log significant forces to reduce noise
            if (forceMag > 1000) {
                console.log(`🎯 PHYSICS STEP: Applying force to body ${bodyId}: magnitude=${forceMag.toFixed(0)}N, upward=${force[2].toFixed(0)}N`);
            }
            
            // ALWAYS use xfrc_applied directly - applyForce method doesn't seem to work
            if (simulation.xfrc_applied) {
                // CORRECT: Use xfrc_applied for external body forces (MuJoCo official API)
                console.log(`📌 Using xfrc_applied method for body ${bodyId}`);
                const forceIndex = bodyId * 6; // Each body has 6 DOF (3 force + 3 torque)
                console.log(`  xfrc_applied.length: ${simulation.xfrc_applied.length}, forceIndex: ${forceIndex}, bodyId: ${bodyId}`);
                
                if (forceIndex + 5 < simulation.xfrc_applied.length) {
                    // Apply forces (MuJoCo will clear these after each step)
                    simulation.xfrc_applied[forceIndex] = force[0];
                    simulation.xfrc_applied[forceIndex + 1] = force[1];
                    simulation.xfrc_applied[forceIndex + 2] = force[2];
                    // Keep torques at zero
                    simulation.xfrc_applied[forceIndex + 3] = 0;
                    simulation.xfrc_applied[forceIndex + 4] = 0;
                    simulation.xfrc_applied[forceIndex + 5] = 0;
                    
                    console.log(`✅ Applied force to xfrc_applied[${forceIndex}]: [${force[0].toFixed(0)}, ${force[1].toFixed(0)}, ${force[2].toFixed(0)}]`);
                    console.log(`  Force values set in array:`, 
                        simulation.xfrc_applied[forceIndex].toFixed(0),
                        simulation.xfrc_applied[forceIndex + 1].toFixed(0),
                        simulation.xfrc_applied[forceIndex + 2].toFixed(0)
                    );
                } else {
                    console.error(`❌ forceIndex ${forceIndex} out of bounds for xfrc_applied length ${simulation.xfrc_applied.length}`);
                }
            } else if (simulation.qfrc_applied) {
                // FALLBACK: Use qfrc_applied for generalized forces (less suitable for drag)
                console.log('Using qfrc_applied array method (fallback)');
                
                // Apply force to all joints connected to this body
                // This is a simplified approach - ideally we'd use mj_applyFT
                const nv = simulation.qfrc_applied.length;
                console.log(`qfrc_applied length: ${nv}, applying forces...`);
                
                // Apply force to relevant DOF - simplified for torso/arm movements
                if (bodyId >= 0 && bodyId < nv / 6) {
                    const baseIndex = bodyId * 6;
                    if (baseIndex + 5 < nv) {
                        simulation.qfrc_applied[baseIndex] += force[0];     // Full force - no scaling
                        simulation.qfrc_applied[baseIndex + 1] += force[1];
                        simulation.qfrc_applied[baseIndex + 2] += force[2];
                        console.log(`Applied forces to qfrc_applied[${baseIndex}:${baseIndex+2}]:`, 
                                  [simulation.qfrc_applied[baseIndex], 
                                   simulation.qfrc_applied[baseIndex+1], 
                                   simulation.qfrc_applied[baseIndex+2]]);
                    }
                }
            } else {
                console.log('No known force application method found');
            }
        }
        
        // Debug: Check xfrc_applied values right before step
        if (dragState && dragState.active && simulation.xfrc_applied) {
            const bodyId = dragState.bodyId;
            const forceIndex = bodyId * 6;
            if (forceIndex + 2 < simulation.xfrc_applied.length) {
                const fx = simulation.xfrc_applied[forceIndex];
                const fy = simulation.xfrc_applied[forceIndex + 1];
                const fz = simulation.xfrc_applied[forceIndex + 2];
                const mag = Math.sqrt(fx*fx + fy*fy + fz*fz);
                console.log(`🔥 RIGHT BEFORE step(): xfrc_applied[${forceIndex}] = [${fx.toFixed(0)}, ${fy.toFixed(0)}, ${fz.toFixed(0)}], magnitude: ${mag.toFixed(0)}N`);
            }
        }
        
        // Step physics (this will apply the forces we just set)
        simulation.step();
        
        // MuJoCo automatically clears xfrc_applied after each step
        
        // Clear old dragState if it's been around too long (more than 500ms)
        // Increased timeout since drag updates come every ~50ms from 3D view
        if (dragState && dragState.timestamp && Date.now() - dragState.timestamp > 500) {
            console.log(`🟢 Clearing old dragState after physics step (age: ${Date.now() - dragState.timestamp}ms)`);
            dragState = null;
        }
        
        // Get observation after step
        const observation = getObservation();
        
        if (!observation) {
            console.error('Failed to get observation after step');
            return;
        }
        
        // Calculate reward (simple forward progress reward for now)
        const reward = calculateReward();
        
        // Check if done (simple height check)
        const done = checkDone();
        
        // Update environment state
        envState.stepCount++;
        envState.totalReward += reward;
        
        self.postMessage({
            type: 'step_result',
            id: id,
            data: {
                envId: envId || envConfig?.envId || 0,
                observation: observation,
                reward: reward,
                done: done,
                info: {
                    stepCount: envState.stepCount,
                    totalReward: envState.totalReward
                }
            }
        });
        
    } catch (error) {
        self.postMessage({
            type: 'error',
            id: id,
            data: {
                envId: envId || envConfig?.envId || 0,
                error: error.message
            }
        });
    }
}

function getObservation() {
    if (!simulation || !model) return null;
    
    // Use model config to get the right body, fallback to index 1 if not specified
    const trackedBodyName = 'torso';  // Could make this configurable
    const bodyIndex = (modelConfig && modelConfig.bodies && modelConfig.bodies[trackedBodyName]) || 1;
    
    let bodyPos = [0, 0, 0];
    try {
        if (bodyIndex < model.nbody) {
            const xposOffset = bodyIndex * 3;
            bodyPos = [
                simulation.xpos[xposOffset], 
                simulation.xpos[xposOffset + 1], 
                simulation.xpos[xposOffset + 2]
            ];
        }
    } catch (e) {
        console.error('Failed to get body position:', e);
    }
    
    // Get all body positions (xpos) for full animation
    const xpos = [];
    for (let i = 0; i < model.nbody * 3; i++) {
        xpos.push(simulation.xpos[i]);
    }
    
    // Get all body quaternions (xquat) for full animation
    const xquat = [];
    for (let i = 0; i < model.nbody * 4; i++) {
        xquat.push(simulation.xquat[i]);
    }
    
    // Get joint positions for state
    const qpos = [];
    for (let i = 0; i < model.nq; i++) {
        qpos.push(simulation.qpos[i]);
    }
    
    // Get joint velocities
    const qvel = [];
    for (let i = 0; i < model.nv; i++) {
        qvel.push(simulation.qvel[i]);
    }
    
    // Extract enhanced state if extractor is available
    let enhancedState = null;
    if (enhancedExtractor) {
        try {
            enhancedState = enhancedExtractor.extractFullState(simulation, model, false);
        } catch (e) {
            console.error('Failed to extract enhanced state:', e);
        }
    }
    
    // For visualization, we mainly care about the torso position
    return {
        bodyPos: bodyPos,  
        qpos: qpos,
        qvel: qvel,
        xpos: xpos,    // All body positions
        xquat: xquat,  // All body rotations
        time: simulation.time,
        actions: simulation.ctrl ? Array.from(simulation.ctrl).slice(0, model.nu) : [],
        // Add enhanced state for PPO training
        enhancedState: enhancedState
    };
}

function calculateReward() {
    if (!simulation || !model || !envState) return 0;
    
    // Different reward functions for different models
    if (envConfig.envType === 'pendulum') {
        // Pendulum: reward for staying upright
        const angle = simulation.qpos[0];
        return Math.cos(angle);
    } else {
        // Other robots: reward for forward progress
        let bodyIndex = 1; // torso is usually body 1
        let currentX = 0;
        
        try {
            if (bodyIndex < model.nbody) {
                const xposOffset = bodyIndex * 3;
                currentX = simulation.xpos[xposOffset];
            }
        } catch (e) {
            // Body not found
        }
        
        const progress = currentX - envState.lastX;
        envState.lastX = currentX;
        
        // Small penalty for energy use
        let energyPenalty = 0;
        for (let i = 0; i < model.nu; i++) {
            energyPenalty += Math.abs(simulation.ctrl[i]) * 0.01;
        }
        
        return progress - energyPenalty;
    }
}

function checkDone() {
    if (!simulation || !model) return false;
    
    // Episode ends after too many steps
    if (envState.stepCount > 1000) return true;
    
    // Check if robot fell
    if (envConfig.envType === 'pendulum') {
        return false; // Pendulum never "falls"
    } else {
        let bodyIndex = 1; // torso is usually body 1
        let height = 0.5;
        
        try {
            if (bodyIndex < model.nbody) {
                const xposOffset = bodyIndex * 3;
                height = simulation.xpos[xposOffset + 2]; // z-coordinate
            }
        } catch (e) {
            // Body not found
        }
        
        // For testing, only reset if REALLY fallen (was 0.1)
        return height < 0.05;
    }
}

function resetEnvironment(data, id) {
    if (!simulation) return;
    
    const envId = data ? data.envId : (envConfig ? envConfig.envId : 0);
    
    // Reset simulation
    simulation.resetData();
    simulation.forward();
    
    // Reset state tracking
    envState = {
        stepCount: 0,
        totalReward: 0,
        lastX: 0
    };
    
    const observation = getObservation();
    
    self.postMessage({
        type: 'reset',
        id: id,
        data: {
            envId: envId,
            observation: observation
        }
    });
}

function getEnvironmentState(data, id) {
    if (!simulation) return;
    
    const observation = getObservation();
    
    self.postMessage({
        type: 'state',
        id: id,
        data: {
            envId: data.envId || envConfig.envId || 0,
            observation: observation,
            info: envState
        }
    });
}


function applyForce(data, id) {
    if (!simulation || !model) return;
    
    const { bodyId, force, point } = data;
    
    // Debug log ALL applyForce calls
    const forceMag = force ? Math.sqrt(force[0]**2 + force[1]**2 + force[2]**2) : 0;
    console.log(`🔵 applyForce called: body=${bodyId}, forceMag=${forceMag.toFixed(0)}N, force=[${force?force.map(f=>f.toFixed(0)).join(','):'null'}]`);
    
    // Handle force application
    if (force && (force[0] !== 0 || force[1] !== 0 || force[2] !== 0)) {
        // Always update dragState when force is non-zero
        dragState = {
            active: true,  // This is crucial - must be true for forces to apply
            bodyId: bodyId,
            force: force,
            point: point,
            forceMag: forceMag,
            logged: false,  // Reset log flag for new drag
            stepLogged: false,  // Reset step log flag
            startLogged: false,  // Reset start log flag
            timestamp: Date.now()  // Add timestamp to track timing
        };
        dragMissingLogged = false; // Reset missing flag when new drag starts
        console.log(`✅ Drag state SET ACTIVE for body ${bodyId}: ${forceMag.toFixed(0)}N, active=${dragState.active}, time=${dragState.timestamp}`);
    } else {
        // Don't immediately clear drag state - let physics step handle it
        // This prevents clearing between drag updates and physics steps
        if (dragState && Date.now() - dragState.timestamp > 500) {
            // Only clear if dragState is older than 500ms (increased from 100ms)
            dragState = null;
            console.log(`🟡 Drag state cleared (timeout)`);
        } else if (forceMag === 0) {
            console.log(`🟡 Zero force received but keeping dragState active for pending physics step`);
        }
    }
    
    // Send confirmation
    self.postMessage({
        type: "forceApplied",
        id: id,
        data: {
            bodyId: bodyId,
            force: force,
            active: dragState !== null
        }
    });
}

function getTextureData(data, id) {
    if (!model) return;
    
    console.log('Getting texture data from model...');
    
    const textureData = {};
    
    // Check if texture data exists
    if (model.tex_rgb) {
        // Get all textures
        const numTextures = model.ntex || 0;
        console.log(`Found ${numTextures} textures`);
        
        for (let texId = 0; texId < numTextures; texId++) {
            const width = model.tex_width[texId];
            const height = model.tex_height[texId];
            const offset = model.tex_adr[texId];
            
            console.log(`Texture ${texId}: ${width}x${height} at offset ${offset}`);
            
            // Extract RGB data
            const rgbData = new Uint8Array(width * height * 3);
            for (let i = 0; i < width * height * 3; i++) {
                rgbData[i] = model.tex_rgb[offset + i];
            }
            
            textureData[texId] = {
                width: width,
                height: height,
                data: rgbData
            };
        }
    }
    
    self.postMessage({
        type: 'textureData',
        id: id,
        data: textureData
    });
}

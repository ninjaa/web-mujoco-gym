// MuJoCo RL Worker - Runs physics simulation in a Web Worker

// Import MuJoCo WASM module
let mujoco = null;
let model = null;
let state = null;
let simulation = null;
let envConfig = null;
let envState = null;
let modelConfig = null;
let dragState = null; // Store current drag state

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
                await initializeMuJoCo(data, id);
                break;
                
            case 'step':
                if (simulation) {
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
                    applyForce(data, id);
                } else {
                    throw new Error('Simulation not initialized');
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
            
            for (let i = 0; i < Math.min(actions.length, numActuators); i++) {
                simulation.ctrl[i] = actions[i];
            }
        }
        
        // Apply drag forces if active
        if (dragState && dragState.active) {
            const { bodyId, force, point } = dragState;
            if (simulation.applyForce) {
                simulation.applyForce(
                    force[0], force[1], force[2],  // force
                    0, 0, 0,  // torque
                    point[0], point[1], point[2],  // point
                    bodyId
                );
            }
        }
        
        // Step physics
        simulation.step();
        
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
    
    // For visualization, we mainly care about the torso position
    return {
        bodyPos: bodyPos,  
        qpos: qpos,
        qvel: qvel,
        xpos: xpos,    // All body positions
        xquat: xquat,  // All body rotations
        time: simulation.time,
        actions: simulation.ctrl ? Array.from(simulation.ctrl).slice(0, model.nu) : []  
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
        
        return height < 0.1;
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
    
    // Store drag state to be applied during physics steps
    if (force && (force[0] !== 0 || force[1] !== 0 || force[2] !== 0)) {
        dragState = {
            active: true,
            bodyId: bodyId,
            force: force,
            point: point
        };
        console.log(`Drag state activated for body ${bodyId}`);
    } else {
        // Clear drag state if force is zero
        dragState = null;
        console.log(`Drag state cleared`);
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

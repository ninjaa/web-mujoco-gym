// MuJoCo RL Worker - Runs physics simulation in a Web Worker

// Import MuJoCo WASM module
let mujoco = null;
let model = null;
let state = null;
let simulation = null;
let envConfig = null;
let envState = null;

// Initialize MuJoCo when worker starts
self.onmessage = async function(e) {
    const { type, data } = e.data;
    
    try {
        switch (type) {
            case 'init':
                await initializeMuJoCo(data);
                break;
                
            case 'step':
                if (simulation) {
                    stepSimulation(data.actions);
                } else {
                    throw new Error('Simulation not initialized');
                }
                break;
                
            case 'reset':
                if (simulation) {
                    resetEnvironment();
                } else {
                    throw new Error('Simulation not initialized');
                }
                break;
                
            case 'getState':
                if (simulation) {
                    getEnvironmentState();
                } else {
                    throw new Error('Simulation not initialized');
                }
                break;
        }
    } catch (error) {
        self.postMessage({
            type: 'error',
            data: {
                envId: data.envId || 0,
                error: error.message || 'Unknown error'
            }
        });
    }
};

async function initializeMuJoCo(config) {
    try {
        console.log('Worker initializing MuJoCo...');
        
        // Import MuJoCo module dynamically
        const mujocoModule = await import('/dist/mujoco_wasm.js');
        mujoco = await mujocoModule.default();
        
        console.log('MuJoCo loaded successfully');
        
        // Create virtual filesystem
        mujoco.FS.mkdir('/working');
        mujoco.FS.mount(mujoco.MEMFS, { root: '.' }, '/working');
        
        // For now, use humanoid for all types while we debug
        let modelXML;
        if (config.envType === 'humanoid' || true) {  // Force humanoid for testing
            // Fetch the working humanoid model
            const response = await fetch('/workspace/humanoid.xml');
            modelXML = await response.text();
        } else {
            // Use simple models for other types
            modelXML = createModelXML(config.envType);
        }
        
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
        
        // Store config
        envConfig = config;
        
        // Initialize environment state
        resetEnvironment();
        
        self.postMessage({
            type: 'initialized',
            data: {
                envId: config.envId,
                success: true
            }
        });
        
    } catch (error) {
        console.error('MuJoCo initialization error:', error);
        self.postMessage({
            type: 'error',
            data: {
                envId: config.envId,
                error: error.message || 'Failed to initialize MuJoCo'
            }
        });
    }
}

function createModelXML(envType) {
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
</mujoco>`
    };
    
    return models[envType] || models['pendulum'];
}

function stepSimulation(actions) {
    if (!simulation || !model) return;
    
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
            console.log(`Applying ${actions.length} actions to ${numActuators} actuators`);
            
            for (let i = 0; i < Math.min(actions.length, numActuators); i++) {
                simulation.ctrl[i] = actions[i];
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
        
        // Log position occasionally
        if (envState.stepCount % 100 === 0) {
            console.log(`Step ${envState.stepCount}: Position = ${observation.position}`);
        }
        
        // Calculate reward (simple forward progress reward for now)
        const reward = calculateReward();
        
        // Check if done (simple height check)
        const done = checkDone();
        
        // Update environment state
        envState.stepCount++;
        envState.totalReward += reward;
        
        self.postMessage({
            type: 'step',
            data: {
                envId: envConfig.envId,
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
            data: {
                envId: envConfig.envId,
                error: error.message
            }
        });
    }
}

function getObservation() {
    if (!simulation || !model) return null;
    
    // For humanoid, we want the torso position which is typically body index 1 (after world body)
    // In MuJoCo, body 0 is usually the world body
    let bodyIndex = 1; // torso is usually the second body
    
    let bodyPos = [0, 0, 0];
    try {
        // In MuJoCo WASM, we access body positions directly from simulation.xpos array
        // Each body has 3 values (x, y, z) in the xpos array
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
        position: bodyPos,
        qpos: qpos,
        qvel: qvel,
        time: simulation.time
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

function resetEnvironment() {
    if (!simulation) return;
    
    // Reset simulation
    simulation.resetData();
    simulation.forward();
    
    // Reset environment state
    envState = {
        stepCount: 0,
        totalReward: 0,
        lastX: 0
    };
    
    // Get initial observation
    const observation = getObservation();
    
    self.postMessage({
        type: 'reset',
        data: {
            envId: envConfig.envId,
            observation: observation
        }
    });
}

function getEnvironmentState() {
    if (!simulation) return;
    
    const observation = getObservation();
    
    self.postMessage({
        type: 'state',
        data: {
            envId: envConfig.envId,
            observation: observation,
            info: envState
        }
    });
}

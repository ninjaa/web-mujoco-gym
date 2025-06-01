// Web Worker for running MuJoCo simulations in parallel
importScripts('/mujoco_wasm.js');

let mujoco = null;
let simulation = null;

// Initialize MuJoCo once per worker
self.addEventListener('message', async function(e) {
  const { type, data } = e.data;
  
  switch(type) {
    case 'init':
      await initializeMuJoCo();
      self.postMessage({ type: 'ready' });
      break;
      
    case 'createEnvironment':
      await createEnvironment(data.xml, data.envId);
      break;
      
    case 'step':
      const result = await stepSimulation(data);
      self.postMessage({ 
        type: 'stepResult', 
        data: result 
      });
      break;
      
    case 'reset':
      await resetEnvironment();
      break;
  }
});

async function initializeMuJoCo() {
  // Load MuJoCo module
  mujoco = await load_mujoco();
  
  // Set up virtual file system
  mujoco.FS.mkdir('/working');
  mujoco.FS.mount(mujoco.MEMFS, { root: '.' }, '/working');
}

async function createEnvironment(xmlContent, envId) {
  // Write XML to virtual filesystem
  const filename = `/working/env_${envId}.xml`;
  mujoco.FS.writeFile(filename, xmlContent);
  
  // Create simulation
  const model = new mujoco.Model(filename);
  const state = new mujoco.State(model);
  simulation = new mujoco.Simulation(model, state);
  
  self.postMessage({ 
    type: 'environmentCreated', 
    data: { envId, ready: true }
  });
}

async function stepSimulation(data) {
  if (!simulation) {
    throw new Error('Simulation not initialized');
  }
  
  // Apply actions
  if (data.actions) {
    // Set control inputs
    for (let i = 0; i < data.actions.length; i++) {
      simulation.ctrl[i] = data.actions[i];
    }
  }
  
  // Step physics
  simulation.step();
  
  // Extract observations
  const observations = {
    // Joint positions
    qpos: Array.from(simulation.qpos),
    
    // Joint velocities  
    qvel: Array.from(simulation.qvel),
    
    // Sensor data
    sensordata: simulation.sensordata ? 
      Array.from(simulation.sensordata) : [],
    
    // Time
    time: simulation.time,
    
    // Contact forces (if needed)
    contact_forces: extractContactForces()
  };
  
  // Calculate reward (task-specific)
  const reward = calculateReward(observations, data.targetPosition);
  
  // Check termination
  const done = checkTermination(observations);
  
  return {
    observations,
    reward,
    done,
    info: {
      time: simulation.time,
      envId: data.envId
    }
  };
}

function calculateReward(obs, targetPos) {
  // Example: distance-based reward
  if (!targetPos) return 0;
  
  const currentPos = obs.qpos.slice(0, 2); // x, y position
  const distance = Math.sqrt(
    Math.pow(currentPos[0] - targetPos.x, 2) + 
    Math.pow(currentPos[1] - targetPos.y, 2)
  );
  
  return -distance; // Negative distance as reward
}

function checkTermination(obs) {
  // Example termination conditions
  const maxTime = 10.0; // 10 seconds
  const fallen = obs.qpos[2] < 0.1; // Height check
  
  return simulation.time > maxTime || fallen;
}

function extractContactForces() {
  // Extract contact information if needed
  // This would depend on specific MuJoCo API
  return [];
}

async function resetEnvironment() {
  if (simulation) {
    simulation.reset();
    self.postMessage({ type: 'reset', data: { success: true }});
  }
}

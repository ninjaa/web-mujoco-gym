// Main orchestrator for running 1000 parallel RL environments
class RLOrchestrator {
  constructor(numEnvironments = 1000, numWorkers = 50) {
    this.numEnvironments = numEnvironments;
    this.numWorkers = numWorkers;
    this.workers = [];
    this.environments = [];
    this.initialized = false;
  }

  async initialize() {
    console.log(`Initializing ${this.numEnvironments} environments with ${this.numWorkers} workers...`);
    
    // Create inline worker script
    const workerScript = `
        let mujoco = null;
        let model = null;
        let state = null;
        let simulation = null;
        
        self.onmessage = async function(e) {
            const { type, data, envId } = e.data;
            
            try {
                switch(type) {
                    case 'init':
                        // Load MuJoCo WASM
                        importScripts(data.mujocoPath || '/dist/mujoco_wasm.js');
                        mujoco = await load_mujoco();
                        
                        // Set up filesystem
                        mujoco.FS.mkdir('/working');
                        mujoco.FS.mount(mujoco.MEMFS, { root: '.' }, '/working');
                        
                        self.postMessage({ 
                            type: 'initialized', 
                            envId: envId,
                            success: true 
                        });
                        break;
                        
                    case 'loadModel':
                        // Write XML to filesystem
                        mujoco.FS.writeFile('/working/model_' + envId + '.xml', data.xml);
                        
                        // Load model
                        model = new mujoco.Model('/working/model_' + envId + '.xml');
                        state = new mujoco.State(model);
                        simulation = new mujoco.Simulation(model, state);
                        
                        // Get model info
                        const modelInfo = {
                            nq: model.nq,  // number of generalized coordinates
                            nv: model.nv,  // number of generalized velocities
                            nu: model.nu,  // number of actuators
                            nbody: model.nbody  // number of bodies
                        };
                        
                        self.postMessage({ 
                            type: 'modelLoaded', 
                            envId: envId,
                            modelInfo: modelInfo,
                            success: true 
                        });
                        break;
                        
                    case 'step':
                        if (!simulation) throw new Error('Simulation not initialized');
                        
                        // Apply actions to actuators
                        if (data.actions && data.actions.length > 0) {
                            for (let i = 0; i < Math.min(data.actions.length, model.nu); i++) {
                                simulation.ctrl[i] = data.actions[i];
                            }
                        }
                        
                        // Step physics
                        simulation.step();
                        
                        // Get observation
                        const observation = {
                            time: simulation.time,
                            qpos: Array.from(simulation.qpos),
                            qvel: Array.from(simulation.qvel),
                            ctrl: Array.from(simulation.ctrl),
                            xpos: Array.from(simulation.xpos).slice(0, model.nbody * 3)
                        };
                        
                        // Simple reward calculation (can be customized)
                        const reward = calculateReward(observation);
                        
                        // Check if episode is done
                        const done = checkDone(observation);
                        
                        self.postMessage({ 
                            type: 'stepComplete', 
                            envId: envId,
                            observation: observation,
                            reward: reward,
                            done: done
                        });
                        break;
                        
                    case 'reset':
                        if (simulation) {
                            simulation.reset();
                            
                            // Apply initial conditions if provided
                            if (data.initialState) {
                                if (data.initialState.qpos) {
                                    for (let i = 0; i < data.initialState.qpos.length; i++) {
                                        simulation.qpos[i] = data.initialState.qpos[i];
                                    }
                                }
                                if (data.initialState.qvel) {
                                    for (let i = 0; i < data.initialState.qvel.length; i++) {
                                        simulation.qvel[i] = data.initialState.qvel[i];
                                    }
                                }
                                simulation.forward();
                            }
                            
                            const observation = {
                                time: simulation.time,
                                qpos: Array.from(simulation.qpos),
                                qvel: Array.from(simulation.qvel),
                                ctrl: Array.from(simulation.ctrl),
                                xpos: Array.from(simulation.xpos).slice(0, model.nbody * 3)
                            };
                            
                            self.postMessage({ 
                                type: 'resetComplete', 
                                envId: envId,
                                observation: observation
                            });
                        }
                        break;
                }
            } catch (error) {
                self.postMessage({ 
                    type: 'error', 
                    envId: envId,
                    error: error.message 
                });
            }
        };
        
        function calculateReward(obs) {
            // Example reward: negative distance from origin for first body
            if (obs.xpos.length >= 3) {
                const x = obs.xpos[0];
                const y = obs.xpos[1];
                const z = obs.xpos[2];
                return -Math.sqrt(x*x + y*y + z*z);
            }
            return 0;
        }
        
        function checkDone(obs) {
            // Example: episode done if time exceeds 10 seconds
            return obs.time > 10.0;
        }
    `;
    
    // Create worker blob
    const blob = new Blob([workerScript], { type: 'application/javascript' });
    const workerUrl = URL.createObjectURL(blob);
    
    // Create workers
    for (let i = 0; i < this.numWorkers; i++) {
        const worker = new Worker(workerUrl);
        
        // Set up message handler
        worker.onmessage = (e) => this.handleWorkerMessage(e);
        
        this.workers.push(worker);
    }
    
    // Initialize workers
    const initPromises = this.workers.map((worker, idx) => {
        return new Promise((resolve, reject) => {
            const handler = (e) => {
                if (e.data.type === 'initialized') {
                    worker.removeEventListener('message', handler);
                    if (e.data.success) {
                        resolve();
                    } else {
                        reject(new Error(`Worker ${idx} initialization failed`));
                    }
                }
            };
            worker.addEventListener('message', handler);
            worker.postMessage({ type: 'init', data: {} });
        });
    });
    
    await Promise.all(initPromises);
    console.log('All workers initialized successfully');
    
    // Create environments
    for (let i = 0; i < this.numEnvironments; i++) {
        this.environments.push({
            id: i,
            workerId: i % this.numWorkers,
            modelXML: null,
            observation: null,
            reward: 0,
            episodeReward: 0,
            done: false,
            episodeLength: 0
        });
    }
    
    this.initialized = true;
  }

  async loadEnvironments(environmentGenerator) {
    if (!this.initialized) {
        throw new Error('Orchestrator not initialized');
    }
    
    console.log('Loading environment models...');
    
    // Generate environment XMLs
    const envXMLs = environmentGenerator.generateEnvironments(this.numEnvironments);
    
    // Load models in workers
    const loadPromises = this.environments.map((env, idx) => {
        env.modelXML = envXMLs[idx];
        const worker = this.workers[env.workerId];
        
        return new Promise((resolve, reject) => {
            const handler = (e) => {
                if (e.data.type === 'modelLoaded' && e.data.envId === env.id) {
                    worker.removeEventListener('message', handler);
                    if (e.data.success) {
                        console.log(`Environment ${env.id} loaded: ${e.data.modelInfo.nbody} bodies, ${e.data.modelInfo.nu} actuators`);
                        resolve();
                    } else {
                        reject(new Error(`Failed to load environment ${env.id}`));
                    }
                }
            };
            worker.addEventListener('message', handler);
            
            worker.postMessage({
                type: 'loadModel',
                envId: env.id,
                data: { xml: env.modelXML }
            });
        });
    });
    
    await Promise.all(loadPromises);
    console.log('All environments loaded successfully');
  }

  async step(actions) {
    if (!this.initialized) {
        throw new Error('Orchestrator not initialized');
    }
    
    // Send step commands to all environments
    const stepPromises = this.environments.map((env) => {
        if (env.done) {
            return Promise.resolve();
        }
        
        const worker = this.workers[env.workerId];
        const envActions = actions[env.id] || [];
        
        return new Promise((resolve) => {
            const handler = (e) => {
                if (e.data.type === 'stepComplete' && e.data.envId === env.id) {
                    worker.removeEventListener('message', handler);
                    
                    // Update environment state
                    env.observation = e.data.observation;
                    env.reward = e.data.reward;
                    env.episodeReward += e.data.reward;
                    env.done = e.data.done;
                    env.episodeLength++;
                    
                    resolve({
                        envId: env.id,
                        observation: e.data.observation,
                        reward: e.data.reward,
                        done: e.data.done
                    });
                }
            };
            worker.addEventListener('message', handler);
            
            worker.postMessage({
                type: 'step',
                envId: env.id,
                data: { actions: envActions }
            });
        });
    });
    
    const results = await Promise.all(stepPromises);
    
    // Collect episode completions
    const completedEpisodes = [];
    for (const env of this.environments) {
        if (env.done) {
            completedEpisodes.push({
                envId: env.id,
                totalReward: env.episodeReward,
                episodeLength: env.episodeLength
            });
        }
    }
    
    return {
        stepResults: results.filter(r => r !== undefined),
        completedEpisodes: completedEpisodes
    };
  }

  async reset(envIds = null) {
    const envsToReset = envIds ? 
        this.environments.filter(env => envIds.includes(env.id)) : 
        this.environments;
        
    const resetPromises = envsToReset.map((env) => {
        const worker = this.workers[env.workerId];
        
        return new Promise((resolve) => {
            const handler = (e) => {
                if (e.data.type === 'resetComplete' && e.data.envId === env.id) {
                    worker.removeEventListener('message', handler);
                    
                    // Reset environment state
                    env.observation = e.data.observation;
                    env.reward = 0;
                    env.episodeReward = 0;
                    env.done = false;
                    env.episodeLength = 0;
                    
                    resolve(env.id);
                }
            };
            worker.addEventListener('message', handler);
            
            // Generate random initial state
            const initialState = {
                qpos: env.observation ? 
                    env.observation.qpos.map(() => (Math.random() - 0.5) * 0.1) : 
                    null
            };
            
            worker.postMessage({
                type: 'reset',
                envId: env.id,
                data: { initialState: initialState }
            });
        });
    });
    
    const resetEnvIds = await Promise.all(resetPromises);
    console.log(`Reset ${resetEnvIds.length} environments`);
    
    return resetEnvIds;
  }

  handleWorkerMessage(event) {
    const { type, envId, error } = event.data;
    
    if (error) {
        console.error(`Worker error for env ${envId}: ${error}`);
        this.emit('error', { envId, error });
    }
    
    // Additional message handling can be added here
    if (type === 'info' || type === 'debug') {
        console.log(`Worker message [env ${envId}]: ${event.data.message}`);
    }
  }

  getStatistics() {
    const stats = {
        totalEnvironments: this.numEnvironments,
        activeEnvironments: this.environments.filter(env => !env.done).length,
        completedEpisodes: this.environments.filter(env => env.done).length,
        averageReward: 0,
        averageEpisodeLength: 0
    };
    
    const completedEnvs = this.environments.filter(env => env.done);
    if (completedEnvs.length > 0) {
        stats.averageReward = completedEnvs.reduce((sum, env) => sum + env.episodeReward, 0) / completedEnvs.length;
        stats.averageEpisodeLength = completedEnvs.reduce((sum, env) => sum + env.episodeLength, 0) / completedEnvs.length;
    }
    
    return stats;
  }
}

// Usage example
async function main() {
  const orchestrator = new RLOrchestrator(1000, 50);
  
  await orchestrator.initialize();
  await orchestrator.loadEnvironments(new EnvironmentGenerator());
  
  // Run training loop
  for (let episode = 0; episode < 100; episode++) {
    console.log(`Episode ${episode}`);
    const data = await orchestrator.step([]);
    
    // Process episode data for training
    // ... your RL training code here ...
    
    console.log(`Episode ${episode} complete. Average reward: ${
      data.completedEpisodes.reduce((sum, env) => sum + env.totalReward, 0) / data.completedEpisodes.length
    }`);
  }
}

// Start if running in browser
if (typeof window !== 'undefined') {
  window.RLOrchestrator = RLOrchestrator;
}

/**
 * Optimized MuJoCo Orchestrator v3
 * Decouples physics simulation from rendering for better performance
 */

class OptimizedOrchestrator {
    constructor(numEnvironments = 12, numWorkers = null) {
        this.numEnvironments = numEnvironments;
        // IMPORTANT: Use 1 worker per environment because each worker can only handle 1 simulation
        this.numWorkers = numWorkers || numEnvironments;
        this.workers = [];
        this.environmentStates = new Map();
        this.initialized = false;
        
        // Separate intervals for physics and rendering
        this.physicsInterval = null;
        this.renderInterval = null;
        this.physicsHz = 100; // 100Hz physics
        this.renderHz = 30;   // 30Hz rendering
        
        // Batching for efficiency
        this.pendingUpdates = [];
        this.detailedRobotId = 0; // Which robot to show in detail
        
        // Callbacks
        this.onStateUpdate = null;
        this.onInitialized = null;
    }
    
    async initialize() {
        console.log('Initializing optimized orchestrator...');
        
        // Create workers
        for (let i = 0; i < this.numWorkers; i++) {
            const worker = new Worker('./mujoco-rl-worker-v2.js');
            
            worker.onmessage = (e) => this.handleWorkerMessage(i, e);
            worker.onerror = (e) => console.error(`Worker ${i} error:`, e);
            
            this.workers.push(worker);
        }
        
        // Initialize environments across workers
        const initPromises = [];
        const envsPerWorker = Math.ceil(this.numEnvironments / this.numWorkers);
        
        for (let i = 0; i < this.numEnvironments; i++) {
            const workerId = Math.floor(i / envsPerWorker);
            const promise = new Promise((resolve) => {
                const listener = (e) => {
                    if (e.data.type === 'initialized' && e.data.envId === i) {
                        this.workers[workerId].removeEventListener('message', listener);
                        console.log(`Environment ${i} initialized successfully`);
                        resolve();
                    }
                };
                this.workers[workerId].addEventListener('message', listener);
            });
            
            initPromises.push(promise);
            
            this.workers[workerId].postMessage({
                type: 'init',
                data: {
                    envType: 'humanoid',
                    envId: i
                },
                id: workerId
            });
            
            // Initialize state
            this.environmentStates.set(i, {
                id: i,
                observation: null,
                reward: 0,
                done: false,
                info: {},
                episodeReward: 0,
                episodeLength: 0,
                lastUpdate: Date.now()
            });
        }
        
        await Promise.all(initPromises);
        this.initialized = true;
        console.log('All environments initialized');
        
        if (this.onInitialized) {
            this.onInitialized();
        }
    }
    
    start() {
        if (!this.initialized) {
            console.error('Orchestrator not initialized');
            return;
        }
        
        console.log('Starting optimized simulation loops...');
        
        // Physics loop - runs at high frequency in workers
        this.physicsInterval = setInterval(() => {
            this.stepPhysics();
        }, 1000 / this.physicsHz);
        
        // Render loop - runs at lower frequency for smooth visuals
        this.renderInterval = setInterval(() => {
            this.renderBatch();
        }, 1000 / this.renderHz);
    }
    
    stop() {
        if (this.physicsInterval) {
            clearInterval(this.physicsInterval);
            this.physicsInterval = null;
        }
        
        if (this.renderInterval) {
            clearInterval(this.renderInterval);
            this.renderInterval = null;
        }
        
        console.log('Simulation stopped');
    }
    
    stepPhysics() {
        // Send step commands to all workers
        // Don't wait for responses - they'll come asynchronously
        for (let i = 0; i < this.numEnvironments; i++) {
            const workerId = Math.floor(i / Math.ceil(this.numEnvironments / this.numWorkers));
            
            // Get action (from policy or random)
            const action = this.getAction(i);
            
            this.workers[workerId].postMessage({
                type: 'step',
                data: {
                    envId: i,
                    actions: action
                },
                id: workerId
            });
        }
    }
    
    getAction(envId) {
        const state = this.environmentStates.get(envId);
        
        // PRIORITY 1: Use CleanRL action if available (from setAction)
        if (state && state.nextAction) {
            const action = state.nextAction;
            // Clear the action after using it (single-use)
            state.nextAction = null;
            // Removed noisy action log
            return action;
        }
        
        // PRIORITY 2: Check if we have a trained policy
        if (window.trainedPolicyNetwork) {
            if (state && state.observation) {
                // Convert observation to policy input format
                const stateVec = this.observationToVector(state.observation);
                
                // Get action from trained policy
                const action = window.trainedPolicyNetwork.forward(stateVec);
                
                // Add small exploration noise for variety
                const noisyAction = action.map(a => {
                    const noise = (Math.random() - 0.5) * 0.05;
                    return Math.max(-1, Math.min(1, a + noise));
                });
                // Removed noisy action log
                return noisyAction;
            }
        }
        
        // PRIORITY 3: Fallback to random actions
        const numActions = 21; // Humanoid has 21 actuators
        const randomAction = Array.from({length: numActions}, () => (Math.random() - 0.5) * 0.4);
        // Removed noisy action log
        return randomAction;
    }
    
    observationToVector(obs) {
        const vec = [];
        
        if (obs.bodyPos) vec.push(...obs.bodyPos.slice(0, 3));
        else vec.push(0, 0, 0);
        
        if (obs.bodyVel) vec.push(...obs.bodyVel.slice(0, 3)); 
        else if (obs.qvel) vec.push(...obs.qvel.slice(0, 3));
        else vec.push(0, 0, 0);
        
        if (obs.qpos) {
            vec.push(...obs.qpos.slice(7, 28));
        } else {
            vec.push(...new Array(21).fill(0));
        }
        
        if (obs.qvel) {
            vec.push(...obs.qvel.slice(6, 27));
        } else {
            vec.push(...new Array(21).fill(0));
        }
        
        while (vec.length < 72) vec.push(0);
        return vec.slice(0, 72);
    }
    
    handleWorkerMessage(workerId, event) {
        const { type, data } = event.data;
        
        if (type === 'step_result') {
            // Store the update for batch processing
            this.pendingUpdates.push({
                envId: data.envId,
                observation: data.observation,
                reward: data.reward,
                done: data.done,
                info: data.info
            });
        } else if (type === 'reset') {
            // Handle reset messages - update the environment state immediately
            const state = this.environmentStates.get(data.envId);
            if (state) {
                state.observation = data.observation;
                state.reward = 0;
                state.done = false;
                state.info = {};
                state.episodeReward = 0;
                state.episodeLength = 0;
                state.lastUpdate = Date.now();
                console.log(`Environment ${data.envId} reset, observation received:`, !!data.observation);
            }
        }
    }
    
    renderBatch() {
        // Process all pending updates
        const updates = [...this.pendingUpdates];
        this.pendingUpdates = [];
        
        // Update states
        updates.forEach(update => {
            const state = this.environmentStates.get(update.envId);
            if (state) {
                state.observation = update.observation;
                state.reward = update.reward;
                state.done = update.done;
                state.info = update.info;
                state.lastUpdate = Date.now();
                
                // Track episode stats
                state.episodeReward += update.reward;
                state.episodeLength += 1;
                
                // Reset if done
                if (update.done) {
                    console.log(`Env ${update.envId} episode ended. Reward: ${state.episodeReward.toFixed(2)}, Length: ${state.episodeLength}`);
                    state.episodeReward = 0;
                    state.episodeLength = 0;
                    
                    // Reset the environment
                    const workerId = Math.floor(update.envId / Math.ceil(this.numEnvironments / this.numWorkers));
                    this.workers[workerId].postMessage({
                        type: 'reset',
                        data: {
                            envId: update.envId
                        },
                        id: workerId
                    });
                }
            }
        });
        
        // Trigger render callback with optimized data
        if (this.onStateUpdate && updates.length > 0) {
            const renderData = this.prepareRenderData();
            this.onStateUpdate(renderData);
        }
    }
    
    prepareRenderData() {
        const states = Array.from(this.environmentStates.values());
        
        // Separate detailed robot from simple dots
        const detailedRobot = states.find(s => s.id === this.detailedRobotId);
        const otherRobots = states.filter(s => s.id !== this.detailedRobotId);
        
        return {
            detailed: detailedRobot,
            simple: otherRobots.map(s => ({
                id: s.id,
                position: s.observation?.bodyPos || [0, 0, 0],
                done: s.done,
                reward: s.episodeReward
            })),
            fps: this.calculateFPS()
        };
    }
    
    calculateFPS() {
        // Simple FPS calculation based on render rate
        return this.renderHz;
    }
    
    setDetailedRobot(envId) {
        this.detailedRobotId = envId;
    }
    
    // Get current state for external use
    getEnvironmentState(envId) {
        return this.environmentStates.get(envId);
    }
    
    // Update action for specific environment (for RL training)
    setAction(envId, action) {
        // Store action for next physics step
        const state = this.environmentStates.get(envId);
        if (state) {
            state.nextAction = action;
        }
    }
    
    resetEnvironment(envId) {
        const workerId = Math.floor(envId / Math.ceil(this.numEnvironments / this.numWorkers));
        this.workers[workerId].postMessage({
            type: 'reset',
            data: {
                envId: envId
            },
            id: workerId
        });
    }

    // Clear actuator controls (relax muscles)
    clearActuatorControls(envId) {
        const workerId = Math.floor(envId / Math.ceil(this.numEnvironments / this.numWorkers));
        if (this.workers[workerId]) {
            this.workers[workerId].postMessage({
                type: 'clearActuators',
                data: {
                    envId: envId
                },
                id: workerId // Though envId is primary, workerId might be useful for worker-side logging
            });
            console.log(`Orchestrator: Sent clearActuators command for envId ${envId} to worker ${workerId}`);
        } else {
            console.error(`Orchestrator: Worker ${workerId} not found for envId ${envId} when trying to clear actuators.`);
        }
    }

    // Apply force to a specific body (for interaction)
    applyForce(envId, bodyId, force, point) {
        const workerId = Math.floor(envId / Math.ceil(this.numEnvironments / this.numWorkers));
        this.workers[workerId].postMessage({
            type: 'applyForce',
            data: {
                envId: envId,
                bodyId: bodyId,
                force: force,
                point: point
            },
            id: workerId
        });
    }
    
    // Clean up
    terminate() {
        this.stop();
        this.workers.forEach(worker => worker.terminate());
        this.workers = [];
        this.environmentStates.clear();
    }
}

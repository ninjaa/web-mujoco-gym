// MuJoCo RL Orchestrator for managing parallel environments
class MuJoCoRLOrchestrator {
    constructor(numEnvironments, numWorkers, envType) {
        this.numEnvironments = numEnvironments;
        this.numWorkers = numWorkers;
        this.workers = [];
        this.environments = [];
        this.initialized = false;
        this.pendingMessages = new Map();
        this.messageId = 0;
        this.envType = envType;
        
        // Canvas references for visualization
        this.canvases = {};
        this.contexts = {};
        
        // Statistics
        this.totalReward = 0;
        this.episodeCount = 0;
        this.stepCount = 0;
    }
    
    async initialize() {
        console.log(`Initializing ${this.numEnvironments} environments with ${this.numWorkers} workers`);
        
        // Create workers
        for (let i = 0; i < this.numWorkers; i++) {
            const worker = new Worker('./mujoco-rl-worker-v2.js');
            
            worker.onmessage = (e) => {
                this.handleWorkerMessage(i, e.data);
            };
            
            worker.onerror = (error) => {
                console.error(`Worker ${i} error:`, error);
            };
            
            this.workers.push(worker);
        }
        
        // Initialize environments distributed across workers
        const initPromises = [];
        for (let i = 0; i < this.numEnvironments; i++) {
            const workerId = i % this.numWorkers;
            const envId = i;
            
            this.environments.push({
                id: envId,
                workerId: workerId,
                observation: null,
                reward: 0,
                done: false,
                stepCount: 0,
                episodeReward: 0
            });
            
            // Send initialization message with proper data structure
            const promise = this.sendMessage(workerId, {
                type: 'init',
                data: {
                    envId: envId,
                    envType: this.envType
                }
            });
            initPromises.push(promise);
        }
        
        // Wait for all environments to initialize
        await Promise.all(initPromises);
        this.initialized = true;
        console.log('All environments initialized');
    }
    
    handleWorkerMessage(workerId, message) {
        const { type, data, envId: messageEnvId } = message;
        
        // Handle responses to specific requests
        if (message.id !== undefined && this.pendingMessages.has(message.id)) {
            const { resolve, reject } = this.pendingMessages.get(message.id);
            this.pendingMessages.delete(message.id);
            
            if (message.error) {
                reject(new Error(message.error));
            } else {
                resolve(data);
            }
            return;
        }
        
        // Handle general messages
        switch (type) {
            case 'initialized':
                console.log(`Environment ${messageEnvId} initialized on worker ${workerId}`);
                break;
                
            case 'step_result':
                // Extract envId from data
                const stepEnvId = data?.envId;
                // Remove verbose logging - too noisy
                // console.log(`Received step result for env ${stepEnvId}:`, data);
                
                if (stepEnvId !== undefined) {
                    const env = this.environments[stepEnvId];
                    if (env && data) {
                        env.observation = data.observation;
                        env.reward = data.reward || 0;
                        env.done = data.done || false;
                        env.stepCount = (env.stepCount || 0) + 1;
                        env.episodeReward = (env.episodeReward || 0) + env.reward;
                        
                        this.stepCount++;
                        this.totalReward += env.reward;
                        
                        if (data.done) {
                            this.episodeCount++;
                            console.log(`Environment ${stepEnvId} episode done. Reward: ${env.episodeReward}`);
                            env.episodeReward = 0;
                            env.stepCount = 0;
                            
                            // Auto-reset
                            this.sendMessage(env.workerId, {
                                type: 'reset',
                                data: {
                                    envId: stepEnvId
                                }
                            });
                        }
                    }
                }
                break;
                
            case 'error':
                console.error(`Worker ${workerId} error:`, data);
                break;
        }
    }
    
    sendMessage(workerId, message) {
        return new Promise((resolve, reject) => {
            const id = this.messageId++;
            this.pendingMessages.set(id, { resolve, reject });
            
            this.workers[workerId].postMessage({
                ...message,
                id: id
            });
            
            // Timeout after 5 seconds
            setTimeout(() => {
                if (this.pendingMessages.has(id)) {
                    this.pendingMessages.delete(id);
                    reject(new Error('Worker message timeout'));
                }
            }, 5000);
        });
    }
    
    async runStep() {
        // Send step commands to all environments
        for (const env of this.environments) {
            const actionDims = {
                'humanoid': 21,
                'ant': 8,
                'cheetah': 6,
                'pendulum': 1
            };
            const numActions = actionDims[this.envType] || 4;
            
            // Generate random actions for now
            const actions = Array.from({ length: numActions }, () => 
                Math.random() * 2 - 1 // Random actions between -1 and 1
            );
            
            // Send step message without waiting for response
            this.workers[env.workerId].postMessage({
                type: 'step',
                data: {
                    envId: env.id,
                    actions: actions
                }
            });
        }
        
        // Return current states immediately
        // The actual step results will update the states asynchronously
        return this.environments.map(env => ({
            id: env.id,
            observation: env.observation,
            reward: env.reward,
            done: env.done,
            stepCount: env.stepCount,
            position: env.observation && env.observation.bodyPos ? [
                env.observation.bodyPos[0] || 0,
                env.observation.bodyPos[1] || 0,
                env.observation.bodyPos[2] || 0
            ] : [0, 0, 0]
        }));
    }
    
    getAverageReward() {
        return this.episodeCount > 0 ? this.totalReward / this.stepCount : 0;
    }
    
    reset() {
        // Reset all environments
        for (const env of this.environments) {
            env.observation = null;
            env.reward = 0;
            env.done = false;
            env.stepCount = 0;
            env.episodeReward = 0;
            
            this.sendMessage(env.workerId, {
                type: 'reset',
                data: {
                    envId: env.id
                }
            });
        }
        
        this.totalReward = 0;
        this.episodeCount = 0;
        this.stepCount = 0;
    }
}

export { MuJoCoRLOrchestrator };

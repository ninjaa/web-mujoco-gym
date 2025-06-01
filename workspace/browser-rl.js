/**
 * Browser-based Reinforcement Learning
 * Simple policy gradient implementation that runs entirely in the browser
 */

class TinyMLP {
    constructor(layers) {
        this.layers = layers;
        this.weights = [];
        this.biases = [];
        
        // Initialize weights and biases
        for (let i = 0; i < layers.length - 1; i++) {
            const w = this.randomMatrix(layers[i], layers[i + 1], 0.1);
            const b = new Array(layers[i + 1]).fill(0);
            this.weights.push(w);
            this.biases.push(b);
        }
    }
    
    randomMatrix(rows, cols, scale = 1.0) {
        const matrix = [];
        for (let i = 0; i < rows; i++) {
            const row = [];
            for (let j = 0; j < cols; j++) {
                row.push((Math.random() - 0.5) * 2 * scale);
            }
            matrix.push(row);
        }
        return matrix;
    }
    
    forward(input) {
        let x = [...input];
        
        // Forward pass through each layer
        for (let i = 0; i < this.weights.length; i++) {
            x = this.matmul(x, this.weights[i]);
            x = this.add(x, this.biases[i]);
            
            // ReLU activation for hidden layers, tanh for output
            if (i < this.weights.length - 1) {
                x = x.map(v => Math.max(0, v));
            } else {
                x = x.map(v => Math.tanh(v));
            }
        }
        
        return x;
    }
    
    matmul(vec, mat) {
        const result = new Array(mat[0].length).fill(0);
        for (let j = 0; j < mat[0].length; j++) {
            for (let i = 0; i < vec.length; i++) {
                result[j] += vec[i] * mat[i][j];
            }
        }
        return result;
    }
    
    add(vec1, vec2) {
        return vec1.map((v, i) => v + vec2[i]);
    }
    
    // Simple gradient update
    updateWeights(gradient, learningRate) {
        // This is a simplified update - in practice you'd compute proper gradients
        for (let i = 0; i < this.weights.length; i++) {
            for (let j = 0; j < this.weights[i].length; j++) {
                for (let k = 0; k < this.weights[i][j].length; k++) {
                    this.weights[i][j][k] += (Math.random() - 0.5) * gradient * learningRate;
                }
            }
        }
    }
    
    // Save/load for deployment
    serialize() {
        return {
            layers: this.layers,
            weights: this.weights,
            biases: this.biases
        };
    }
    
    static deserialize(data) {
        const mlp = new TinyMLP(data.layers);
        mlp.weights = data.weights;
        mlp.biases = data.biases;
        return mlp;
    }
}

/**
 * BrowserRL - Lightweight reinforcement learning for browser environments
 * Implements simple policy gradient methods for MuJoCo humanoid training
 */

class BrowserRL {
    constructor() {
        // Humanoid has 72 state dims, 21 action dims
        this.policy = new TinyMLP([72, 64, 32, 21]);
        this.learningRate = 0.003; // Increased for faster learning
        this.gamma = 0.99; // Discount factor
        
        // Training visualization
        this.rewardHistory = [];
        this.onRewardUpdate = null;
        this.onTrainingStep = null;
        
        // Training state
        this.isTraining = false;
        this.trainingInterval = null;
        this.currentEpisode = 0;
        this.maxEpisodes = 10;
    }
    
    async trainEpisode(orchestrator, rewardFn, envId = 0) {
        console.log('Starting training episode...');
        const trajectory = [];
        
        // Reset environment
        orchestrator.workers[0].postMessage({
            type: 'reset',
            environmentId: envId
        });
        
        // Wait for reset
        await new Promise(resolve => setTimeout(resolve, 100));
        
        let stepCount = 0;
        const maxSteps = 100; // Reduced from 200 for faster demo
        let episodeReward = 0;
        
        return new Promise((resolve) => {
            const stepInterval = setInterval(() => {
                const state = orchestrator.getEnvironmentState(envId);
                
                if (!state || !state.observation) {
                    return;
                }
                
                // Convert observation to flat array
                const stateVec = this.observationToVector(state.observation);
                
                // Get action from policy
                const action = this.policy.forward(stateVec);
                
                // Apply action
                orchestrator.setAction(envId, action);
                
                // Calculate reward
                let reward = 0;
                try {
                    if (rewardFn && typeof rewardFn === 'function') {
                        const obsState = this.observationToState(state.observation);
                        reward = rewardFn(obsState, action);
                        
                        // Debug first few steps
                        if (stepCount < 3) {
                            console.log('Reward calculation:', {
                                bodyPos: obsState.bodyPos,
                                bodyVel: obsState.bodyVel,
                                reward: reward
                            });
                        }
                    } else {
                        // Fallback: simple standing reward
                        const pos = state.observation.bodyPos || [0, 0, 0];
                        reward = pos[2] > 0.8 ? 1 : -1; // Reward for staying upright
                    }
                    
                    // Ensure reward is a number
                    if (isNaN(reward) || !isFinite(reward)) {
                        console.warn('Invalid reward:', reward);
                        reward = 0;
                    }
                } catch (error) {
                    console.warn('Reward function error:', error);
                    reward = 0;
                }
                
                episodeReward += reward;
                
                // Store transition
                trajectory.push({
                    state: stateVec,
                    action: action,
                    reward: reward
                });
                
                // Visualization callback
                if (this.onTrainingStep) {
                    this.onTrainingStep({
                        step: stepCount,
                        reward: reward,
                        totalReward: episodeReward,
                        state: state.observation
                    });
                }
                
                stepCount++;
                
                // Check termination
                if (state.done || stepCount >= maxSteps) {
                    clearInterval(stepInterval);
                    
                    // Update policy
                    this.updatePolicy(trajectory);
                    
                    // Record history
                    this.rewardHistory.push(episodeReward);
                    if (this.onRewardUpdate) {
                        this.onRewardUpdate(this.rewardHistory);
                    }
                    
                    console.log(`Episode complete. Reward: ${episodeReward.toFixed(2)}, Steps: ${stepCount}`);
                    resolve(episodeReward);
                }
            }, 50); // 20Hz training
        });
    }
    
    observationToVector(obs) {
        // Flatten observation into 72D vector
        const vec = [];
        
        // Body position (3)
        vec.push(...(obs.bodyPos || [0, 0, 0]));
        
        // Body velocity (3) - estimate from position change
        vec.push(0, 0, 0);
        
        // Joint angles (21)
        const jointAngles = obs.qpos ? obs.qpos.slice(7, 28) : new Array(21).fill(0);
        vec.push(...jointAngles);
        
        // Joint velocities (21) - estimate or use qvel
        const jointVels = obs.qvel ? obs.qvel.slice(6, 27) : new Array(21).fill(0);
        vec.push(...jointVels);
        
        // Body quaternion (4)
        const quat = obs.qpos ? obs.qpos.slice(3, 7) : [1, 0, 0, 0];
        vec.push(...quat);
        
        // Foot contacts (2) - estimate from z position
        const leftFoot = obs.bodyPos && obs.bodyPos[2] < 0.1 ? 1 : 0;
        const rightFoot = leftFoot; // Simplified
        vec.push(leftFoot, rightFoot);
        
        // Time (1) - normalized episode progress
        vec.push(0);
        
        // Pad to 72 dimensions
        while (vec.length < 72) {
            vec.push(0);
        }
        
        return vec.slice(0, 72);
    }
    
    observationToState(obs) {
        // Convert to reward function format
        return {
            bodyPos: obs.bodyPos || [0, 0, 0],
            bodyVel: obs.bodyVel || (obs.qvel ? obs.qvel.slice(0, 3) : [0, 0, 0]),
            jointAngles: obs.qpos ? obs.qpos.slice(7, 28) : new Array(21).fill(0),
            jointVelocities: obs.qvel ? obs.qvel.slice(6, 27) : new Array(21).fill(0),
            footContacts: [true, true], // Simplified
            bodyQuaternion: obs.qpos ? obs.qpos.slice(3, 7) : [1, 0, 0, 0],
            time: 0
        };
    }
    
    updatePolicy(trajectory) {
        if (trajectory.length === 0) return;
        
        // Calculate returns (cumulative discounted rewards)
        const returns = [];
        let G = 0;
        for (let t = trajectory.length - 1; t >= 0; t--) {
            G = trajectory[t].reward + this.gamma * G;
            returns.unshift(G);
        }
        
        // Normalize returns
        const mean = returns.reduce((a, b) => a + b) / returns.length;
        const std = Math.sqrt(returns.map(r => (r - mean) ** 2).reduce((a, b) => a + b) / returns.length);
        const normalizedReturns = returns.map(r => (r - mean) / (std + 1e-8));
        
        // Simple policy gradient update
        const avgGradient = normalizedReturns.reduce((a, b) => a + b) / returns.length;
        this.policy.updateWeights(avgGradient, this.learningRate);
    }
    
    async trainMultipleEpisodes(orchestrator, rewardFn, numEpisodes = 10) {
        console.log(`Starting ${numEpisodes} episode training run...`);
        
        for (let i = 0; i < numEpisodes; i++) {
            console.log(`Episode ${i + 1}/${numEpisodes}`);
            await this.trainEpisode(orchestrator, rewardFn);
            
            // Small delay between episodes
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        console.log('Training complete!');
        return this.policy;
    }
    
    deployPolicy() {
        // Return serialized policy for deployment
        return this.policy.serialize();
    }
    
    async startTraining(orchestrator, rewardFunction, options = {}) {
        if (this.isTraining) {
            console.warn('Training already in progress');
            return;
        }
        
        this.isTraining = true;
        this.currentEpisode = 0;
        this.maxEpisodes = options.maxEpisodes || 10;
        this.onEpisodeComplete = options.onEpisodeComplete;
        
        console.log('Starting RL training...');
        
        // Start training loop
        this.trainingInterval = setInterval(async () => {
            if (!this.isTraining || this.currentEpisode >= this.maxEpisodes) {
                this.stopTraining();
                return;
            }
            
            try {
                const episodeReward = await this.trainEpisode(orchestrator, rewardFunction, 0);
                this.currentEpisode++;
                
                console.log(`Episode ${this.currentEpisode}: Reward = ${episodeReward.toFixed(2)}`);
                
                if (this.onEpisodeComplete) {
                    this.onEpisodeComplete(episodeReward);
                }
                
            } catch (error) {
                console.error('Training episode failed:', error);
            }
        }, 2000); // New episode every 2 seconds
    }
    
    stopTraining() {
        this.isTraining = false;
        
        if (this.trainingInterval) {
            clearInterval(this.trainingInterval);
            this.trainingInterval = null;
        }
        
        console.log('Training stopped');
    }
}

// Evolution Strategies as alternative (faster, more stable)
class EvolutionStrategies {
    constructor(populationSize = 10) {
        this.populationSize = populationSize;
        this.policy = new TinyMLP([72, 64, 32, 21]);
        this.sigma = 0.1; // Noise standard deviation
        this.learningRate = 0.01;
    }
    
    async train(orchestrator, rewardFn, generations = 5) {
        console.log('Starting Evolution Strategies training...');
        
        for (let gen = 0; gen < generations; gen++) {
            // Generate population
            const population = [];
            const baseWeights = this.policy.serialize();
            
            for (let i = 0; i < this.populationSize; i++) {
                const noise = this.generateNoise(baseWeights);
                population.push(noise);
            }
            
            // Evaluate population
            const rewards = [];
            for (let i = 0; i < this.populationSize; i++) {
                // Apply noise
                const noisyPolicy = this.applyNoise(baseWeights, population[i]);
                
                // Quick evaluation (simplified)
                const reward = await this.evaluatePolicy(noisyPolicy, orchestrator, rewardFn);
                rewards.push(reward);
                
                console.log(`Individual ${i + 1}: Reward = ${reward.toFixed(2)}`);
            }
            
            // Update policy
            this.updatePolicyES(population, rewards);
            
            console.log(`Generation ${gen + 1} complete. Best reward: ${Math.max(...rewards).toFixed(2)}`);
        }
        
        return this.policy;
    }
    
    generateNoise(weights) {
        const noise = {
            weights: [],
            biases: []
        };
        
        for (let i = 0; i < weights.weights.length; i++) {
            const wNoise = weights.weights[i].map(row => 
                row.map(() => (Math.random() - 0.5) * 2 * this.sigma)
            );
            const bNoise = weights.biases[i].map(() => (Math.random() - 0.5) * 2 * this.sigma);
            
            noise.weights.push(wNoise);
            noise.biases.push(bNoise);
        }
        
        return noise;
    }
    
    applyNoise(base, noise) {
        const noisy = {
            layers: base.layers,
            weights: [],
            biases: []
        };
        
        for (let i = 0; i < base.weights.length; i++) {
            const w = base.weights[i].map((row, j) =>
                row.map((val, k) => val + noise.weights[i][j][k])
            );
            const b = base.biases[i].map((val, j) => val + noise.biases[i][j]);
            
            noisy.weights.push(w);
            noisy.biases.push(b);
        }
        
        return noisy;
    }
    
    async evaluatePolicy(policyData, orchestrator, rewardFn) {
        // Quick evaluation - just run for 50 steps
        const policy = TinyMLP.deserialize(policyData);
        let totalReward = 0;
        
        for (let step = 0; step < 50; step++) {
            const state = orchestrator.getEnvironmentState(0);
            if (state && state.observation) {
                const stateVec = this.observationToVector(state.observation);
                const action = policy.forward(stateVec);
                const reward = rewardFn(this.observationToState(state.observation), action);
                totalReward += reward;
            }
            await new Promise(resolve => setTimeout(resolve, 50));
        }
        
        return totalReward;
    }
    
    updatePolicyES(population, rewards) {
        // Normalize rewards
        const mean = rewards.reduce((a, b) => a + b) / rewards.length;
        const std = Math.sqrt(rewards.map(r => (r - mean) ** 2).reduce((a, b) => a + b) / rewards.length);
        const normalizedRewards = rewards.map(r => (r - mean) / (std + 1e-8));
        
        // Update weights
        const currentWeights = this.policy.serialize();
        
        for (let i = 0; i < currentWeights.weights.length; i++) {
            for (let j = 0; j < currentWeights.weights[i].length; j++) {
                for (let k = 0; k < currentWeights.weights[i][j].length; k++) {
                    let update = 0;
                    for (let p = 0; p < this.populationSize; p++) {
                        update += normalizedRewards[p] * population[p].weights[i][j][k];
                    }
                    currentWeights.weights[i][j][k] += this.learningRate * update / this.populationSize;
                }
            }
        }
        
        this.policy = TinyMLP.deserialize(currentWeights);
    }
    
    // Reuse observation conversion methods
    observationToVector(obs) {
        return BrowserRL.prototype.observationToVector.call(this, obs);
    }
    
    observationToState(obs) {
        return BrowserRL.prototype.observationToState.call(this, obs);
    }
}

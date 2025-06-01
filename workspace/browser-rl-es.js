/**
 * Evolution Strategies for Browser-based RL
 * A more robust implementation that actually learns
 */

class ImprovedNN {
    constructor(inputSize = 72, hiddenSizes = [128, 64], outputSize = 21) {
        this.layers = [];
        
        // Build network architecture
        let prevSize = inputSize;
        for (const hiddenSize of hiddenSizes) {
            this.layers.push({
                weights: this.xavierInit(prevSize, hiddenSize),
                bias: new Array(hiddenSize).fill(0)
            });
            prevSize = hiddenSize;
        }
        
        // Output layer
        this.layers.push({
            weights: this.xavierInit(prevSize, outputSize),
            bias: new Array(outputSize).fill(0)
        });
        
        // Flatten parameters for ES
        this.theta = this.flatten();
        this.numParams = this.theta.length;
    }
    
    xavierInit(fanIn, fanOut) {
        const scale = Math.sqrt(2.0 / (fanIn + fanOut));
        const weights = [];
        for (let i = 0; i < fanIn; i++) {
            const row = [];
            for (let j = 0; j < fanOut; j++) {
                row.push(this.randn() * scale);
            }
            weights.push(row);
        }
        return weights;
    }
    
    randn() {
        // Box-Muller transform
        const u1 = Math.random();
        const u2 = Math.random();
        return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    }
    
    flatten() {
        const params = [];
        for (const layer of this.layers) {
            // Flatten weights
            for (const row of layer.weights) {
                params.push(...row);
            }
            // Add biases
            params.push(...layer.bias);
        }
        return params;
    }
    
    unflatten(theta) {
        let idx = 0;
        for (const layer of this.layers) {
            // Unflatten weights
            for (let i = 0; i < layer.weights.length; i++) {
                for (let j = 0; j < layer.weights[i].length; j++) {
                    layer.weights[i][j] = theta[idx++];
                }
            }
            // Unflatten biases
            for (let i = 0; i < layer.bias.length; i++) {
                layer.bias[i] = theta[idx++];
            }
        }
    }
    
    forward(input) {
        let x = input.slice(); // Copy input
        
        // Forward through each layer
        for (let i = 0; i < this.layers.length; i++) {
            const layer = this.layers[i];
            const output = new Array(layer.bias.length).fill(0);
            
            // Matrix multiply + bias
            for (let j = 0; j < layer.weights[0].length; j++) {
                for (let k = 0; k < layer.weights.length; k++) {
                    output[j] += x[k] * layer.weights[k][j];
                }
                output[j] += layer.bias[j];
                
                // Activation (ReLU for hidden, tanh for output)
                if (i < this.layers.length - 1) {
                    output[j] = Math.max(0, output[j]); // ReLU
                } else {
                    output[j] = Math.tanh(output[j]); // Tanh for actions
                }
            }
            
            x = output;
        }
        
        return x;
    }
    
    setTheta(theta) {
        this.theta = theta.slice();
        this.unflatten(this.theta);
    }
}

class EvolutionStrategiesRL {
    constructor(options = {}) {
        this.inputSize = options.inputSize || 72;
        this.hiddenSizes = options.hiddenSizes || [128, 64];
        this.outputSize = options.outputSize || 21;
        
        // ES hyperparameters
        this.populationSize = options.populationSize || 50;
        this.sigma = options.sigma || 0.1;
        this.learningRate = options.learningRate || 0.01;
        this.antithetic = options.antithetic !== false; // Use antithetic sampling
        
        // Initialize network
        this.policy = new ImprovedNN(this.inputSize, this.hiddenSizes, this.outputSize);
        
        // Statistics
        this.generation = 0;
        this.bestReward = -Infinity;
        this.rewardHistory = [];
        
        console.log(`Initialized ES with ${this.policy.numParams} parameters`);
    }
    
    async trainGeneration(orchestrator, rewardFunction, envId) {
        const theta = this.policy.theta;
        const noises = [];
        const rewards = [];
        
        // Generate population with antithetic sampling
        const halfPop = Math.floor(this.populationSize / 2);
        
        for (let i = 0; i < halfPop; i++) {
            // Generate noise
            const noise = new Array(theta.length);
            for (let j = 0; j < theta.length; j++) {
                noise[j] = this.randn() * this.sigma;
            }
            
            if (this.antithetic) {
                // Positive perturbation
                const thetaPlus = theta.map((t, j) => t + noise[j]);
                this.policy.setTheta(thetaPlus);
                const rewardPlus = await this.evaluatePolicy(orchestrator, rewardFunction, envId);
                
                // Negative perturbation
                const thetaMinus = theta.map((t, j) => t - noise[j]);
                this.policy.setTheta(thetaMinus);
                const rewardMinus = await this.evaluatePolicy(orchestrator, rewardFunction, envId);
                
                noises.push(noise, noise); // Same noise twice
                rewards.push(rewardPlus, -rewardMinus); // Antithetic
            } else {
                // Just positive perturbation
                const thetaPerturbed = theta.map((t, j) => t + noise[j]);
                this.policy.setTheta(thetaPerturbed);
                const reward = await this.evaluatePolicy(orchestrator, rewardFunction, envId);
                
                noises.push(noise);
                rewards.push(reward);
            }
        }
        
        // Compute standardized rewards (rank-based)
        const rankedRewards = this.rankTransform(rewards);
        
        // Compute gradient
        const gradient = new Array(theta.length).fill(0);
        for (let i = 0; i < noises.length; i++) {
            const noise = noises[i];
            const advantage = rankedRewards[i];
            
            for (let j = 0; j < gradient.length; j++) {
                gradient[j] += noise[j] * advantage;
            }
        }
        
        // Normalize gradient
        const scale = 1.0 / (this.sigma * noises.length);
        for (let j = 0; j < gradient.length; j++) {
            gradient[j] *= scale;
        }
        
        // Update parameters
        for (let j = 0; j < theta.length; j++) {
            theta[j] += this.learningRate * gradient[j];
        }
        
        // Set updated parameters
        this.policy.setTheta(theta);
        
        // Track statistics
        const meanReward = rewards.reduce((a, b) => a + b, 0) / rewards.length;
        const maxReward = Math.max(...rewards);
        this.rewardHistory.push(meanReward);
        
        if (maxReward > this.bestReward) {
            this.bestReward = maxReward;
        }
        
        this.generation++;
        
        console.log(`Generation ${this.generation}: Mean=${meanReward.toFixed(2)}, Max=${maxReward.toFixed(2)}, Best=${this.bestReward.toFixed(2)}`);
        
        return {
            meanReward,
            maxReward,
            bestReward: this.bestReward
        };
    }
    
    rankTransform(rewards) {
        // Convert rewards to ranks (normalized)
        const sorted = [...rewards].sort((a, b) => a - b);
        const ranks = rewards.map(r => sorted.indexOf(r));
        
        // Normalize to [-1, 1]
        const n = ranks.length;
        return ranks.map(r => (r - (n - 1) / 2) / ((n - 1) / 2));
    }
    
    async evaluatePolicy(orchestrator, rewardFunction, envId) {
        // Run one episode
        const rewards = [];
        const maxSteps = 500;
        
        // Reset environment
        await orchestrator.resetEnvironment(envId);
        
        for (let step = 0; step < maxSteps; step++) {
            // Get observation
            const rawObs = await orchestrator.getObservation(envId);
            const obs = this.processObservation(rawObs);
            
            // Get action from policy
            const action = this.policy.forward(obs);
            
            // Step environment
            await orchestrator.stepEnvironment(envId, action);
            
            // Get reward
            const state = await orchestrator.getObservation(envId);
            const reward = rewardFunction(state, action);
            rewards.push(reward);
            
            // Check if done (robot fell)
            if (state.bodyPos && state.bodyPos[2] < 0.3) {
                break;
            }
        }
        
        // Return total reward
        return rewards.reduce((a, b) => a + b, 0);
    }
    
    processObservation(obs) {
        // Ensure we have a valid observation
        const processed = [];
        
        // Body position (3)
        const bodyPos = obs.bodyPos || [0, 0, 0];
        processed.push(...bodyPos);
        
        // Body velocity (3)  
        const bodyVel = obs.bodyVel || [0, 0, 0];
        processed.push(...bodyVel);
        
        // Joint positions (21)
        const qpos = obs.qpos || new Array(21).fill(0);
        processed.push(...qpos.slice(0, 21));
        
        // Joint velocities (21)
        const qvel = obs.qvel || new Array(21).fill(0);
        processed.push(...qvel.slice(0, 21));
        
        // Contact forces (24)
        const cfrc = obs.cfrc_ext || new Array(24).fill(0);
        processed.push(...cfrc.slice(0, 24));
        
        // Pad or truncate to exact size
        while (processed.length < this.inputSize) {
            processed.push(0);
        }
        
        return processed.slice(0, this.inputSize);
    }
    
    randn() {
        const u1 = Math.random();
        const u2 = Math.random();
        return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    }
    
    getAction(observation) {
        return this.policy.forward(observation);
    }
    
    serialize() {
        return {
            theta: this.policy.theta,
            generation: this.generation,
            bestReward: this.bestReward,
            architecture: {
                inputSize: this.inputSize,
                hiddenSizes: this.hiddenSizes,
                outputSize: this.outputSize
            }
        };
    }
    
    deserialize(data) {
        this.policy.setTheta(data.theta);
        this.generation = data.generation || 0;
        this.bestReward = data.bestReward || -Infinity;
    }
}

// Export for use
window.EvolutionStrategiesRL = EvolutionStrategiesRL;
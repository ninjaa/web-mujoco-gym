/**
 * Evolution Strategy for Reliable RL Convergence
 * Uses population-based training with real fitness evaluation
 */

class EvolutionStrategy {
    constructor(inputDim = 72, outputDim = 21, populationSize = 50) {
        this.inputDim = inputDim;
        this.outputDim = outputDim;
        this.populationSize = populationSize;
        this.eliteSize = Math.floor(populationSize * 0.2); // Keep top 20%
        this.mutationRate = 0.1;
        this.mutationStrength = 0.05;
        
        // Initialize population
        this.population = [];
        for (let i = 0; i < populationSize; i++) {
            this.population.push({
                network: new TinyMLP([inputDim, 64, 32, outputDim]),
                fitness: -Infinity,
                age: 0
            });
        }
        
        // Best ever
        this.champion = null;
        this.generation = 0;
    }
    
    async evaluatePopulation(orchestrator, rewardFunction, episodesPerIndividual = 3) {
        console.log(`Generation ${this.generation}: Evaluating ${this.populationSize} policies...`);
        
        // Evaluate each individual
        for (let i = 0; i < this.population.length; i++) {
            const individual = this.population[i];
            let totalReward = 0;
            
            // Run multiple episodes for more stable evaluation
            for (let ep = 0; ep < episodesPerIndividual; ep++) {
                const reward = await this.evaluateIndividual(
                    individual.network, 
                    orchestrator, 
                    rewardFunction
                );
                totalReward += reward;
            }
            
            individual.fitness = totalReward / episodesPerIndividual;
            individual.age++;
        }
        
        // Sort by fitness
        this.population.sort((a, b) => b.fitness - a.fitness);
        
        // Update champion
        if (!this.champion || this.population[0].fitness > this.champion.fitness) {
            this.champion = {
                network: this.cloneNetwork(this.population[0].network),
                fitness: this.population[0].fitness,
                generation: this.generation
            };
            console.log(`New champion! Fitness: ${this.champion.fitness.toFixed(2)}`);
        }
        
        this.generation++;
    }
    
    async evaluateIndividual(network, orchestrator, rewardFunction) {
        // Reset environment
        orchestrator.workers[0].postMessage({
            type: 'reset',
            environmentId: 0
        });
        
        await new Promise(resolve => setTimeout(resolve, 100));
        
        let totalReward = 0;
        const maxSteps = 300;
        
        for (let step = 0; step < maxSteps; step++) {
            const state = orchestrator.getEnvironmentState(0);
            if (!state || !state.observation) continue;
            
            // Get action from network
            const stateVec = this.observationToVector(state.observation);
            const action = network.forward(stateVec);
            
            // Apply small exploration noise during evaluation
            for (let i = 0; i < action.length; i++) {
                action[i] += (Math.random() - 0.5) * 0.05;
                action[i] = Math.max(-1, Math.min(1, action[i]));
            }
            
            // Apply action
            orchestrator.setAction(0, action);
            
            // Calculate reward
            const reward = rewardFunction(this.observationToState(state.observation), action);
            totalReward += reward;
            
            // Small delay for physics
            await new Promise(resolve => setTimeout(resolve, 10));
        }
        
        return totalReward;
    }
    
    evolve() {
        // Keep elites
        const elites = this.population.slice(0, this.eliteSize);
        
        // Create new population
        const newPopulation = [];
        
        // Keep elites unchanged
        for (const elite of elites) {
            newPopulation.push({
                network: this.cloneNetwork(elite.network),
                fitness: elite.fitness,
                age: elite.age
            });
        }
        
        // Fill rest with offspring
        while (newPopulation.length < this.populationSize) {
            // Tournament selection
            const parent1 = this.tournamentSelect();
            const parent2 = this.tournamentSelect();
            
            // Crossover
            const offspring = this.crossover(parent1.network, parent2.network);
            
            // Mutation
            this.mutate(offspring);
            
            newPopulation.push({
                network: offspring,
                fitness: -Infinity,
                age: 0
            });
        }
        
        this.population = newPopulation;
    }
    
    tournamentSelect(tournamentSize = 3) {
        let best = null;
        
        for (let i = 0; i < tournamentSize; i++) {
            const idx = Math.floor(Math.random() * this.eliteSize * 2); // Bias towards better individuals
            const individual = this.population[Math.min(idx, this.population.length - 1)];
            
            if (!best || individual.fitness > best.fitness) {
                best = individual;
            }
        }
        
        return best;
    }
    
    crossover(parent1, parent2) {
        const child = new TinyMLP(parent1.layers);
        
        // Uniform crossover
        for (let i = 0; i < child.weights.length; i++) {
            for (let j = 0; j < child.weights[i].length; j++) {
                for (let k = 0; k < child.weights[i][j].length; k++) {
                    if (Math.random() < 0.5) {
                        child.weights[i][j][k] = parent1.weights[i][j][k];
                    } else {
                        child.weights[i][j][k] = parent2.weights[i][j][k];
                    }
                }
            }
            
            // Biases
            for (let j = 0; j < child.biases[i].length; j++) {
                if (Math.random() < 0.5) {
                    child.biases[i][j] = parent1.biases[i][j];
                } else {
                    child.biases[i][j] = parent2.biases[i][j];
                }
            }
        }
        
        return child;
    }
    
    mutate(network) {
        // Gaussian mutation
        for (let i = 0; i < network.weights.length; i++) {
            for (let j = 0; j < network.weights[i].length; j++) {
                for (let k = 0; k < network.weights[i][j].length; k++) {
                    if (Math.random() < this.mutationRate) {
                        const noise = this.gaussianRandom() * this.mutationStrength;
                        network.weights[i][j][k] += noise;
                        network.weights[i][j][k] = Math.max(-2, Math.min(2, network.weights[i][j][k]));
                    }
                }
            }
            
            // Mutate biases
            for (let j = 0; j < network.biases[i].length; j++) {
                if (Math.random() < this.mutationRate) {
                    const noise = this.gaussianRandom() * this.mutationStrength * 0.5;
                    network.biases[i][j] += noise;
                    network.biases[i][j] = Math.max(-1, Math.min(1, network.biases[i][j]));
                }
            }
        }
    }
    
    cloneNetwork(network) {
        const clone = new TinyMLP(network.layers);
        
        // Deep copy weights and biases
        for (let i = 0; i < network.weights.length; i++) {
            clone.weights[i] = network.weights[i].map(row => [...row]);
            clone.biases[i] = [...network.biases[i]];
        }
        
        return clone;
    }
    
    gaussianRandom() {
        // Box-Muller transform
        let u = 0, v = 0;
        while (u === 0) u = Math.random();
        while (v === 0) v = Math.random();
        return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
    }
    
    // Helper functions (same as BrowserRL)
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
    
    observationToState(obs) {
        return {
            bodyPos: obs.bodyPos || [0, 0, 0],
            bodyVel: obs.bodyVel || (obs.qvel ? obs.qvel.slice(0, 3) : [0, 0, 0]),
            jointAngles: obs.qpos ? obs.qpos.slice(7, 28) : new Array(21).fill(0),
            jointVelocities: obs.qvel ? obs.qvel.slice(6, 27) : new Array(21).fill(0)
        };
    }
    
    getChampion() {
        return this.champion;
    }
    
    getBestCurrent() {
        return this.population[0];
    }
}

// Export for use
if (typeof window !== 'undefined') {
    window.EvolutionStrategy = EvolutionStrategy;
}
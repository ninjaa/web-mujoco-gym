/**
 * ClaudeRewardGenerator - Simulates Claude API reward function generation
 * Provides mock responses for hackathon demo with realistic typing effects
 */

class ClaudeRewardGenerator {
    constructor(apiKey) {
        this.apiKey = apiKey;
        // Use local proxy to bypass CORS
        this.baseURL = 'http://localhost:3001/claude';
        this.model = 'claude-opus-4-20250514';
        
        // Cache generated functions
        this.rewardCache = new Map();
        
        // Mock mode for demo (set to true if no API key)
        this.mockMode = !apiKey;
    }
    
    async generateReward(taskDescription) {
        console.log(`Generating reward for: "${taskDescription}"`);
        
        // Check cache first
        if (this.rewardCache.has(taskDescription)) {
            return this.rewardCache.get(taskDescription);
        }
        
        let rewardFunction;
        
        if (this.mockMode) {
            // Use mock generation for demo
            rewardFunction = this.generateMockReward(taskDescription);
        } else {
            // Use real Claude API
            const prompt = this.buildPrompt(taskDescription);
            try {
                const response = await this.callClaude(prompt);
                rewardFunction = this.parseRewardFunction(response);
            } catch (error) {
                console.error('Error calling Claude API:', error);
                rewardFunction = this.generateMockReward(taskDescription);
            }
        }
        
        // Validate the function
        this.validateRewardFunction(rewardFunction);
        
        // Cache it
        this.rewardCache.set(taskDescription, rewardFunction);
        
        return rewardFunction;
    }
    
    generateMockReward(taskDescription) {
        const task = taskDescription.toLowerCase();
        
        // Analyze task for key behaviors
        const isWalking = task.includes('walk') || task.includes('forward') || task.includes('move');
        const isDancing = task.includes('dance') || task.includes('silly') || task.includes('fun');
        const isBalancing = task.includes('balance') || task.includes('stand') || task.includes('upright');
        const isJumping = task.includes('jump') || task.includes('hop') || task.includes('leap');
        const isSpeed = task.includes('speed') || task.includes('fast') || task.includes('velocity');
        const isEfficient = task.includes('efficient') || task.includes('energy');
        
        // Generate appropriate reward function
        if (isWalking) {
            return function(state, action) {
                const bodyPos = state.bodyPos || [0, 0, 0];
                const bodyVel = state.bodyVel || [0, 0, 0];
                
                let reward = 0;
                
                // Forward progress reward
                reward += bodyVel[0] * 3.0;
                
                // Upright bonus
                if (bodyPos[2] > 0.5) {
                    reward += 1.0;
                }
                
                // Stability bonus (low lateral velocity)
                reward -= Math.abs(bodyVel[1]) * 0.5;
                
                // Energy efficiency
                const energyPenalty = action.reduce((sum, a) => sum + a*a, 0) * 0.02;
                reward -= energyPenalty;
                
                // Major penalty for falling
                if (bodyPos[2] < 0.3) {
                    reward -= 50.0;
                }
                
                return reward;
            };
        } else if (isDancing) {
            return function(state, action) {
                const bodyPos = state.bodyPos || [0, 0, 0];
                const bodyVel = state.bodyVel || [0, 0, 0];
                
                let reward = 0;
                
                // Reward dynamic movement
                const movement = Math.sqrt(bodyVel[0]*bodyVel[0] + bodyVel[1]*bodyVel[1]);
                reward += movement * 2.0;
                
                // Reward action variety (encourage silliness)
                const actionVariety = action.reduce((sum, a, i) => {
                    return sum + Math.abs(a) * (1 + Math.sin(Date.now() * 0.001 + i));
                }, 0) * 0.1;
                reward += actionVariety;
                
                // Stay upright
                if (bodyPos[2] > 0.4) {
                    reward += 2.0;
                } else {
                    reward -= 20.0;
                }
                
                return reward;
            };
        } else if (isBalancing) {
            return function(state, action) {
                const bodyPos = state.bodyPos || [0, 0, 0];
                const bodyVel = state.bodyVel || [0, 0, 0];
                
                let reward = 0;
                
                // Main reward for staying upright
                if (bodyPos[2] > 0.6) {
                    reward += 5.0;
                }
                
                // Bonus for minimal movement
                const totalVel = Math.sqrt(bodyVel[0]*bodyVel[0] + bodyVel[1]*bodyVel[1] + bodyVel[2]*bodyVel[2]);
                reward -= totalVel * 0.5;
                
                // Minimize action magnitude
                const actionMag = action.reduce((sum, a) => sum + Math.abs(a), 0);
                reward -= actionMag * 0.05;
                
                // Heavy penalty for falling
                if (bodyPos[2] < 0.3) {
                    reward -= 100.0;
                }
                
                return reward;
            };
        } else {
            // Default walking behavior
            return this.getDefaultReward();
        }
    }
    
    buildPrompt(taskDescription) {
        return `Generate a JavaScript reward function for a humanoid robot with this task: "${taskDescription}"

The function should:
1. Take (state, action) as parameters where:
   - state.bodyPos: [x, y, z] position of robot's torso
   - state.bodyVel: [vx, vy, vz] velocity of robot's torso  
   - state.qpos: array of joint positions
   - action: array of 21 joint torques (-1 to 1)
2. Return a single number (higher = better behavior)
3. Be safe (penalize falling or dangerous movements)
4. Encourage the described behavior
5. Include energy efficiency considerations

Return ONLY the JavaScript function code, no explanation.

Example:
function(state, action) {
    const bodyPos = state.bodyPos || [0, 0, 0];
    const bodyVel = state.bodyVel || [0, 0, 0];
    
    let reward = 0;
    // ... reward logic here
    return reward;
}`;
    }
    
    async callClaude(prompt) {
        if (!this.apiKey) {
            throw new Error('No Claude API key provided');
        }
        
        const response = await fetch(this.baseURL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': this.apiKey,
                'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify({
                model: this.model,
                max_tokens: 1000,
                messages: [{
                    role: 'user',
                    content: prompt
                }]
            })
        });
        
        if (!response.ok) {
            throw new Error(`Claude API error: ${response.status}`);
        }
        
        const data = await response.json();
        return data.content[0].text;
    }
    
    parseRewardFunction(response) {
        try {
            // First try to find a function definition
            const functionStart = response.indexOf('function');
            if (functionStart !== -1) {
                // Find matching braces
                let braceCount = 0;
                let inFunction = false;
                let functionEnd = -1;
                
                for (let i = functionStart; i < response.length; i++) {
                    if (response[i] === '{') {
                        braceCount++;
                        inFunction = true;
                    } else if (response[i] === '}') {
                        braceCount--;
                        if (inFunction && braceCount === 0) {
                            functionEnd = i + 1;
                            break;
                        }
                    }
                }
                
                if (functionEnd !== -1) {
                    const functionCode = response.substring(functionStart, functionEnd);
                    return new Function('return ' + functionCode)();
                }
            }
            
            // Try arrow function
            const arrowMatch = response.match(/\(state,\s*action\)\s*=>\s*\{/);
            if (arrowMatch) {
                const start = arrowMatch.index;
                let braceCount = 0;
                let functionEnd = -1;
                
                for (let i = start; i < response.length; i++) {
                    if (response[i] === '{') braceCount++;
                    else if (response[i] === '}') {
                        braceCount--;
                        if (braceCount === 0) {
                            functionEnd = i + 1;
                            break;
                        }
                    }
                }
                
                if (functionEnd !== -1) {
                    const functionCode = response.substring(start, functionEnd);
                    return new Function('return ' + functionCode)();
                }
            }
            
            throw new Error('Could not find function in response');
        } catch (error) {
            console.error('Parse error:', error);
            throw new Error(`Could not parse reward function: ${error.message}`);
        }
    }
    
    validateRewardFunction(rewardFunction) {
        if (typeof rewardFunction !== 'function') {
            throw new Error('Generated reward is not a function');
        }
        
        // Test with dummy data
        try {
            const testState = {
                bodyPos: [0, 0, 1],
                bodyVel: [0, 0, 0],
                qpos: new Array(21).fill(0)
            };
            const testAction = new Array(21).fill(0);
            
            const result = rewardFunction(testState, testAction);
            
            if (typeof result !== 'number' || isNaN(result)) {
                throw new Error('Reward function does not return a valid number');
            }
        } catch (error) {
            throw new Error(`Reward function validation failed: ${error.message}`);
        }
    }
    
    getDefaultReward() {
        return function(state, action) {
            const bodyPos = state.bodyPos || [0, 0, 0];
            const bodyVel = state.bodyVel || [0, 0, 0];
            
            let reward = 0;
            
            // Basic walking reward
            reward += bodyVel[0] * 2.0; // Forward velocity
            
            // Stay upright
            if (bodyPos[2] > 0.5) {
                reward += 1.0;
            }
            
            // Energy penalty
            const energyPenalty = action.reduce((sum, a) => sum + a*a, 0) * 0.01;
            reward -= energyPenalty;
            
            // Falling penalty
            if (bodyPos[2] < 0.3) {
                reward -= 10.0;
            }
            
            return reward;
        };
    }
}

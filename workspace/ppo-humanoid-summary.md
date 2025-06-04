# PPO Implementation for MuJoCo Humanoid Balancing Task

## Current Setup
**Task**: Train humanoid to stand and balance (not walk)  
**Environment**: MuJoCo Humanoid via TensorFlow.js  
**Algorithm**: PPO with GAE

## PPO Hyperparameters
```javascript
// Core PPO
clipEpsilon: 0.1         // (reduced from 0.2)
gamma: 0.99              // discount factor
lambda: 0.95             // GAE lambda
epochs: 5                // per batch
entropyCoef: 0.05        // (increased from 0.01)
valueLossCoef: 0.5       

// Training
batchSize: 20            // samples before training
actorLr: 1e-3           // (increased from 1e-4)
criticLr: 1e-3          
maxGradNorm: 0.5         // gradient clipping

// Networks
hiddenDim: 256           // 2 hidden layers each
actionDim: 17            // continuous actions
explorationScale: 0.5    // action noise multiplier
```

## Reward Function (normalized ~1.0/step)
- Height reward: 0.3 (if height > 0.8m)
- Survival bonus: 0.2 (scales with time)
- Uprightness: 0.2 (quaternion w > 0.8)
- Angular stability: 0.15 (low angular velocity)
- Position stability: 0.1 (stay centered)
- Muscle efficiency: 0.1 (low activation)
- Velocity penalty: -0.2 (penalize ANY movement)
- Joint velocity penalty: -0.05
- Alive bonus: 0.05
- Termination: -0.5 if height < 0.7m

## Results
- Episodes plateau at 20-50 steps
- No improvement trend after 70+ episodes
- Actor loss successfully goes negative
- Critic loss stable (~1-2)
- Agent appears stuck in local optimum (quick falling)

## Attempted Solutions
1. ✓ Fixed critic loss calculation bug
2. ✓ Normalized rewards (was 20x too high)
3. ✓ Increased learning rates 10x
4. ✓ Reduced batch size for frequent updates
5. ✓ Memory retention between batches
6. ✓ Reduced PPO clipping
7. ✓ Increased entropy coefficient
8. ✓ Added reward shaping
9. ✗ Still no learning progress

## Questions for Experts
1. Is batch size 20 too small for stable PPO?
2. Should we use minibatches within epochs?
3. Are we missing key state features?
4. Is the action noise initialization appropriate?
5. Should we implement learning rate scheduling?

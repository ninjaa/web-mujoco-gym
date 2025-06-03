// ppo-agent.js

class PPOAgent {
  constructor(
    stateDim = 83,
    actionDim = 21,
    actorLr = 1e-4,
    criticLr = 1e-4,
    hiddenDim = 256
  ) {
    this.stateDim = stateDim;
    this.actionDim = actionDim;
    this.actorLr = actorLr;
    this.criticLr = criticLr;
    this.hiddenDim = hiddenDim;

    // Ensure TensorFlow.js is available
    if (typeof tf === "undefined") {
      console.error(
        "TensorFlow.js not loaded. Ensure the script is included in your HTML."
      );
      return;
    }

    this.actor = this._createActorNetwork();
    this.critic = this._createCriticNetwork();

    this.actorOptimizer = tf.train.adam(this.actorLr);
    this.criticOptimizer = tf.train.adam(this.criticLr);

    // PPO-specific hyperparameters (will be used later)
    this.gamma = 0.99; // Discount factor for future rewards
    this.lambda = 0.95; // GAE lambda for advantage estimation
    this.clipEpsilon = 0.2; // PPO clipping parameter
    this.epochs = 10; // Number of epochs to train on each batch
    this.miniBatchSize = 64; // Mini-batch size for training
    this.maxMemorySize = 2048; // Maximum memory buffer size
    this.entropyCoef = 0.01; // Entropy bonus to encourage exploration
    this.valueLossCoef = 0.5; // Coefficient for value loss
    this.maxGradNorm = 0.5; // Maximum gradient norm for clipping
    this.batchSize = 64; // Batch size for training

    this.memory = []; // Buffer to store trajectories
    this.prevState = null;
    this.prevAction = null;
    this.prevLogProb = null;
    this.prevRawAction = null; // For action smoothing
    
    // Add NaN check counter
    this.nanCounter = 0;
    this.maxNaNAttempts = 5;
    this.episodeCount = 0;
    
    // Action smoothing parameter
    this.actionSmoothingFactor = 0.7; // 0 = no smoothing, 1 = full smoothing
    
    console.log("PPOAgent initialized with TensorFlow.js and memory buffer.");
  }

  _createActorNetwork() {
    const model = tf.sequential();
    model.add(
      tf.layers.dense({
        units: this.hiddenDim,
        activation: "relu",
        inputShape: [this.stateDim],
      })
    );
    model.add(
      tf.layers.dense({
        units: this.hiddenDim,
        activation: "relu",
      })
    );
    // Actor outputs mean and log_std for continuous actions
    model.add(
      tf.layers.dense({
        units: 2 * this.actionDim, // mean + log_std for each action
        activation: "linear",
        kernelInitializer: 'glorotUniform',
        biasInitializer: tf.initializers.constant({ value: -1.0 }) // Start with smaller actions
      })
    );
    return model;
  }

  _createCriticNetwork() {
    const model = tf.sequential();
    model.add(
      tf.layers.dense({
        units: this.hiddenDim,
        activation: "relu",
        inputShape: [this.stateDim],
      })
    );
    model.add(
      tf.layers.dense({
        units: this.hiddenDim,
        activation: "relu",
      })
    );
    // Outputs a single value V(s) - the estimated value of the state
    model.add(
      tf.layers.dense({
        units: 1,
        activation: "linear",
      })
    );
    return model;
  }

  _checkAndResetIfNaN() {
    // Check if actor network has NaN weights
    let hasNaN = false;
    this.actor.layers.forEach(layer => {
      if (layer.getWeights().length > 0) {
        const weights = layer.getWeights()[0];
        const weightData = weights.dataSync();
        if (Array.from(weightData).some(w => isNaN(w) || !isFinite(w))) {
          hasNaN = true;
        }
      }
    });
    
    if (hasNaN) {
      console.warn('NaN detected in actor network weights. Reinitializing...');
      this.actor = this._createActorNetwork();
      this.actorOptimizer = tf.train.adam(this.actorLr);
      this.nanCounter = 0;
    }
    
    return hasNaN;
  }

  // Method to get an action from the policy (actor network)
  getAction(state, training = true) {
    // Check for NaN in weights before forward pass
    this._checkAndResetIfNaN();
    
    return tf.tidy(() => {
      const stateTensor = tf.tensor2d([state]); // Batch size of 1
      const actorOutput = this.actor.predict(stateTensor);

      // Split the output into mean_logits and log_std
      const mean_logits = actorOutput.slice([0, 0], [1, this.actionDim]);
      const log_std = actorOutput.slice(
        [0, this.actionDim],
        [1, this.actionDim]
      );

      const mean = tf.tanh(mean_logits); // Apply tanh to get bounded mean
      // Clip log_std to prevent extreme values
      const clipped_log_std = tf.clipByValue(log_std, -2, 2);
      const std = tf.exp(clipped_log_std); // std = e^(log_std)

      let actionTensor;
      if (training) {
        // Manual normal distribution sampling with exploration scheduling
        const explorationScale = Math.max(0.3, 1.0 - this.episodeCount / 100); // Decay exploration
        const noise = tf.randomNormal(mean.shape);
        actionTensor = tf.add(mean, tf.mul(tf.mul(noise, std), explorationScale));
      } else {
        actionTensor = mean; // Deterministic action for evaluation
      }

      // Clip action to be strictly within [-1, 1] range to match tanh activation space
      // Add a small epsilon to prevent issues if values are exactly at the boundary.
      actionTensor = tf.clipByValue(actionTensor, -1 + 1e-6, 1 - 1e-6);

      // Calculate log probability (for PPO)
      // log_prob = -0.5 * sum((action - mean)^2 / std^2) - sum(log(std)) - 0.5 * action_dim * log(2π)
      const diff = tf.sub(actionTensor, mean);
      const logProbTensor = tf
        .mul(tf.square(diff), tf.div(1, tf.mul(2, tf.square(std))))
        .add(tf.log(std))
        .add(0.5 * Math.log(2 * Math.PI))
        .mul(-1)
        .sum(1);

      const actionArray = actionTensor.arraySync()[0];
      const logProbValue = logProbTensor.arraySync()[0];
      
      // NaN protection
      const hasNaN = actionArray.some(a => isNaN(a) || !isFinite(a));
      if (hasNaN || isNaN(logProbValue) || !isFinite(logProbValue)) {
        console.warn('NaN detected in action generation, returning zeros');
        return {
          action: new Array(this.actionDim).fill(0),
          logProb: 0
        };
      }

      // Apply action smoothing
      if (this.prevRawAction) {
        const smoothedAction = actionArray.map((a, i) => {
          return this.prevRawAction[i] * this.actionSmoothingFactor + a * (1 - this.actionSmoothingFactor);
        });
        this.prevRawAction = smoothedAction;
        return {
          action: smoothedAction,
          logProb: logProbValue,
        };
      } else {
        this.prevRawAction = actionArray;
        return {
          action: actionArray,
          logProb: logProbValue,
        };
      }
    });
  }

  storeTransition(state, action, reward, nextState, done, logProb) {
    this.memory.push({
      state: state,
      action: action,
      reward: reward,
      nextState: nextState,
      done: done,
      logProb: logProb,
    });
  }

  async trainEpisode(
    orchestrator,
    rewardFunction,
    envId = 0,
    maxStepsPerEpisode = 1000
  ) {
    const episodeStart = Date.now();
    console.log(`PPOAgent: Starting episode ${this.episodeCount}`);
    
    // Apply learning rate decay after 30 episodes
    if (this.episodeCount > 30 && this.episodeCount % 10 === 0) {
      const newLr = this.actorLr * 0.95; // Slower decay
      console.log(`Reducing learning rate from ${this.actorLr} to ${newLr}`);
      this.actorLr = newLr;
      this.actorOptimizer = tf.train.adam(this.actorLr);
    }
    
    let totalEpisodeReward = 0;
    let episodeSteps = 0;

    // Reset the environment via direct worker message
    const workerId = Math.floor(envId / Math.ceil(orchestrator.numEnvironments / orchestrator.numWorkers));
    orchestrator.workers[workerId].postMessage({
      type: 'reset',
      data: {
        envId: envId
      },
      id: workerId
    });

    // Wait for reset to complete
    await new Promise(resolve => setTimeout(resolve, 100));

    // Main episode loop
    return new Promise((resolve) => {
      const stepInterval = setInterval(async () => {
        // Get current environment state
        const envState = orchestrator.getEnvironmentState(envId);
        if (!envState || !envState.observation) {
          return; // Skip if no observation yet
        }

        // Extract state from observation
        const currentState = this.extractState(envState.observation);
        
        // Get action from agent
        const { action, logProb } = this.getAction(currentState);
        
        // Set action for next physics step
        orchestrator.setAction(envId, action);
        
        // Calculate reward using the LLM-generated reward function
        let reward = 0;
        let done = envState.done;
        
        if (rewardFunction) {
          try {
            // Convert observation to state format expected by reward function
            const stateForReward = {
              bodyPos: envState.observation.bodyPos || [0, 0, 0],
              bodyVel: envState.observation.bodyVel || (envState.observation.qvel ? envState.observation.qvel.slice(0, 3) : [0, 0, 0]),
              bodyQuaternion: envState.observation.xquat ? 
                Array.from(envState.observation.xquat.slice(0, 4)) : 
                [1, 0, 0, 0], // Default quaternion if missing
              jointAngles: envState.observation.qpos ? envState.observation.qpos.slice(7, 28) : new Array(21).fill(0),
              jointVelocities: envState.observation.qvel ? envState.observation.qvel.slice(6, 27) : new Array(21).fill(0),
              footContacts: [true, true], // Simplified
              time: 0,
              prevAction: this.prevAction // Add previous action for smoothness
            };
            
            // Call reward function with both state and action (like BrowserRL does)
            const rewardResult = await rewardFunction(stateForReward, action);
            if (typeof rewardResult === 'object' && rewardResult !== null) {
              reward = rewardResult.reward || 0;
              done = rewardResult.done !== undefined ? rewardResult.done : done;
            } else {
              reward = rewardResult || 0;
            }
          } catch (error) {
            console.error('Error in reward function:', error);
            console.error('State that caused error:', stateForReward);
            console.error('Action that caused error:', action);
            reward = 0;
          }
        }

        totalEpisodeReward += reward;
        episodeSteps++;

        // Get next state for storing in memory (will be used in next iteration)
        const nextState = this.extractState(envState.observation);

        // Store transition in memory
        if (episodeSteps > 1) { // Skip first step since we don't have a previous action
          this.storeTransition(
            this.prevState,
            this.prevAction,
            reward,
            nextState,
            done,
            this.prevLogProb
          );
        }

        // Store current values for next iteration
        this.prevState = currentState;
        this.prevAction = action;
        this.prevLogProb = logProb;

        // Check if episode is done
        if (done || episodeSteps >= maxStepsPerEpisode) {
          clearInterval(stepInterval);
          
          console.log(
            `PPOAgent: Episode ${this.episodeCount} completed. Steps: ${episodeSteps}, Total Reward: ${totalEpisodeReward.toFixed(
              2
            )}`
          );

          // Train the agent with collected experience
          if (this.memory.length >= this.batchSize * 2) { // Wait for more data
            console.log("Training PPO agent...");
            this.train();
            this.clearMemory();
          }

          this.episodeCount++;

          resolve(totalEpisodeReward);
        }
      }, 50); // 20Hz training loop
    });
  }

  extractState(observationData) {
    if (!observationData) {
      console.error(
        "PPOAgent.extractState: Received null or undefined observationData."
      );
      return new Array(this.stateDim).fill(0); // Should be 83
    }

    // Actual structure of observationData from orchestrator:
    // observationData.bodyPos: [x,y,z] position of torso/root body
    // observationData.qpos: Joint positions (28 elements for humanoid)
    // observationData.qvel: Joint velocities (27 elements for humanoid)
    // observationData.xpos: Body positions (51 elements = 17 bodies * 3)
    // observationData.xquat: Body quaternions (68 elements = 17 bodies * 4)

    const { bodyPos, qpos, qvel, xpos, xquat } = observationData;

    if (!bodyPos || !qpos || !qvel) {
      console.error(
        "PPOAgent.extractState: observationData is missing required properties (bodyPos, qpos, qvel). Using zero state.",
        observationData
      );
      return new Array(this.stateDim).fill(0);
    }

    // Extract root position and quaternion from xpos and xquat arrays
    // Assuming first body (index 0) is the root/torso
    let root_xpos = [0, 0, 0];
    let root_xquat = [1, 0, 0, 0]; // Default quaternion (no rotation)
    
    if (xpos && xpos.length >= 3) {
      root_xpos = Array.from(xpos.slice(0, 3));
    } else if (bodyPos && bodyPos.length >= 3) {
      // Fallback to bodyPos if xpos not available
      root_xpos = Array.from(bodyPos);
    }
    
    if (xquat && xquat.length >= 4) {
      root_xquat = Array.from(xquat.slice(0, 4));
    }

    // Create placeholder sensor and contact data (not provided by orchestrator)
    const sensors = new Array(6).fill(0); // IMU sensor data placeholder
    const contacts = new Array(2).fill(0); // Foot contact data placeholder

    // Handle different array lengths based on what orchestrator provides
    const qposLength = Math.min(qpos.length, 28); // Humanoid has 28 qpos
    const qvelLength = Math.min(qvel.length, 27); // Humanoid has 27 qvel

    try {
      // Build state vector matching the grootState format
      // Total: 28 + 27 + 3 + 4 + 6 + 2 = 70 elements
      // But the grootState function expects 34 elements each for qpos and qvel
      // So we'll pad with zeros if needed
      const stateVector = [
        ...Array.from(qpos.slice(0, qposLength)),
        ...new Array(Math.max(0, 34 - qposLength)).fill(0), // Pad to 34
        ...Array.from(qvel.slice(0, qvelLength)),
        ...new Array(Math.max(0, 34 - qvelLength)).fill(0), // Pad to 34
        ...root_xpos,
        ...root_xquat,
        ...sensors,
        ...contacts,
      ];

      if (stateVector.length !== this.stateDim) {
        console.warn(
          `PPOAgent.extractState: State vector length (${stateVector.length}) does not match expected stateDim (${this.stateDim}). Adjusting...`
        );
        // Trim or pad to match expected dimension
        if (stateVector.length > this.stateDim) {
          return stateVector.slice(0, this.stateDim);
        } else {
          return [...stateVector, ...new Array(this.stateDim - stateVector.length).fill(0)];
        }
      }

      return stateVector;
    } catch (error) {
      console.error("PPOAgent.extractState: Error constructing state vector:", error);
      return new Array(this.stateDim).fill(0);
    }
  }

  clearMemory() {
    this.memory = [];
  }

  _calculateAdvantagesAndValueTargets() {
    const memorySize = this.memory.length;
    if (memorySize === 0) {
      return; // Nothing to process
    }

    // Collect states and nextStates for batch prediction
    const states = this.memory.map((mem) => mem.state);
    const nextStates = this.memory.map((mem) => mem.nextState);

    tf.tidy(() => {
      // Get value estimates from critic network
      const stateValues = this.critic.predict(tf.tensor2d(states)).dataSync();
      const nextStateValues = this.critic
        .predict(tf.tensor2d(nextStates))
        .dataSync();

      // Calculate advantages using GAE (Generalized Advantage Estimation)
      let gaeAdvantage = 0;
      for (let t = memorySize - 1; t >= 0; t--) {
        const transition = this.memory[t];
        const reward = transition.reward;
        const doneMask = transition.done ? 0 : 1; // 0 if done, 1 if not done

        const v_s = stateValues[t];
        const v_s_next = nextStateValues[t];

        // Calculate TD error (delta)
        const delta = reward + this.gamma * v_s_next * doneMask - v_s;

        // Calculate GAE advantage
        gaeAdvantage =
          delta + this.gamma * this.lambda * gaeAdvantage * doneMask;

        // Store advantage and value target (return)
        transition.advantage = gaeAdvantage;
        transition.valueTarget = gaeAdvantage + v_s; // G_t = A_t + V(s_t)
      }
    });

    // Normalize advantages for stability
    const advantages = this.memory.map((mem) => mem.advantage);
    const advMean = tf.mean(advantages).dataSync()[0];
    const advStd = tf.sqrt(tf.moments(advantages).variance).dataSync()[0];

    this.memory.forEach((transition) => {
      transition.advantage = (transition.advantage - advMean) / (advStd + 1e-8);
    });

    // Clean up tensors
    tf.dispose([tf.mean(advantages), tf.moments(advantages).variance]);
  }

  train() {
    console.log("Starting PPO training...");

    // Calculate advantages and value targets
    this._calculateAdvantagesAndValueTargets();

    // Collect states, actions, advantages, and old log probabilities for training
    const states = this.memory.map((mem) => mem.state);
    const actions = this.memory.map((mem) => mem.action);
    const advantages = this.memory.map((mem) => mem.advantage);
    const oldLogProbs = this.memory.map((mem) => mem.logProb);

    // Convert to tensors
    const stateTensor = tf.tensor2d(states);
    const actionTensor = tf.tensor2d(actions);
    const advantageTensor = tf.tensor1d(advantages);
    const oldLogProbTensor = tf.tensor1d(oldLogProbs);

    // Train actor and critic networks
    for (let epoch = 0; epoch < this.epochs; epoch++) {
      console.log(`Epoch ${epoch + 1} of ${this.epochs}`);

      // Train actor network
      this.actorOptimizer.minimize(() => {
        const actorOutput = this.actor.predict(stateTensor);
        
        // Split actor output into mean and log_std
        const mean = actorOutput.slice([0, 0], [stateTensor.shape[0], this.actionDim]);
        const log_std = actorOutput.slice(
          [0, this.actionDim],
          [stateTensor.shape[0], this.actionDim]
        );
        const std = tf.exp(log_std);
        
        // Calculate log probabilities manually for Normal distribution
        // log_prob = -0.5 * ((action - mean) / std)^2 - log(std) - 0.5 * log(2*pi)
        const diff = tf.sub(actionTensor, mean);
        const normalizedDiff = tf.div(diff, std);
        const logProbs = tf.add(
          tf.mul(tf.square(normalizedDiff), -0.5),
          tf.add(
            tf.mul(tf.log(std), -1),
            tf.scalar(-0.5 * Math.log(2 * Math.PI))
          )
        );
        
        // Sum log probabilities across action dimensions
        const newLogProbs = tf.sum(logProbs, 1);
        
        const ratio = tf.exp(tf.sub(newLogProbs, oldLogProbTensor));
        const clippedRatio = tf.clipByValue(
          ratio,
          1 - this.clipEpsilon,
          1 + this.clipEpsilon
        );
        const actorLoss = tf.neg(tf.mean(
          tf.minimum(
            tf.mul(ratio, advantageTensor), 
            tf.mul(clippedRatio, advantageTensor)
          )
        ));
        return actorLoss;
      });

      // Train critic network
      this.criticOptimizer.minimize(() => {
        const criticOutput = this.critic.predict(stateTensor);
        const criticLoss = tf.mean(tf.square(tf.sub(criticOutput.squeeze(), advantageTensor)));
        return criticLoss;
      });
    }

    // Clean up tensors
    stateTensor.dispose();
    actionTensor.dispose();
    advantageTensor.dispose();
    oldLogProbTensor.dispose();

    // Clear memory buffer
    this.clearMemory();

    console.log("PPO training completed.");
  }
}

// Example of how it might be used (for testing purposes, can be removed later)
/*
function testPPOAgent() {
    if (typeof tf === 'undefined') {
        console.error('TensorFlow.js not loaded. Skipping PPOAgent test.');
        return;
    }
    const stateDim = 10; // Example state dimension
    const actionDim = 4;  // Example action dimension
    const agent = new PPOAgent(stateDim, actionDim);

    if (agent.actor && agent.critic) {
        console.log("--- PPO Agent Created Successfully ---");
        agent.actor.summary();
        agent.critic.summary();

        // Create a dummy state vector
        const dummyState = [];
        for (let i = 0; i < stateDim; i++) {
            dummyState.push(Math.random() * 2 - 1); // Random values between -1 and 1
        }
        console.log("Dummy state:", dummyState);

        const action = agent.getAction(dummyState);
        console.log("Action for dummy state:", action);
    } else {
        console.error("PPOAgent models not created, TensorFlow.js might not be ready.");
    }
}

// Run the test after a short delay to ensure tfjs is loaded if this script is run early
// In a real app, you'd instantiate PPOAgent when appropriate.
// setTimeout(testPPOAgent, 1000);
*/

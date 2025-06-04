/**
 * PPO Agent for loading CleanRL pretrained models
 * Handles 376-dimensional state input and 17-dimensional action output
 */

class PPOAgentCleanRL {
  constructor() {
    this.actorModel = null;
    this.criticModel = null;
    this.actorLogStd = null;
    this.isLoaded = false;
    
    // Model specifications
    this.stateDim = 376;  // CleanRL Humanoid-v4 observation space
    this.actionDim = 17;  // Humanoid-v4 action space
    this.hiddenDim = 64;
    
    console.log('PPOAgentCleanRL initialized for 376-dim state, 17-dim actions');
  }
  
  /**
   * Create the neural network models
   */
  createModels() {
    // Create actor model
    const actorInput = tf.input({ shape: [this.stateDim] });
    const actorH1 = tf.layers.dense({ 
      units: this.hiddenDim, 
      activation: 'tanh',
      name: 'actor_dense_1'
    }).apply(actorInput);
    const actorH2 = tf.layers.dense({ 
      units: this.hiddenDim, 
      activation: 'tanh',
      name: 'actor_dense_2'
    }).apply(actorH1);
    const actorOutput = tf.layers.dense({ 
      units: this.actionDim, 
      activation: 'linear',
      name: 'actor_output'
    }).apply(actorH2);
    
    this.actorModel = tf.model({ inputs: actorInput, outputs: actorOutput });
    
    // Create critic model
    const criticInput = tf.input({ shape: [this.stateDim] });
    const criticH1 = tf.layers.dense({ 
      units: this.hiddenDim, 
      activation: 'tanh',
      name: 'critic_dense_1'
    }).apply(criticInput);
    const criticH2 = tf.layers.dense({ 
      units: this.hiddenDim, 
      activation: 'tanh',
      name: 'critic_dense_2'
    }).apply(criticH1);
    const criticOutput = tf.layers.dense({ 
      units: 1, 
      activation: 'linear',
      name: 'critic_output'
    }).apply(criticH2);
    
    this.criticModel = tf.model({ inputs: criticInput, outputs: criticOutput });
    
    console.log('✓ Models created');
  }
  
  /**
   * Load weights from JSON files
   */
  async loadWeights(modelPath = './pretrained_models/weights_json/') {
    try {
      console.log('Loading weights from JSON files...');
      
      // Load actor weights
      const actorResponse = await fetch(modelPath + 'actor_weights.json');
      const actorWeights = await actorResponse.json();
      
      // Set actor weights
      this.actorModel.layers[1].setWeights([
        tf.tensor2d(actorWeights.dense_1_kernel),
        tf.tensor1d(actorWeights.dense_1_bias)
      ]);
      this.actorModel.layers[2].setWeights([
        tf.tensor2d(actorWeights.dense_2_kernel),
        tf.tensor1d(actorWeights.dense_2_bias)
      ]);
      this.actorModel.layers[3].setWeights([
        tf.tensor2d(actorWeights.output_kernel),
        tf.tensor1d(actorWeights.output_bias)
      ]);
      console.log('✓ Actor weights loaded');
      
      // Load critic weights
      const criticResponse = await fetch(modelPath + 'critic_weights.json');
      const criticWeights = await criticResponse.json();
      
      // Set critic weights
      this.criticModel.layers[1].setWeights([
        tf.tensor2d(criticWeights.dense_1_kernel),
        tf.tensor1d(criticWeights.dense_1_bias)
      ]);
      this.criticModel.layers[2].setWeights([
        tf.tensor2d(criticWeights.dense_2_kernel),
        tf.tensor1d(criticWeights.dense_2_bias)
      ]);
      this.criticModel.layers[3].setWeights([
        tf.tensor2d(criticWeights.output_kernel),
        tf.tensor1d(criticWeights.output_bias)
      ]);
      console.log('✓ Critic weights loaded');
      
      // Load actor logstd
      const logstdResponse = await fetch(modelPath + 'actor_logstd.json');
      const logstdData = await logstdResponse.json();
      this.actorLogStd = tf.tensor(logstdData.values, logstdData.shape);
      console.log('✓ Actor logstd loaded:', this.actorLogStd.shape);
      
      // Load model info
      const infoResponse = await fetch(modelPath + 'model_info.json');
      const modelInfo = await infoResponse.json();
      console.log('✓ Model info:', modelInfo);
      
      return true;
      
    } catch (error) {
      console.error('❌ Failed to load weights:', error);
      return false;
    }
  }
  
  /**
   * Load pretrained CleanRL models
   */
  async loadModel(modelPath = './pretrained_models/weights_json/') {
    try {
      console.log('Loading CleanRL PPO models...');
      
      // Create models
      this.createModels();
      
      // Load weights
      const success = await this.loadWeights(modelPath);
      
      if (success) {
        this.isLoaded = true;
        console.log('🎉 CleanRL PPO model loaded successfully!');
        
        // Initialize normalization
        this.initializeNormalization();
        
        // Test with dummy input
        await this.testModel();
        
        return true;
      } else {
        return false;
      }
      
    } catch (error) {
      console.error('❌ Failed to load CleanRL model:', error);
      this.isLoaded = false;
      return false;
    }
  }
  
  /**
   * Test the loaded model with dummy input
   */
  async testModel() {
    console.log('Testing loaded model...');
    
    // Create test input
    const testState = new Array(this.stateDim).fill(0);
    testState[2] = 1.28; // Set some realistic values
    
    try {
      const result = await this.getActionAndValue(testState, true);
      console.log('✓ Test passed - Action sample:', result.action.slice(0, 5));
      console.log('✓ Test passed - Value estimate:', result.value);
      
      // Check action range
      const minAction = Math.min(...result.action);
      const maxAction = Math.max(...result.action);
      console.log(`✓ Action range: [${minAction.toFixed(3)}, ${maxAction.toFixed(3)}]`);
      
      if (maxAction > 1.0 || minAction < -1.0) {
        console.warn('⚠️ WARNING: Actions outside expected range [-1, 1]!');
      }
    } catch (error) {
      console.error('❌ Model test failed:', error);
    }
  }
  
  /**
   * Initialize observation normalization parameters
   * CleanRL uses running mean/std normalization
   */
  initializeNormalization() {
    // Since we don't have the exact normalization statistics from training,
    // we'll use a more conservative approach that just clips observations
    // This matches CleanRL's clipping to [-10, 10] range
    
    console.log('Observation normalization initialized (using clipping only)');
  }
  
  /**
   * Normalize observations using running statistics
   * This mimics gym.wrappers.NormalizeObservation
   */
  normalizeObservation(obs) {
    // Without exact training statistics, use a simple per-feature normalization
    // based on typical ranges for Humanoid-v4 observations
    
    const normalized = obs.map((value, idx) => {
      // Different normalization for different parts of the observation
      if (idx < 2) {
        // x, y positions - these can grow large, normalize by dividing by 10
        return value / 10.0;
      } else if (idx < 28) {
        // Other qpos values - typically in [-2, 2]
        return value / 2.0;
      } else if (idx < 51) {
        // qvel values - typically in [-10, 10]
        return value / 10.0;
      } else {
        // Forces and other features - can be very large
        return value / 50.0;
      }
    });
    
    // Clip to [-10, 10] as CleanRL does
    return normalized.map(v => Math.max(-10, Math.min(10, v)));
  }
  
  /**
   * Get action from current state using the pretrained policy
   */
  async getAction(state, deterministic = false) {
    if (!this.isLoaded) {
      throw new Error('Model not loaded. Call loadModel() first.');
    }
    
    if (state.length !== this.stateDim) {
      throw new Error(`Expected state dimension ${this.stateDim}, got ${state.length}`);
    }
    
    // Normalize observation as CleanRL does
    const normalizedState = this.normalizeObservation(state);
    
    // Convert state to tensor
    const stateTensor = tf.tensor2d([normalizedState], [1, this.stateDim]);
    
    try {
      // Get action mean from actor
      const actionMean = this.actorModel.predict(stateTensor);
      
      if (deterministic) {
        // Return mean action (deterministic policy)
        // CleanRL does NOT apply tanh - actions are unbounded!
        const actionArray = await actionMean.data();
        actionMean.dispose();
        stateTensor.dispose();
        return Array.from(actionArray);
      } else {
        // Sample from normal distribution (stochastic policy)
        const actionStd = tf.exp(this.actorLogStd);
        const noise = tf.randomNormal(actionMean.shape);
        const action = tf.add(actionMean, tf.mul(actionStd, noise));
        
        // CleanRL does NOT apply tanh - actions are unbounded!
        const actionArray = await action.data();
        
        // Cleanup tensors
        actionMean.dispose();
        actionStd.dispose();
        noise.dispose();
        action.dispose();
        stateTensor.dispose();
        
        return Array.from(actionArray);
      }
      
    } catch (error) {
      stateTensor.dispose();
      throw error;
    }
  }
  
  /**
   * Get value estimate from current state
   */
  async getValue(state) {
    if (!this.isLoaded) {
      throw new Error('Model not loaded. Call loadModel() first.');
    }
    
    if (state.length !== this.stateDim) {
      throw new Error(`Expected state dimension ${this.stateDim}, got ${state.length}`);
    }
    
    // Convert state to tensor
    const stateTensor = tf.tensor2d([state], [1, this.stateDim]);
    
    try {
      // Get value from critic
      const value = this.criticModel.predict(stateTensor);
      const valueArray = await value.data();
      
      value.dispose();
      stateTensor.dispose();
      
      return valueArray[0];  // Return scalar value
      
    } catch (error) {
      stateTensor.dispose();
      throw error;
    }
  }
  
  /**
   * Get both action and value (efficient for RL loops)
   */
  async getActionAndValue(state, deterministic = false) {
    const action = await this.getAction(state, deterministic);
    const value = await this.getValue(state);
    
    return { action, value };
  }
  
  /**
   * Cleanup resources
   */
  dispose() {
    if (this.actorModel) {
      this.actorModel.dispose();
    }
    if (this.criticModel) {
      this.criticModel.dispose();
    }
    if (this.actorLogStd) {
      this.actorLogStd.dispose();
    }
    this.isLoaded = false;
    console.log('PPOAgentCleanRL disposed');
  }
  
  /**
   * Get model summary
   */
  getSummary() {
    if (!this.isLoaded) {
      return { loaded: false };
    }
    
    return {
      loaded: true,
      stateDim: this.stateDim,
      actionDim: this.actionDim,
      hiddenDim: this.hiddenDim,
      actorParams: this.actorModel.countParams(),
      criticParams: this.criticModel.countParams()
    };
  }
}

// Export for use in worker and main thread
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { PPOAgentCleanRL };
}

// Make available globally for worker
if (typeof self !== 'undefined') {
  self.PPOAgentCleanRL = PPOAgentCleanRL;
}

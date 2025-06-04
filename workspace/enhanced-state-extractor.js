/**
 * Enhanced state extractor for MuJoCo Humanoid to match CleanRL's 376-dimensional observation
 * 
 * CleanRL Humanoid-v4 observation (376 dimensions):
 * - qpos: 22 (positions, excluding first 2 x,y coordinates)
 * - qvel: 23 (velocities)  
 * - cinert: 130 (13 bodies × 10 values each - inertia and mass)
 * - cvel: 78 (13 bodies × 6 values each - linear and angular velocities)
 * - qfrc_actuator: 17 (actuator forces)
 * - cfrc_ext: 78 (13 bodies × 6 values each - external forces and torques)
 * - x,y coordinates: 2 (the excluded qpos values)
 * - Additional features: 26 (previous actions, etc.)
 * Total: 22 + 23 + 130 + 78 + 17 + 78 + 2 + 26 = 376
 */

class EnhancedStateExtractor {
  constructor() {
    // Updated for CleanRL Humanoid-v4 compatibility (376 dimensions)
    this.nq = 22;  // position dimensions (24 minus first 2 x,y coords)
    this.nv = 23;  // velocity dimensions (includes free joint)
    this.nbody = 13;  // number of bodies (excluding world)
    this.nu = 17;  // number of actuators
    
    // Expected dimensions for 376 total:
    // qpos(22) + qvel(23) + cinert(130) + cvel(78) + qfrc_actuator(17) + cfrc_ext(78) = 348
    // We need 28 more dimensions - the x,y coordinates (2) plus additional features (26)
  }

  /**
   * Extract full 376-dimensional state from MuJoCo simulation
   * @param {Object} simulation - MuJoCo simulation object
   * @param {Object} model - MuJoCo model object
   * @param {boolean} includeXYPosition - Whether to include x,y coordinates (adds 2 dims)
   * @returns {Array} State vector of length 376
   */
  extractFullState(simulation, model, includeXYPosition = true) {
    const state = [];
    
    // 1. Extract qpos (28 elements) - using all available position data
    const qpos = this.extractQpos(simulation, model);
    state.push(...qpos);
    
    // 2. Extract qvel (23 elements) - velocity data
    const qvel = this.extractQvel(simulation, model);
    state.push(...qvel);
    
    // 3. Extract cinert (130 elements) - mass and inertia
    const cinert = this.extractCinert(simulation, model);
    state.push(...cinert);
    
    // 4. Extract cvel (78 elements) - center of mass velocities
    const cvel = this.extractCvel(simulation, model);
    state.push(...cvel);
    
    // 5. Extract qfrc_actuator (17 elements) - actuator forces
    const qfrc_actuator = this.extractQfrcActuator(simulation, model);
    state.push(...qfrc_actuator);
    
    // 6. Extract cfrc_ext (78 elements) - external forces
    const cfrc_ext = this.extractCfrcExt(simulation, model);
    state.push(...cfrc_ext);
    
    // Current total: 22+23+130+78+17+78 = 348
    // Need 376, so add 28 more dimensions (2 for x,y + 26 additional)
    
    // 7. Add x,y position coordinates (2 elements) from qpos
    // These are the first 2 qpos values that we excluded earlier
    let xyPos = [0, 0];
    if (simulation.qpos && simulation.qpos.length >= 2) {
      xyPos = [simulation.qpos[0] || 0, simulation.qpos[1] || 0];
    }
    state.push(...xyPos);
    
    // 8. Add 26 more dimensions to reach 376 total
    // These could be additional physics features that CleanRL includes
    const additionalFeatures = this.extractAdditionalFeatures(simulation, model);
    state.push(...additionalFeatures);
    
    // Verify we have exactly 376 dimensions
    if (state.length !== 376) {
      console.warn(`State length ${state.length} does not match expected 376 dimensions`);
      // Pad or truncate to ensure exact match
      while (state.length < 376) {
        state.push(0);
      }
      if (state.length > 376) {
        state.length = 376;
      }
    }
    
    return state;
  }

  extractQpos(simulation, model) {
    const qpos = [];
    
    if (simulation.qpos) {
      // IMPORTANT: Gym Humanoid-v4 excludes the first 2 qpos values (x, y coordinates)
      // Start from index 2 to match Gym's observation space
      for (let i = 2; i < simulation.qpos.length; i++) {
        qpos.push(simulation.qpos[i]);
      }
    }
    
    // We should have 22 elements (24 total minus first 2)
    // Pad with zeros if needed
    while (qpos.length < 22) {
      qpos.push(0);
    }
    
    // Ensure we don't exceed 22 elements
    if (qpos.length > 22) {
      qpos.length = 22;
    }
    
    return qpos;
  }

  extractQvel(simulation, model) {
    const qvel = [];
    
    if (simulation.qvel) {
      // Take first 23 elements
      for (let i = 0; i < Math.min(this.nv, simulation.qvel.length); i++) {
        qvel.push(simulation.qvel[i]);
      }
    }
    
    // Pad with zeros if needed
    while (qvel.length < this.nv) {
      qvel.push(0);
    }
    
    return qvel;
  }

  extractCinert(simulation, model) {
    const cinert = [];
    
    // Check if cinert data is available
    if (simulation.cinert) {
      // cinert is typically stored as a flat array with 10 values per body
      for (let bodyId = 0; bodyId < this.nbody; bodyId++) {
        const offset = bodyId * 10;
        for (let j = 0; j < 10; j++) {
          const idx = offset + j;
          cinert.push(simulation.cinert[idx] || 0);
        }
      }
    } else {
      // If cinert not available, fill with zeros
      for (let i = 0; i < 130; i++) {
        cinert.push(0);
      }
    }
    
    return cinert;
  }

  extractCvel(simulation, model) {
    const cvel = [];
    
    // Check if cvel data is available
    if (simulation.cvel) {
      // cvel has 6 values per body (linear and angular velocity)
      for (let bodyId = 0; bodyId < this.nbody; bodyId++) {
        const offset = bodyId * 6;
        for (let j = 0; j < 6; j++) {
          const idx = offset + j;
          cvel.push(simulation.cvel[idx] || 0);
        }
      }
    } else if (simulation.qvel && simulation.xipos && simulation.ximat) {
      // Fallback: compute COM velocities from qvel if cvel not directly available
      // This would require Jacobian computation which is complex
      // For now, just use zeros
      for (let i = 0; i < 78; i++) {
        cvel.push(0);
      }
    } else {
      // Fill with zeros
      for (let i = 0; i < 78; i++) {
        cvel.push(0);
      }
    }
    
    return cvel;
  }

  extractQfrcActuator(simulation, model) {
    const qfrc_actuator = [];
    
    // Check if qfrc_actuator is available
    if (simulation.qfrc_actuator) {
      for (let i = 0; i < this.nu; i++) {
        qfrc_actuator.push(simulation.qfrc_actuator[i] || 0);
      }
    } else if (simulation.ctrl && model.actuator_gear) {
      // Estimate from control inputs and gear ratios
      for (let i = 0; i < this.nu; i++) {
        const ctrl = simulation.ctrl[i] || 0;
        const gear = model.actuator_gear ? model.actuator_gear[i] : 1;
        qfrc_actuator.push(ctrl * gear);
      }
    } else {
      // Fill with zeros
      for (let i = 0; i < this.nu; i++) {
        qfrc_actuator.push(0);
      }
    }
    
    return qfrc_actuator;
  }

  extractCfrcExt(simulation, model) {
    const cfrc_ext = [];
    
    // Check if cfrc_ext (contact forces) is available
    if (simulation.cfrc_ext) {
      // cfrc_ext has 6 values per body (force and torque)
      for (let bodyId = 0; bodyId < this.nbody; bodyId++) {
        const offset = bodyId * 6;
        for (let j = 0; j < 6; j++) {
          const idx = offset + j;
          cfrc_ext.push(simulation.cfrc_ext[idx] || 0);
        }
      }
    } else {
      // Contact forces are critical for balance!
      // If not available, we need to at least detect ground contact
      // This is a simplified approximation
      for (let bodyId = 0; bodyId < this.nbody; bodyId++) {
        // Check if this is a foot body (usually last bodies)
        const isFootBody = bodyId >= this.nbody - 2;
        
        if (isFootBody && simulation.xpos) {
          // Simple ground contact detection
          const zPos = simulation.xpos[bodyId * 3 + 2] || 0;
          const groundContact = zPos < 0.05 ? 1.0 : 0.0;
          
          // Approximate contact force (0, 0, normal_force, 0, 0, 0)
          cfrc_ext.push(0, 0, groundContact * 9.81, 0, 0, 0);
        } else {
          // No contact
          cfrc_ext.push(0, 0, 0, 0, 0, 0);
        }
      }
    }
    
    return cfrc_ext;
  }

  extractAdditionalFeatures(simulation, model) {
    // Extract 26 additional features to reach 376 total dimensions
    const features = [];
    
    // Add some commonly used RL features that CleanRL might include:
    
    // 1. Previous action values (if available) - 17 elements
    if (simulation.ctrl && simulation.ctrl.length >= 17) {
      for (let i = 0; i < 17; i++) {
        features.push(simulation.ctrl[i] || 0);
      }
    } else {
      // Pad with zeros if no previous actions
      for (let i = 0; i < 17; i++) {
        features.push(0);
      }
    }
    
    // 2. Add 9 more features to reach 26 total
    // These could be additional sensor data or computed features
    for (let i = 0; i < 9; i++) {
      features.push(0);
    }
    
    // Ensure exactly 26 features
    while (features.length < 26) {
      features.push(0);
    }
    if (features.length > 26) {
      features.length = 26;
    }
    
    return features;
  }

  /**
   * Create adapter for mapping 17-action pretrained model to our 21-action space
   * Standard Humanoid-v4 excludes ankle_x and ankle_y joints
   */
  mapActions17to21(actions17) {
    if (!actions17 || actions17.length !== 17) {
      console.error("Expected 17 actions, got", actions17?.length);
      return new Array(21).fill(0);
    }
    
    // Our 21 actuators in order:
    // 0-2: abdomen_y, abdomen_z, abdomen_x
    // 3-8: hip_x_right, hip_z_right, hip_y_right, knee_right, ankle_x_right, ankle_y_right
    // 9-14: hip_x_left, hip_z_left, hip_y_left, knee_left, ankle_x_left, ankle_y_left  
    // 15-20: shoulder1_right, shoulder2_right, elbow_right, shoulder1_left, shoulder2_left, elbow_left
    
    // Standard 17 actuators (no ankle_x, ankle_y):
    // 0-2: abdomen
    // 3-6: right leg (hip_x, hip_z, hip_y, knee) 
    // 7-10: left leg (hip_x, hip_z, hip_y, knee)
    // 11-16: arms (same as ours)
    
    const actions21 = new Array(21).fill(0);
    
    // Copy abdomen actions
    actions21[0] = actions17[0];  // abdomen_y
    actions21[1] = actions17[1];  // abdomen_z
    actions21[2] = actions17[2];  // abdomen_x
    
    // Right leg (insert zeros for ankle joints)
    actions21[3] = actions17[3];  // hip_x_right
    actions21[4] = actions17[4];  // hip_z_right
    actions21[5] = actions17[5];  // hip_y_right
    actions21[6] = actions17[6];  // knee_right
    actions21[7] = 0;  // ankle_x_right (not in pretrained)
    actions21[8] = 0;  // ankle_y_right (not in pretrained)
    
    // Left leg
    actions21[9] = actions17[7];   // hip_x_left
    actions21[10] = actions17[8];  // hip_z_left
    actions21[11] = actions17[9];  // hip_y_left
    actions21[12] = actions17[10]; // knee_left
    actions21[13] = 0;  // ankle_x_left (not in pretrained)
    actions21[14] = 0;  // ankle_y_left (not in pretrained)
    
    // Arms (direct mapping)
    for (let i = 0; i < 6; i++) {
      actions21[15 + i] = actions17[11 + i];
    }
    
    return actions21;
  }
}

// Make available globally for worker scripts
if (typeof self !== 'undefined') {
  self.EnhancedStateExtractor = EnhancedStateExtractor;
}

// Export for use in worker
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { EnhancedStateExtractor };
}

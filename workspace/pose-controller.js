/**
 * Pose Controller for MuJoCo Humanoid
 * Uses pre-trained weights for balance, then fine-tunes for specific poses
 */

class PoseController {
  constructor() {
    this.basePolicy = null; // Pre-trained balance policy
    this.targetPose = null; // Target joint angles
    this.poseLibrary = {
      // Define target poses (joint angles in radians)
      "t-pose": {
        // Arms out horizontally
        right_shoulder_x: -1.57, // -90 degrees
        left_shoulder_x: 1.57,   // 90 degrees
        // Everything else neutral
      },
      "arms-up": {
        // Arms straight up
        right_shoulder_x: -3.14, // -180 degrees
        left_shoulder_x: 3.14,   // 180 degrees
      },
      "warrior-1": {
        // Yoga warrior pose
        right_hip_y: -0.5,      // Right leg forward
        right_knee: -0.8,       // Bent knee
        left_hip_y: 0.3,        // Left leg back
        abdomen_x: -0.2,        // Slight back arch
        right_shoulder_x: -3.0, // Arms up
        left_shoulder_x: 3.0,
      },
      "squat": {
        // Squatting position
        right_hip_y: -1.2,
        left_hip_y: -1.2,
        right_knee: 1.2,
        left_knee: 1.2,
        abdomen_x: 0.3, // Lean forward slightly
      },
      "tree-pose": {
        // Standing on one leg
        right_hip_y: -0.8,      // Lift right leg
        right_hip_x: 0.5,       // Out to side
        right_knee: 1.0,        // Bent knee
        right_shoulder_x: -2.0, // Arms together above
        left_shoulder_x: 2.0,
      }
    };
  }

  /**
   * Load pre-trained weights from a base policy
   * These weights should know how to balance
   */
  async loadPretrainedWeights(weightsPath) {
    try {
      // In practice, you'd load from a converted Python model
      // For now, we'll use the existing PPO network structure
      console.log("Loading pre-trained balance weights...");
      // this.basePolicy = await tf.loadLayersModel(weightsPath);
      return true;
    } catch (error) {
      console.error("Failed to load pre-trained weights:", error);
      return false;
    }
  }

  /**
   * Get action for maintaining a specific pose
   */
  getAction(currentState, targetPoseName, ppoAgent = null) {
    const targetPose = this.poseLibrary[targetPoseName];
    if (!targetPose) {
      console.error(`Unknown pose: ${targetPoseName}`);
      return new Array(17).fill(0);
    }

    // If we have a PPO agent, use it as base policy
    let baseAction = new Array(17).fill(0);
    if (ppoAgent) {
      const { action } = ppoAgent.getAction(currentState);
      baseAction = action;
    }

    // Extract current joint angles from state
    // Assuming state includes qpos starting at index 0
    const currentJointAngles = currentState.slice(7, 28); // Skip root position/orientation

    // Simple PD controller for pose matching
    const kp = 2.0; // Proportional gain
    const kd = 0.5; // Derivative gain

    // Map joint names to indices (simplified)
    const jointMap = {
      'abdomen_z': 0, 'abdomen_y': 1, 'abdomen_x': 2,
      'right_hip_x': 3, 'right_hip_z': 4, 'right_hip_y': 5, 'right_knee': 6,
      'left_hip_x': 7, 'left_hip_z': 8, 'left_hip_y': 9, 'left_knee': 10,
      'right_shoulder_x': 11, 'right_shoulder_y': 12, 'right_elbow': 13,
      'left_shoulder_x': 14, 'left_shoulder_y': 15, 'left_elbow': 16
    };

    // Compute control corrections for target pose
    const corrections = new Array(17).fill(0);
    
    for (const [jointName, targetAngle] of Object.entries(targetPose)) {
      const jointIdx = jointMap[jointName];
      if (jointIdx !== undefined && jointIdx < currentJointAngles.length) {
        const error = targetAngle - currentJointAngles[jointIdx];
        corrections[jointIdx] = kp * error;
      }
    }

    // Blend base policy with pose corrections
    const blendFactor = 0.7; // How much to trust pose controller vs base policy
    const finalAction = baseAction.map((base, i) => 
      base * (1 - blendFactor) + corrections[i] * blendFactor
    );

    // Clip actions to valid range
    return finalAction.map(a => Math.max(-1, Math.min(1, a)));
  }

  /**
   * Create a reward function for pose matching
   */
  createPoseRewardFunction(targetPoseName) {
    const targetPose = this.poseLibrary[targetPoseName];
    
    return function(state, action) {
      let reward = 0;
      
      // Height reward (don't fall)
      const height = state.bodyPos[2];
      if (height < 0.7) {
        return { reward: -10, done: true };
      }
      reward += Math.min(0.3, height - 0.7);

      // Pose matching reward
      const currentJointAngles = state.jointAngles || [];
      let poseError = 0;
      let numTargetJoints = 0;

      const jointMap = {
        'abdomen_z': 0, 'abdomen_y': 1, 'abdomen_x': 2,
        'right_hip_x': 3, 'right_hip_z': 4, 'right_hip_y': 5, 'right_knee': 6,
        'left_hip_x': 7, 'left_hip_z': 8, 'left_hip_y': 9, 'left_knee': 10,
        'right_shoulder_x': 11, 'right_shoulder_y': 12, 'right_elbow': 13,
        'left_shoulder_x': 14, 'left_shoulder_y': 15, 'left_elbow': 16
      };

      for (const [jointName, targetAngle] of Object.entries(targetPose)) {
        const jointIdx = jointMap[jointName];
        if (jointIdx !== undefined && jointIdx < currentJointAngles.length) {
          const error = Math.abs(targetAngle - currentJointAngles[jointIdx]);
          poseError += error;
          numTargetJoints++;
        }
      }

      // Normalize pose error and convert to reward
      if (numTargetJoints > 0) {
        const avgError = poseError / numTargetJoints;
        const poseReward = Math.exp(-2 * avgError); // Exponential decay
        reward += poseReward * 0.5;
      }

      // Stability bonus (low velocities)
      const bodyVel = state.bodyVel || [0, 0, 0];
      const velocityMag = Math.sqrt(bodyVel[0]**2 + bodyVel[1]**2 + bodyVel[2]**2);
      if (velocityMag < 0.5) {
        reward += 0.2;
      }

      // Small alive bonus
      reward += 0.1;

      return reward;
    };
  }
}

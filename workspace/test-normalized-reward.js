// Test reward function with normalized scale
function normalizedStandingReward(state, action) {
    const bodyPos = state.bodyPos || [0, 0, 0];
    const bodyVel = state.bodyVel || [0, 0, 0];
    const bodyQuat = state.bodyQuaternion || [1, 0, 0, 0];
    
    let reward = 0;
    const height = bodyPos[2];
    
    // Normalized rewards (sum to ~1.0 per step)
    
    // Height reward (0 to 0.4)
    if (height > 0.8) {
        reward += 0.4 * Math.min(1.0, (height - 0.8) / 0.5);
    }
    
    // Muscle activation (0 to 0.2)
    const muscleActivation = action.reduce((sum, a) => sum + Math.abs(a), 0) / action.length;
    if (muscleActivation > 0.05 && muscleActivation < 0.5) {
        reward += 0.2;
    }
    
    // Uprightness (0 to 0.3)
    if (bodyQuat[0] > 0.8) {
        reward += 0.3 * Math.min(1.0, (bodyQuat[0] - 0.8) / 0.2);
    }
    
    // Small alive bonus
    reward += 0.1;
    
    // Termination
    if (height < 0.7) {
        return { reward: -1.0, done: true };
    }
    
    return reward;
}

// Export for use
if (typeof module !== 'undefined' && module.exports) {
    module.exports = normalizedStandingReward;
}

// Load trained policy from meta-RL demo

function loadTrainedPolicy() {
    const savedPolicy = localStorage.getItem('trainedPolicy');
    
    if (!savedPolicy) {
        console.log('No trained policy found in localStorage');
        return null;
    }
    
    try {
        const policyData = JSON.parse(savedPolicy);
        console.log(`Loading trained policy: ${policyData.policyName}`);
        console.log(`Average reward: ${policyData.avgReward}`);
        console.log(`Trained at: ${policyData.timestamp}`);
        
        // Recreate the neural network
        const policy = TinyMLP.deserialize(policyData.network);
        
        return {
            policy: policy,
            metadata: policyData
        };
    } catch (error) {
        console.error('Failed to load policy:', error);
        return null;
    }
}

// Apply trained policy to an environment
function applyTrainedPolicy(envId, orchestrator, policy) {
    setInterval(() => {
        const state = orchestrator.getEnvironmentState(envId);
        if (!state || !state.observation) return;
        
        // Convert observation to policy input format
        const stateVec = observationToVector(state.observation);
        
        // Get action from trained policy
        const action = policy.forward(stateVec);
        
        // Apply action
        orchestrator.setAction(envId, action);
    }, 10); // 100Hz control
}

// Helper function (copy from BrowserRL)
function observationToVector(obs) {
    const vec = [];
    
    // Body position and velocity
    if (obs.bodyPos) vec.push(...obs.bodyPos.slice(0, 3));
    else vec.push(0, 0, 0);
    
    if (obs.bodyVel) vec.push(...obs.bodyVel.slice(0, 3)); 
    else if (obs.qvel) vec.push(...obs.qvel.slice(0, 3));
    else vec.push(0, 0, 0);
    
    // Joint positions (21 joints for humanoid)
    if (obs.qpos) {
        vec.push(...obs.qpos.slice(7, 28)); // Skip root position/orientation
    } else {
        vec.push(...new Array(21).fill(0));
    }
    
    // Joint velocities
    if (obs.qvel) {
        vec.push(...obs.qvel.slice(6, 27)); // Skip root velocities
    } else {
        vec.push(...new Array(21).fill(0));
    }
    
    // Pad to 72 dimensions if needed
    while (vec.length < 72) vec.push(0);
    
    return vec.slice(0, 72);
}

// Export for use
window.loadTrainedPolicy = loadTrainedPolicy;
window.applyTrainedPolicy = applyTrainedPolicy;
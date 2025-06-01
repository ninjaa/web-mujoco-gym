// UI Control functions for MuJoCo demo

// Global state
export const state = {
    orchestrator: null,
    isRunning: false,
    lastUpdateTime: 0,
    frameCount: 0,
    episodeStartTime: 0,
    currentEpisodeStep: 0,
    debugMode: false,
    selectedEnvType: 'ant',
    perfData: {
        timestamps: [],
        rewards: []
    }
};

// Logging function
export function log(message, type = 'info') {
    console.log(`[${type.toUpperCase()}] ${message}`);
}

// Initialize environments
export async function initEnvironments() {
    const loadingScreen = document.getElementById('loadingScreen');
    loadingScreen.classList.remove('hidden');
    
    try {
        // Import orchestrator dynamically
        const { MuJoCoRLOrchestrator } = await import('./mujoco-orchestrator.js');
        
        // Determine number of environments from selection
        const numEnvs = parseInt(document.getElementById('numEnvs').value);
        const envType = document.getElementById('envType').value;
        const numWorkers = Math.max(1, Math.floor(numEnvs / 4));
        
        state.selectedEnvType = envType;
        state.orchestrator = new MuJoCoRLOrchestrator(numEnvs, numWorkers, envType);
        
        // Create environment displays
        createEnvironmentDisplays(numEnvs);
        
        // Initialize orchestrator
        await state.orchestrator.initialize();
        
        // Enable controls
        document.getElementById('runBtn').disabled = false;
        
        log(`Initialized ${numEnvs} ${envType} environments`);
        
        return state.orchestrator;
    } catch (error) {
        console.error('Failed to initialize:', error);
        log(`Failed to initialize: ${error.message || error.toString()}`);
        alert(`Failed to initialize environments: ${error.message || error.toString()}`);
        throw error; // Re-throw to see the full stack trace
    } finally {
        loadingScreen.classList.add('hidden');
    }
}

// Start episode
export async function startEpisode() {
    if (!state.orchestrator || state.isRunning) return;
    
    state.isRunning = true;
    state.episodeStartTime = Date.now();
    state.frameCount = 0;
    state.currentEpisodeStep = 0;
    
    document.getElementById('initBtn').disabled = true;
    document.getElementById('runBtn').disabled = true;
    document.getElementById('stopBtn').disabled = false;
    document.getElementById('resetBtn').disabled = true;
    
    log('Starting episode...');
    
    // Start render loop
    requestAnimationFrame(renderLoop);
}

// Stop episode
export function stopEpisode() {
    state.isRunning = false;
    
    document.getElementById('runBtn').disabled = false;
    document.getElementById('stopBtn').disabled = true;
    document.getElementById('resetBtn').disabled = false;
    
    log('Episode stopped');
}

// Reset environments
export function resetEnvironments() {
    if (state.orchestrator) {
        state.orchestrator.reset();
        log('Environments reset');
    }
}

// Render loop
export async function renderLoop() {
    if (!state.isRunning) return;
    
    try {
        // Run physics step
        const envStates = await state.orchestrator.runStep();
        state.currentEpisodeStep++;
        
        // Wait a bit for workers to process and send back results
        await new Promise(resolve => setTimeout(resolve, 50));
        
        // Get updated states after workers have responded
        const updatedStates = state.orchestrator.environments.map(env => ({
            id: env.id,
            observation: env.observation,
            reward: env.reward,
            done: env.done,
            stepCount: env.stepCount,
            position: env.observation && env.observation.bodyPos ? [
                env.observation.bodyPos[0] || 0,
                env.observation.bodyPos[1] || 0,
                env.observation.bodyPos[2] || 0
            ] : [0, 0, 0]
        }));
        
        // Update visualizations
        const { drawStickFigure, drawCoordinateAxes } = await import('./visualization-2d.js');
        
        updatedStates.forEach((envState) => {
            const canvas = document.getElementById(`env-canvas-${envState.id}`);
            if (!canvas) return;
            
            const ctx = canvas.getContext('2d');
            
            // Clear canvas
            ctx.fillStyle = '#2d2d2d';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            
            // Draw coordinate axes
            drawCoordinateAxes(ctx, canvas.width, canvas.height);
            
            // Draw grid
            ctx.strokeStyle = '#3a3a3a';
            ctx.lineWidth = 1;
            for (let i = 0; i < canvas.width; i += 40) {
                ctx.beginPath();
                ctx.moveTo(i, 0);
                ctx.lineTo(i, canvas.height);
                ctx.stroke();
            }
            for (let i = 0; i < canvas.height; i += 40) {
                ctx.beginPath();
                ctx.moveTo(0, i);
                ctx.lineTo(canvas.width, i);
                ctx.stroke();
            }
            
            // Calculate position with bounds checking
            const centerX = canvas.width / 2;
            const centerY = canvas.height / 2;
            
            let x = centerX;
            let y = centerY;
            
            // Determine if robot has fallen
            let fallen = false;
            let fallAngle = 0;
            if (envState.observation) {
                // Use bodyPos[0] for X position, bodyPos[2] for height
                x = centerX + (envState.observation.bodyPos[0] || 0) * 20;
                let height = envState.observation.bodyPos[2] || 0;
                fallen = height < 0.3; // Consider fallen if torso is below 0.3m
                
                // Calculate fall angle based on height
                if (fallen) {
                    // Rotate more as height decreases
                    fallAngle = Math.PI / 2 * (1 - Math.max(0, height) / 0.3);
                }
                
                // Clamp to canvas bounds
                x = Math.max(30, Math.min(canvas.width - 30, x));
            }
            
            // Draw stick figure with physics data and fall rotation
            
            // Draw shadow first (no rotation)
            if (fallen) {
                ctx.save();
                ctx.globalAlpha = 0.3;
                ctx.fillStyle = '#ff4444';
                ctx.beginPath();
                ctx.ellipse(x, y + 45, 35, 15, 0, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
            }
            
            // Draw rotated stick figure
            ctx.save();
            ctx.translate(x, y);
            ctx.rotate(fallAngle);
            ctx.translate(-x, -y);
            
            // Temporarily disable shadow in drawStickFigure by passing fallen=false
            drawStickFigure(ctx, x, y, '#4a9eff', false, envState.observation);
            ctx.restore();
            
            // Update metrics display
            const rewardEl = document.getElementById(`reward-${envState.id}`);
            const stepEl = document.getElementById(`step-${envState.id}`);
            const posEl = document.getElementById(`pos-${envState.id}`);
            
            if (rewardEl) rewardEl.textContent = envState.reward ? envState.reward.toFixed(2) : '0.00';
            if (stepEl) stepEl.textContent = envState.stepCount || 0;
            if (posEl && envState.position) {
                // Show x, y, z position
                posEl.textContent = `${envState.position[0].toFixed(2)}, ${envState.position[1].toFixed(2)}, ${envState.position[2].toFixed(2)}`;
            }
            
            // Update action visualizer if in debug mode
            if (state.debugMode && envState.observation && envState.observation.actions) {
                updateActionVisualizer(envState.id, envState.observation.actions);
            }
        });
        
        // Update global stats
        updateStats();
        
        // Continue loop
        state.frameCount++;
        requestAnimationFrame(renderLoop);
        
    } catch (error) {
        console.error('Render loop error:', error);
        stopEpisode();
    }
}

// Update global statistics
export function updateStats() {
    const currentTime = Date.now();
    const elapsed = (currentTime - state.episodeStartTime) / 1000;
    const fps = state.frameCount / elapsed;
    
    document.getElementById('activeEnvs').textContent = 
        state.orchestrator ? state.orchestrator.numEnvironments : '0';
    document.getElementById('avgFPS').textContent = fps.toFixed(1);
    document.getElementById('avgReward').textContent = 
        state.orchestrator ? state.orchestrator.getAverageReward().toFixed(2) : '0.00';
    document.getElementById('totalEpisodes').textContent = 
        state.orchestrator ? state.orchestrator.episodeCount : '0';
    
    // Update performance data
    if (state.frameCount % 30 === 0) { // Update every 30 frames
        state.perfData.timestamps.push(currentTime);
        state.perfData.rewards.push(state.orchestrator ? state.orchestrator.getAverageReward() : 0);
        updatePerformanceChart();
    }
}

// Create environment display elements
export function createEnvironmentDisplays(numEnvs) {
    const container = document.getElementById('environmentsContainer');
    container.innerHTML = '';
    
    for (let i = 0; i < numEnvs; i++) {
        const envDiv = document.createElement('div');
        envDiv.id = `env-${i}`;
        envDiv.className = 'environment';
        envDiv.innerHTML = `
            <div class="env-header">
                <span class="env-id">Environment ${i}</span>
                <span class="env-status active">Active</span>
            </div>
            <div class="env-canvas">
                <canvas id="env-canvas-${i}" width="280" height="230"></canvas>
            </div>
            <div class="env-metrics">
                <div class="metric">
                    <span class="metric-value" id="reward-${i}">0.00</span>
                    <span class="metric-label">Reward</span>
                </div>
                <div class="metric">
                    <span class="metric-value" id="step-${i}">0</span>
                    <span class="metric-label">Steps</span>
                </div>
                <div class="metric">
                    <span class="metric-value" id="pos-${i}">0.0</span>
                    <span class="metric-label">Position</span>
                </div>
            </div>
            <div class="action-viz ${state.debugMode ? 'show' : ''}" id="action-viz-${i}">
                <div class="action-header">Actions</div>
                <div class="action-bars" id="action-bars-${i}">
                    <!-- Action bars will be populated dynamically -->
                </div>
            </div>
        `;
        
        container.appendChild(envDiv);
        
        // Add click handler for 3D view
        const canvas = document.getElementById(`env-canvas-${i}`);
        if (canvas) {
            canvas.style.cursor = 'pointer';
            canvas.addEventListener('click', () => {
                console.log(`Canvas ${i} clicked`);
                if (state.orchestrator && state.orchestrator.environments[i]) {
                    import('./threejs-modal.js').then(module => {
                        module.show3DModal(i, state.orchestrator.environments[i]);
                    }).catch(err => {
                        console.error('Failed to load threejs-modal:', err);
                    });
                } else {
                    console.log('No orchestrator or environment', state.orchestrator, i);
                }
            });
        }
    }
}

// Update performance chart
export function updatePerformanceChart() {
    const canvas = document.getElementById('performanceCanvas');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    
    // Set canvas size
    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;
    
    // Clear canvas
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Draw axes
    ctx.strokeStyle = '#444';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(40, canvas.height - 30);
    ctx.lineTo(canvas.width - 20, canvas.height - 30);
    ctx.moveTo(40, 20);
    ctx.lineTo(40, canvas.height - 30);
    ctx.stroke();
    
    // Draw reward chart
    if (state.perfData.rewards.length > 1) {
        ctx.strokeStyle = '#4a9eff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        
        // Handle negative rewards
        const minReward = Math.min(...state.perfData.rewards, 0);
        const maxReward = Math.max(...state.perfData.rewards, 0.1);
        const range = maxReward - minReward;
        const xStep = (canvas.width - 60) / (state.perfData.rewards.length - 1);
        
        // Draw zero line if we have negative values
        if (minReward < 0) {
            ctx.strokeStyle = '#666';
            ctx.lineWidth = 1;
            ctx.setLineDash([5, 5]);
            ctx.beginPath();
            const zeroY = canvas.height - 30 - ((-minReward) / range) * (canvas.height - 50);
            ctx.moveTo(40, zeroY);
            ctx.lineTo(canvas.width - 20, zeroY);
            ctx.stroke();
            ctx.setLineDash([]);
            
            // Zero label
            ctx.fillStyle = '#666';
            ctx.font = '10px sans-serif';
            ctx.fillText('0', 25, zeroY + 3);
        }
        
        // Draw reward line
        ctx.strokeStyle = '#4a9eff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        
        for (let i = 0; i < state.perfData.rewards.length; i++) {
            const x = 40 + i * xStep;
            const y = canvas.height - 30 - ((state.perfData.rewards[i] - minReward) / range) * (canvas.height - 50);
            
            if (i === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        }
        ctx.stroke();
        
        // Label
        ctx.fillStyle = '#4a9eff';
        ctx.font = '12px sans-serif';
        ctx.fillText('Avg Reward', 45, 35);
        
        // Show current value
        const currentReward = state.perfData.rewards[state.perfData.rewards.length - 1];
        ctx.fillText(`Current: ${currentReward.toFixed(3)}`, canvas.width - 100, 35);
    }
    
    // Keep only last 100 data points
    if (state.perfData.rewards.length > 100) {
        state.perfData.rewards = state.perfData.rewards.slice(-100);
        state.perfData.timestamps = state.perfData.timestamps.slice(-100);
    }
}

// Update action visualizer
export function updateActionVisualizer(envId, actions) {
    const viz = document.getElementById(`action-viz-${envId}`);
    if (!viz || !actions) return;
    
    // Check if action bars exist AND have content
    const actionBars = document.getElementById(`action-bars-${envId}`);
    if (!actionBars || actionBars.children.length === 0) {
        // Need to create the full structure
        const barsHtml = actions.map((_, idx) => `
            <div class="action-bar">
                <span class="action-index">A${idx}</span>
                <div class="action-bar-bg">
                    <div class="action-bar-fill" id="action-${envId}-${idx}"></div>
                </div>
                <span class="action-value" id="action-val-${envId}-${idx}">0.0</span>
            </div>
        `).join('');
        
        if (actionBars) {
            actionBars.innerHTML = barsHtml;
        } else {
            viz.innerHTML = `
                <div class="action-header">Actions</div>
                <div class="action-bars" id="action-bars-${envId}">${barsHtml}</div>
            `;
        }
    }
    
    // Update action values
    actions.forEach((action, idx) => {
        const fill = document.getElementById(`action-${envId}-${idx}`);
        const val = document.getElementById(`action-val-${envId}-${idx}`);
        if (fill && val) {
            // Map action from [-1, 1] to [0, 100]%
            const percent = (action + 1) * 50;
            fill.style.width = `${percent}%`;
            fill.style.backgroundColor = action >= 0 ? '#4a9eff' : '#ff6b6b';
            val.textContent = action.toFixed(2);
        }
    });
}

// Toggle debug mode
export function toggleDebug() {
    state.debugMode = !state.debugMode;
    document.querySelectorAll('.action-viz').forEach(viz => {
        viz.classList.toggle('show', state.debugMode);
    });
}

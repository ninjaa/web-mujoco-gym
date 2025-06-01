// UI Control functions for MuJoCo demo
import { drawJazzyEnvironment } from './visualization-2d-jazzy.js';

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
    },
    // For smooth number transitions
    animatedValues: {
        activeEnvs: { current: 0, target: 0, element: null },
        avgFPS: { current: 0, target: 0, element: null },
        avgReward: { current: 0, target: 0, element: null },
        totalEpisodes: { current: 0, target: 0, element: null }
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
        
        // Expose orchestrator to window for 3D modal
        window.mujocoOrchestrator = state.orchestrator;
        
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
        // Visualization functions now come from jazzy module
        
        updatedStates.forEach((envState) => {
            const canvas = document.getElementById(`env-canvas-${envState.id}`);
            if (!canvas) return;
            
            const ctx = canvas.getContext('2d');
            
            // Use jazzy visualization
            drawJazzyEnvironment(ctx, canvas, envState);
            
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

// Smooth number animation helper
function animateValue(key, targetValue, decimals = 0) {
    const anim = state.animatedValues[key];
    if (!anim.element) {
        anim.element = document.getElementById(key);
    }
    
    // Set target
    anim.target = targetValue;
    
    // If not already animating, start animation
    if (!anim.animating) {
        anim.animating = true;
        
        const animate = () => {
            const diff = anim.target - anim.current;
            
            if (Math.abs(diff) < 0.01) {
                anim.current = anim.target;
                anim.animating = false;
            } else {
                // Smooth easing
                anim.current += diff * 0.15;
                
                if (anim.animating) {
                    requestAnimationFrame(animate);
                }
            }
            
            // Update display with pulsing effect when changing
            if (anim.element) {
                anim.element.textContent = anim.current.toFixed(decimals);
                
                // Add pulse effect on significant change
                if (Math.abs(diff) > 0.1) {
                    anim.element.style.transform = 'scale(1.1)';
                    anim.element.style.textShadow = '0 0 30px rgba(74, 158, 255, 0.8)';
                    setTimeout(() => {
                        if (anim.element) {
                            anim.element.style.transform = 'scale(1)';
                            anim.element.style.textShadow = '0 0 20px rgba(74, 158, 255, 0.5)';
                        }
                    }, 200);
                }
            }
        };
        
        animate();
    }
}

// Update global statistics
export function updateStats() {
    const currentTime = Date.now();
    const elapsed = (currentTime - state.episodeStartTime) / 1000;
    const fps = state.frameCount / elapsed;
    
    // Update with smooth animations
    animateValue('activeEnvs', state.orchestrator ? state.orchestrator.numEnvironments : 0, 0);
    animateValue('avgFPS', fps || 0, 1);
    animateValue('avgReward', state.orchestrator ? state.orchestrator.getAverageReward() : 0, 2);
    animateValue('totalEpisodes', state.orchestrator ? state.orchestrator.episodeCount : 0, 0);
    
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

// Update performance chart with jazzy styling
export function updatePerformanceChart() {
    const canvas = document.getElementById('performanceCanvas');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    
    // Set canvas size
    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;
    
    // Clear canvas with gradient background
    const bgGradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
    bgGradient.addColorStop(0, 'rgba(20, 30, 40, 0.95)');
    bgGradient.addColorStop(1, 'rgba(15, 20, 30, 0.95)');
    ctx.fillStyle = bgGradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Draw glowing grid
    ctx.strokeStyle = 'rgba(74, 158, 255, 0.1)';
    ctx.lineWidth = 1;
    
    // Vertical grid lines
    for (let x = 40; x < canvas.width - 20; x += 50) {
        ctx.beginPath();
        ctx.moveTo(x, 20);
        ctx.lineTo(x, canvas.height - 30);
        ctx.stroke();
    }
    
    // Horizontal grid lines
    for (let y = 20; y < canvas.height - 30; y += 30) {
        ctx.beginPath();
        ctx.moveTo(40, y);
        ctx.lineTo(canvas.width - 20, y);
        ctx.stroke();
    }
    
    // Draw axes with glow
    ctx.shadowBlur = 10;
    ctx.shadowColor = 'rgba(74, 158, 255, 0.5)';
    ctx.strokeStyle = 'rgba(74, 158, 255, 0.8)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(40, canvas.height - 30);
    ctx.lineTo(canvas.width - 20, canvas.height - 30);
    ctx.moveTo(40, 20);
    ctx.lineTo(40, canvas.height - 30);
    ctx.stroke();
    ctx.shadowBlur = 0;
    
    // Draw reward chart with jazzy styling
    if (state.perfData.rewards.length > 1) {
        // Handle negative rewards
        const minReward = Math.min(...state.perfData.rewards, 0);
        const maxReward = Math.max(...state.perfData.rewards, 0.1);
        const range = maxReward - minReward;
        const xStep = (canvas.width - 60) / (state.perfData.rewards.length - 1);
        
        // Draw zero line if we have negative values
        if (minReward < 0) {
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
            ctx.lineWidth = 1;
            ctx.setLineDash([5, 5]);
            ctx.beginPath();
            const zeroY = canvas.height - 30 - ((-minReward) / range) * (canvas.height - 50);
            ctx.moveTo(40, zeroY);
            ctx.lineTo(canvas.width - 20, zeroY);
            ctx.stroke();
            ctx.setLineDash([]);
            
            // Zero label with glow
            ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
            ctx.font = 'bold 10px sans-serif';
            ctx.fillText('0', 25, zeroY + 3);
        }
        
        // Create gradient fill under the line
        const gradient = ctx.createLinearGradient(0, 20, 0, canvas.height - 30);
        gradient.addColorStop(0, 'rgba(74, 158, 255, 0.3)');
        gradient.addColorStop(1, 'rgba(74, 158, 255, 0.0)');
        
        // Draw filled area first
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.moveTo(40, canvas.height - 30);
        for (let i = 0; i < state.perfData.rewards.length; i++) {
            const x = 40 + i * xStep;
            const y = canvas.height - 30 - ((state.perfData.rewards[i] - minReward) / range) * (canvas.height - 50);
            ctx.lineTo(x, y);
        }
        ctx.lineTo(40 + (state.perfData.rewards.length - 1) * xStep, canvas.height - 30);
        ctx.closePath();
        ctx.fill();
        
        // Draw reward line with glow
        ctx.shadowBlur = 10;
        ctx.shadowColor = 'rgba(74, 158, 255, 0.8)';
        ctx.strokeStyle = '#4a9eff';
        ctx.lineWidth = 3;
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
        ctx.shadowBlur = 0;
        
        // Draw glowing points at data values
        ctx.fillStyle = '#74b3ff';
        for (let i = 0; i < state.perfData.rewards.length; i++) {
            const x = 40 + i * xStep;
            const y = canvas.height - 30 - ((state.perfData.rewards[i] - minReward) / range) * (canvas.height - 50);
            ctx.beginPath();
            ctx.arc(x, y, 3, 0, Math.PI * 2);
            ctx.fill();
        }
        
        // Labels with glow
        ctx.shadowBlur = 5;
        ctx.shadowColor = 'rgba(74, 158, 255, 0.5)';
        ctx.fillStyle = '#74b3ff';
        ctx.font = 'bold 14px sans-serif';
        ctx.fillText('Avg Reward', 45, 35);
        
        // Show current value with highlight
        const currentReward = state.perfData.rewards[state.perfData.rewards.length - 1];
        ctx.fillStyle = currentReward > 0 ? '#4ade80' : '#ff4444';
        ctx.shadowColor = currentReward > 0 ? 'rgba(74, 222, 128, 0.5)' : 'rgba(255, 68, 68, 0.5)';
        ctx.fillText(`Current: ${currentReward.toFixed(3)}`, canvas.width - 120, 35);
        ctx.shadowBlur = 0;
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

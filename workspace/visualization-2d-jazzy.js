// Jazzy 2D Visualization for MuJoCo environments
// Matches the polished 3D aesthetic

// Particle system for effects
class Particle {
    constructor(x, y, vx, vy, color, life) {
        this.x = x;
        this.y = y;
        this.vx = vx;
        this.vy = vy;
        this.color = color;
        this.life = life;
        this.maxLife = life;
    }
    
    update() {
        this.x += this.vx;
        this.y += this.vy;
        this.vy += 0.3; // gravity
        this.life--;
    }
    
    draw(ctx) {
        const alpha = this.life / this.maxLife;
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(this.x, this.y, 2 + (1 - alpha) * 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }
}

// Store particles and trails for each environment
const envEffects = {};

// Initialize effects for an environment
function initEnvEffects(envId) {
    if (!envEffects[envId]) {
        envEffects[envId] = {
            particles: [],
            trail: [],
            lastPos: { x: 0, y: 0 },
            impactTime: 0
        };
    }
}

// Draw jazzy background with gradient
function drawJazzyBackground(ctx, width, height) {
    // Create gradient matching 3D scene background
    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, 'rgb(38, 64, 89)'); // Dark blue top
    gradient.addColorStop(1, 'rgb(20, 35, 50)'); // Darker blue bottom
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
    
    // Add subtle grid with glow effect
    ctx.strokeStyle = 'rgba(74, 158, 255, 0.1)';
    ctx.lineWidth = 1;
    ctx.shadowBlur = 10;
    ctx.shadowColor = 'rgba(74, 158, 255, 0.2)';
    
    // Horizontal lines
    for (let i = 0; i < height; i += 40) {
        ctx.beginPath();
        ctx.moveTo(0, i);
        ctx.lineTo(width, i);
        ctx.stroke();
    }
    
    // Vertical lines
    for (let i = 0; i < width; i += 40) {
        ctx.beginPath();
        ctx.moveTo(i, 0);
        ctx.lineTo(i, height);
        ctx.stroke();
    }
    
    ctx.shadowBlur = 0;
}

// Draw checkered floor pattern at bottom
function drawCheckeredFloor(ctx, width, height) {
    const floorHeight = 60;
    const startY = height - floorHeight;
    
    ctx.save();
    ctx.globalAlpha = 0.3;
    
    const squareSize = 20;
    for (let x = 0; x < width; x += squareSize) {
        for (let y = 0; y < floorHeight; y += squareSize) {
            const isDark = ((x / squareSize) + (y / squareSize)) % 2 === 0;
            ctx.fillStyle = isDark ? 'rgb(26, 51, 77)' : 'rgb(51, 77, 102)';
            ctx.fillRect(x, startY + y, squareSize, squareSize);
        }
    }
    
    // Add reflection gradient
    const reflectionGradient = ctx.createLinearGradient(0, startY, 0, height);
    reflectionGradient.addColorStop(0, 'rgba(74, 158, 255, 0.1)');
    reflectionGradient.addColorStop(1, 'rgba(74, 158, 255, 0)');
    ctx.fillStyle = reflectionGradient;
    ctx.fillRect(0, startY, width, floorHeight);
    
    ctx.restore();
}

// Draw glowing coordinate axes
function drawGlowingAxes(ctx, width, height) {
    ctx.save();
    
    const axisLength = 40;
    const axisOffset = 20;
    const originX = axisOffset + 10;
    const originY = height - axisOffset - 10;
    
    // Glow effect
    ctx.shadowBlur = 10;
    ctx.shadowColor = 'rgba(74, 158, 255, 0.8)';
    ctx.strokeStyle = 'rgba(74, 158, 255, 0.8)';
    ctx.lineWidth = 2;
    
    // X-axis
    ctx.beginPath();
    ctx.moveTo(originX, originY);
    ctx.lineTo(originX + axisLength, originY);
    ctx.stroke();
    
    // Z-axis  
    ctx.beginPath();
    ctx.moveTo(originX, originY);
    ctx.lineTo(originX, originY - axisLength);
    ctx.stroke();
    
    // Arrow heads
    ctx.fillStyle = 'rgba(74, 158, 255, 0.8)';
    // X arrow
    ctx.beginPath();
    ctx.moveTo(originX + axisLength, originY);
    ctx.lineTo(originX + axisLength - 5, originY - 3);
    ctx.lineTo(originX + axisLength - 5, originY + 3);
    ctx.closePath();
    ctx.fill();
    
    // Z arrow
    ctx.beginPath();
    ctx.moveTo(originX, originY - axisLength);
    ctx.lineTo(originX - 3, originY - axisLength + 5);
    ctx.lineTo(originX + 3, originY - axisLength + 5);
    ctx.closePath();
    ctx.fill();
    
    ctx.shadowBlur = 0;
    
    // Labels
    ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.font = 'bold 12px sans-serif';
    ctx.fillText('X', originX + axisLength + 5, originY + 3);
    ctx.fillText('Z', originX - 10, originY - axisLength - 5);
    
    ctx.restore();
}

// Draw motion trail
function drawMotionTrail(ctx, envId, currentX, currentY) {
    const effects = envEffects[envId];
    if (!effects) return;
    
    // Add current position to trail
    if (Math.abs(currentX - effects.lastPos.x) > 2 || Math.abs(currentY - effects.lastPos.y) > 2) {
        effects.trail.push({ x: currentX, y: currentY, alpha: 1 });
        effects.lastPos = { x: currentX, y: currentY };
    }
    
    // Update and draw trail
    ctx.save();
    ctx.lineCap = 'round';
    
    for (let i = effects.trail.length - 1; i >= 0; i--) {
        const point = effects.trail[i];
        point.alpha -= 0.02;
        
        if (point.alpha <= 0) {
            effects.trail.splice(i, 1);
            continue;
        }
        
        if (i > 0) {
            const prevPoint = effects.trail[i - 1];
            ctx.strokeStyle = `rgba(74, 158, 255, ${point.alpha * 0.3})`;
            ctx.lineWidth = 3 * point.alpha;
            ctx.beginPath();
            ctx.moveTo(prevPoint.x, prevPoint.y);
            ctx.lineTo(point.x, point.y);
            ctx.stroke();
        }
    }
    
    ctx.restore();
}

// Draw enhanced stick figure with marionette-style thin limbs
function drawJazzyHumanoid(ctx, x, y, fallen, fallAngle, envId, observation) {
    ctx.save();
    ctx.translate(x, y);
    
    // Subtle glow only
    ctx.shadowBlur = fallen ? 15 : 8;
    ctx.shadowColor = fallen ? 'rgba(255, 68, 68, 0.4)' : 'rgba(74, 158, 255, 0.3)';
    
    if (fallen && fallAngle > 0) {
        ctx.rotate(fallAngle);
    }
    
    // Colors
    const limbColor = fallen ? '#ff6666' : '#6eb5ff';
    const jointColor = 'rgba(255, 255, 255, 0.9)';
    
    // Get joint angles from observation if available
    let jointAngles = {};
    if (observation && observation.qpos) {
        // Humanoid has specific joint mappings
        // Skip first 7 (free joint: 3 pos + 4 quat)
        const q = observation.qpos;
        if (q.length > 7) {
            // Map joint angles (these are approximations for visualization)
            jointAngles = {
                abdomen: q[7] || 0,
                rightHip: q[8] || 0,
                rightKnee: q[9] || 0,
                rightAnkle: q[10] || 0,
                leftHip: q[11] || 0,
                leftKnee: q[12] || 0,
                leftAnkle: q[13] || 0,
                rightShoulder: q[14] || 0,
                rightElbow: q[15] || 0,
                leftShoulder: q[16] || 0,
                leftElbow: q[17] || 0
            };
        }
    }
    
    // Add small jitter from control signals
    let controlJitter = 0;
    if (observation && observation.ctrl) {
        // Sum up control signals for overall "energy"
        controlJitter = observation.ctrl.reduce((sum, val) => sum + Math.abs(val), 0) * 0.01;
    }
    
    // Define joint positions for marionette structure (with angles applied)
    const joints = {
        head: [0 + controlJitter * Math.sin(Date.now() * 0.01), -28],
        neck: [0, -20],
        leftShoulder: [-8, -18],
        rightShoulder: [8, -18],
        leftElbow: [
            -8 + Math.cos(jointAngles.leftShoulder || 0) * -6,
            -18 + Math.sin(jointAngles.leftShoulder || 0) * 8
        ],
        rightElbow: [
            8 + Math.cos(jointAngles.rightShoulder || 0) * 6,
            -18 + Math.sin(jointAngles.rightShoulder || 0) * 8
        ],
        leftHand: [
            -8 + Math.cos(jointAngles.leftShoulder || 0) * -6 + Math.cos((jointAngles.leftShoulder || 0) + (jointAngles.leftElbow || 0)) * -8,
            -18 + Math.sin(jointAngles.leftShoulder || 0) * 8 + Math.sin((jointAngles.leftShoulder || 0) + (jointAngles.leftElbow || 0)) * 8
        ],
        rightHand: [
            8 + Math.cos(jointAngles.rightShoulder || 0) * 6 + Math.cos((jointAngles.rightShoulder || 0) + (jointAngles.rightElbow || 0)) * 8,
            -18 + Math.sin(jointAngles.rightShoulder || 0) * 8 + Math.sin((jointAngles.rightShoulder || 0) + (jointAngles.rightElbow || 0)) * 8
        ],
        pelvis: [0, 5 + Math.sin(jointAngles.abdomen || 0) * 2],
        leftHip: [-5, 8 + Math.sin(jointAngles.abdomen || 0) * 2],
        rightHip: [5, 8 + Math.sin(jointAngles.abdomen || 0) * 2],
        leftKnee: [
            -5 + Math.sin(jointAngles.leftHip || 0) * 4,
            8 + Math.sin(jointAngles.abdomen || 0) * 2 + Math.cos(jointAngles.leftHip || 0) * 10
        ],
        rightKnee: [
            5 + Math.sin(jointAngles.rightHip || 0) * 4,
            8 + Math.sin(jointAngles.abdomen || 0) * 2 + Math.cos(jointAngles.rightHip || 0) * 10
        ],
        leftFoot: [
            -5 + Math.sin(jointAngles.leftHip || 0) * 4 + Math.sin((jointAngles.leftHip || 0) + (jointAngles.leftKnee || 0)) * 3,
            8 + Math.sin(jointAngles.abdomen || 0) * 2 + Math.cos(jointAngles.leftHip || 0) * 10 + Math.cos((jointAngles.leftHip || 0) + (jointAngles.leftKnee || 0)) * 10
        ],
        rightFoot: [
            5 + Math.sin(jointAngles.rightHip || 0) * 4 + Math.sin((jointAngles.rightHip || 0) + (jointAngles.rightKnee || 0)) * 3,
            8 + Math.sin(jointAngles.abdomen || 0) * 2 + Math.cos(jointAngles.rightHip || 0) * 10 + Math.cos((jointAngles.rightHip || 0) + (jointAngles.rightKnee || 0)) * 10
        ]
    };
    
    // Draw thin limbs first (behind joints)
    ctx.strokeStyle = limbColor;
    ctx.lineWidth = 2; // Much thinner for marionette look
    ctx.lineCap = 'round';
    
    // Draw limbs as individual segments for more articulated look
    const drawLimb = (from, to) => {
        ctx.beginPath();
        ctx.moveTo(joints[from][0], joints[from][1]);
        ctx.lineTo(joints[to][0], joints[to][1]);
        ctx.stroke();
    };
    
    // Torso (two segments)
    drawLimb('neck', 'pelvis');
    
    // Arms
    drawLimb('neck', 'leftShoulder');
    drawLimb('neck', 'rightShoulder');
    drawLimb('leftShoulder', 'leftElbow');
    drawLimb('rightShoulder', 'rightElbow');
    drawLimb('leftElbow', 'leftHand');
    drawLimb('rightElbow', 'rightHand');
    
    // Legs
    drawLimb('pelvis', 'leftHip');
    drawLimb('pelvis', 'rightHip');
    drawLimb('leftHip', 'leftKnee');
    drawLimb('rightHip', 'rightKnee');
    drawLimb('leftKnee', 'leftFoot');
    drawLimb('rightKnee', 'rightFoot');
    
    // Draw joints as small circles (like marionette pivots)
    ctx.fillStyle = jointColor;
    ctx.strokeStyle = limbColor;
    ctx.lineWidth = 1;
    ctx.shadowBlur = 5;
    ctx.shadowColor = 'rgba(255, 255, 255, 0.5)';
    
    // Draw joints with visual feedback for control signals
    const jointNames = Object.keys(joints);
    jointNames.forEach((jointName, i) => {
        const [jx, jy] = joints[jointName];
        
        // Check if this joint has active control
        let isActive = false;
        let controlStrength = 0;
        if (observation && observation.ctrl && i < observation.ctrl.length) {
            controlStrength = Math.abs(observation.ctrl[i]);
            isActive = controlStrength > 0.1;
        }
        
        ctx.beginPath();
        ctx.arc(jx, jy, 2 + (isActive ? controlStrength * 2 : 0), 0, Math.PI * 2);
        
        // Pulse active joints
        if (isActive) {
            ctx.fillStyle = `rgba(255, 255, 255, ${0.9 + Math.sin(Date.now() * 0.01) * 0.1})`;
            ctx.shadowBlur = 10 + controlStrength * 5;
            ctx.shadowColor = 'rgba(74, 158, 255, 0.8)';
        } else {
            ctx.fillStyle = jointColor;
            ctx.shadowBlur = 5;
            ctx.shadowColor = 'rgba(255, 255, 255, 0.5)';
        }
        
        ctx.fill();
        ctx.stroke();
    });
    
    // Head as a slightly larger circle (with jitter)
    ctx.beginPath();
    ctx.arc(joints.head[0], joints.head[1], 5, 0, Math.PI * 2);
    ctx.fill();
    
    // Show control signal visualization
    if (observation && observation.ctrl && observation.ctrl.length > 0) {
        ctx.save();
        ctx.globalAlpha = 0.3;
        ctx.strokeStyle = 'rgba(74, 158, 255, 0.6)';
        ctx.lineWidth = 1;
        
        // Draw small force indicators at active joints
        observation.ctrl.forEach((ctrl, i) => {
            if (Math.abs(ctrl) > 0.1 && i < jointNames.length) {
                const jointName = jointNames[i];
                const [jx, jy] = joints[jointName];
                
                // Draw a small line showing force direction
                ctx.beginPath();
                ctx.moveTo(jx, jy);
                ctx.lineTo(jx + ctrl * 10, jy);
                ctx.stroke();
            }
        });
        ctx.restore();
    }
    
    // Add subtle "strings" effect when standing
    if (!fallen) {
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
        ctx.lineWidth = 0.5;
        ctx.setLineDash([2, 4]);
        
        // Draw faint strings from key points
        const stringPoints = ['head', 'leftHand', 'rightHand'];
        stringPoints.forEach(point => {
            ctx.beginPath();
            ctx.moveTo(joints[point][0], joints[point][1]);
            ctx.lineTo(joints[point][0], -50);
            ctx.stroke();
        });
        ctx.setLineDash([]);
    }
    
    ctx.restore();
    
    // Add impact effect if fallen
    if (fallen && envEffects[envId]) {
        const effects = envEffects[envId];
        if (effects.impactTime === 0) {
            effects.impactTime = Date.now();
            // Create impact particles
            for (let i = 0; i < 20; i++) {
                const angle = (Math.PI * 2 * i) / 20;
                const speed = 2 + Math.random() * 3;
                effects.particles.push(new Particle(
                    x, y + 20,
                    Math.cos(angle) * speed,
                    Math.sin(angle) * speed - 2,
                    fallen ? '#ff4444' : '#4a9eff',
                    30
                ));
            }
        }
    }
}

// Update and draw particles
function updateParticles(ctx, envId) {
    const effects = envEffects[envId];
    if (!effects) return;
    
    for (let i = effects.particles.length - 1; i >= 0; i--) {
        const particle = effects.particles[i];
        particle.update();
        
        if (particle.life <= 0) {
            effects.particles.splice(i, 1);
            continue;
        }
        
        particle.draw(ctx);
    }
}

// Main jazzy draw function
export function drawJazzyEnvironment(ctx, canvas, envState) {
    const width = canvas.width;
    const height = canvas.height;
    
    // Initialize effects for this environment
    initEnvEffects(envState.id);
    
    // Draw background
    drawJazzyBackground(ctx, width, height);
    
    // Draw checkered floor
    drawCheckeredFloor(ctx, width, height);
    
    // Draw glowing axes
    drawGlowingAxes(ctx, width, height);
    
    // Calculate humanoid position
    const centerX = width / 2;
    const centerY = height / 2;
    
    let x = centerX;
    let y = centerY;
    let fallen = false;
    let fallAngle = 0;
    
    if (envState.observation && envState.observation.bodyPos) {
        x = centerX + (envState.observation.bodyPos[0] || 0) * 20;
        const height = envState.observation.bodyPos[2] || 0;
        fallen = height < 0.3;
        
        if (fallen) {
            fallAngle = Math.PI / 2 * (1 - Math.max(0, height) / 0.3);
        }
        
        x = Math.max(30, Math.min(width - 30, x));
    }
    
    // Draw motion trail
    drawMotionTrail(ctx, envState.id, x, y);
    
    // Update particles
    updateParticles(ctx, envState.id);
    
    // Draw humanoid with observation data for joint angles and control signals
    drawJazzyHumanoid(ctx, x, y, fallen, fallAngle, envState.id, envState.observation);
    
    // Reset impact time if standing
    if (!fallen && envEffects[envState.id]) {
        envEffects[envState.id].impactTime = 0;
    }
}

// Export for backward compatibility
export function drawCoordinateAxes(ctx, width, height) {
    drawGlowingAxes(ctx, width, height);
}

export function drawStickFigure(ctx, x, y, color, fallen, observation) {
    // Simple wrapper for compatibility
    drawJazzyHumanoid(ctx, x, y, fallen, 0, 0, observation);
}
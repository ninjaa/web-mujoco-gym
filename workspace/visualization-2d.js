// 2D Visualization functions for MuJoCo environments

// Draw coordinate axes overlay
function drawCoordinateAxes(ctx, width, height) {
    ctx.save();
    
    // Position axes in bottom-left corner
    const axisLength = 40;
    const axisOffset = 20;
    const originX = axisOffset + 10;
    const originY = height - axisOffset - 10;
    
    // Draw axes
    ctx.strokeStyle = '#666';
    ctx.lineWidth = 2;
    
    // X-axis (right)
    ctx.beginPath();
    ctx.moveTo(originX, originY);
    ctx.lineTo(originX + axisLength, originY);
    ctx.stroke();
    
    // Z-axis (up in MuJoCo, shown as up in 2D)
    ctx.beginPath();
    ctx.moveTo(originX, originY);
    ctx.lineTo(originX, originY - axisLength);
    ctx.stroke();
    
    // Axis labels
    ctx.fillStyle = '#888';
    ctx.font = '12px sans-serif';
    ctx.fillText('X', originX + axisLength + 5, originY + 3);
    ctx.fillText('Z', originX - 10, originY - axisLength - 5);
    
    // Add coordinate system label
    ctx.font = '10px sans-serif';
    ctx.fillText('MuJoCo: X→ Z↑', originX - 5, originY + 25);
    ctx.fillText('(Y into screen)', originX - 5, originY + 35);
    
    ctx.restore();
}

// Physics-aware stick figure drawing
function drawStickFigure(ctx, x, y, color = '#4a9eff', fallen = false, observation = null) {
    // Draw shadow for fallen robots
    if (fallen) {
        ctx.save();
        ctx.globalAlpha = 0.3;
        ctx.fillStyle = '#ff4444';
        ctx.beginPath();
        ctx.ellipse(x, y + 45, 35, 15, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }
    
    // Get joint angles from observation if available
    let qpos = observation?.qpos || [];
    let qvel = observation?.qvel || [];
    
    // Default upright pose if no joint data
    let hipAngle = 0;
    let kneeAngle = 0;
    let ankleAngle = 0;
    let shoulderAngle = 0;
    let elbowAngle = 0;
    
    // Parse humanoid joint angles (simplified mapping)
    if (qpos.length >= 9) {
        // Root position and orientation (first 7 values)
        // Joint angles start at index 7
        hipAngle = qpos[7] || 0;
        kneeAngle = qpos[8] || 0;
        
        if (qpos.length >= 15) {
            ankleAngle = qpos[9] || 0;
            shoulderAngle = qpos[13] || 0;
            elbowAngle = qpos[14] || 0;
        }
    }
    
    // Color based on joint velocities (activity)
    let jointColors = [];
    if (qvel && qvel.length > 6) {
        // Skip root velocities (first 6), focus on joint velocities
        for (let i = 6; i < Math.min(qvel.length, 20); i++) {
            let velocity = Math.abs(qvel[i]);
            let intensity = Math.min(velocity / 5.0, 1.0); // Normalize to 0-1
            jointColors[i-6] = getHeatmapColor(intensity);
        }
    }
    
    // Base color for torso (changes when fallen)
    let torsoColor = fallen ? '#cc4444' : color;
    
    // Draw stick figure with joint angles
    ctx.save();
    ctx.translate(x, y);
    
    // Scale down for better fit
    ctx.scale(0.7, 0.7);
    
    // Torso
    ctx.strokeStyle = torsoColor;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(0, -20);
    ctx.lineTo(0, 10);
    ctx.stroke();
    
    // Head
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(0, -30, 8, 0, Math.PI * 2);
    ctx.fill();
    
    // Arms (with shoulder rotation)
    ctx.strokeStyle = jointColors[6] || color;
    ctx.lineWidth = 3;
    
    // Right arm
    ctx.save();
    ctx.translate(0, -15);
    ctx.rotate(shoulderAngle * 0.5);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(15, 10);
    ctx.stroke();
    
    // Right forearm
    ctx.translate(15, 10);
    ctx.rotate(elbowAngle * 0.3);
    ctx.strokeStyle = jointColors[7] || color;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(10, 10);
    ctx.stroke();
    ctx.restore();
    
    // Left arm (mirror)
    ctx.save();
    ctx.translate(0, -15);
    ctx.rotate(-shoulderAngle * 0.5);
    ctx.strokeStyle = jointColors[8] || color;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-15, 10);
    ctx.stroke();
    
    ctx.translate(-15, 10);
    ctx.rotate(-elbowAngle * 0.3);
    ctx.strokeStyle = jointColors[9] || color;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-10, 10);
    ctx.stroke();
    ctx.restore();
    
    // Legs with hip/knee articulation
    ctx.lineWidth = 3;
    
    // Right leg
    ctx.save();
    ctx.translate(0, 10);
    ctx.rotate(hipAngle * 0.3);
    ctx.strokeStyle = jointColors[0] || color;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(8, 20);
    ctx.stroke();
    
    // Right shin
    ctx.translate(8, 20);
    ctx.rotate(kneeAngle * 0.4);
    ctx.strokeStyle = jointColors[1] || color;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, 20);
    ctx.stroke();
    
    // Right foot
    ctx.translate(0, 20);
    ctx.rotate(ankleAngle * 0.2);
    ctx.strokeStyle = jointColors[2] || color;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(5, 3);
    ctx.stroke();
    ctx.restore();
    
    // Left leg (mirror)
    ctx.save();
    ctx.translate(0, 10);
    ctx.rotate(-hipAngle * 0.3);
    ctx.strokeStyle = jointColors[3] || color;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-8, 20);
    ctx.stroke();
    
    ctx.translate(-8, 20);
    ctx.rotate(-kneeAngle * 0.4);
    ctx.strokeStyle = jointColors[4] || color;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, 20);
    ctx.stroke();
    
    ctx.translate(0, 20);
    ctx.rotate(-ankleAngle * 0.2);
    ctx.strokeStyle = jointColors[5] || color;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-5, 3);
    ctx.stroke();
    ctx.restore();
    
    // Draw joint dots
    ctx.fillStyle = 'white';
    ctx.globalAlpha = 0.8;
    
    // Joint positions
    let joints = [
        {x: 0, y: -15}, // shoulders
        {x: 0, y: 10},  // hips
        {x: 8, y: 30},  // right knee
        {x: -8, y: 30}, // left knee
    ];
    
    joints.forEach(joint => {
        ctx.beginPath();
        ctx.arc(joint.x, joint.y, 3, 0, Math.PI * 2);
        ctx.fill();
    });
    
    ctx.restore();
    
    // Add motion trail for fast movement
    if (qvel && Math.abs(qvel[0]) + Math.abs(qvel[1]) > 2) {
        ctx.save();
        ctx.globalAlpha = 0.2;
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]);
        
        let trailX = x - qvel[0] * 5;
        let trailY = y - qvel[1] * 5;
        
        ctx.beginPath();
        ctx.moveTo(trailX, trailY);
        ctx.lineTo(x, y);
        ctx.stroke();
        
        ctx.restore();
    }
}

// Helper function for heat map colors
function getHeatmapColor(value) {
    // value should be 0-1
    // Green (low) -> Yellow (medium) -> Red (high)
    if (value < 0.5) {
        // Green to Yellow
        let r = Math.floor(255 * (value * 2));
        let g = 255;
        return `rgb(${r}, ${g}, 0)`;
    } else {
        // Yellow to Red
        let r = 255;
        let g = Math.floor(255 * (2 - value * 2));
        return `rgb(${r}, ${g}, 0)`;
    }
}

// Make functions available globally
window.drawCoordinateAxes = drawCoordinateAxes;
window.drawStickFigure = drawStickFigure;
window.getHeatmapColor = getHeatmapColor;

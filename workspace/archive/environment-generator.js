// Environment configuration generator for RL training
class EnvironmentGenerator {
  constructor(baseXML) {
    this.baseXML = baseXML;
  }

  // Generate environment variations
  generateVariations(count = 1000) {
    const variations = [];
    
    for (let i = 0; i < count; i++) {
      variations.push({
        id: i,
        // Physics parameters
        gravity: -9.81 + (Math.random() - 0.5) * 2, // ±1 m/s²
        friction: 0.5 + (Math.random() - 0.5) * 0.3,
        
        // Object parameters
        masses: this.randomizeMasses(),
        sizes: this.randomizeSizes(),
        
        // Initial conditions
        initialPositions: this.randomizePositions(),
        initialVelocities: this.randomizeVelocities(),
        
        // Task-specific parameters
        targetPosition: this.randomizeTarget(),
        obstacles: this.generateObstacles(Math.floor(Math.random() * 5))
      });
    }
    
    return variations;
  }

  randomizeMasses() {
    // Return object with mass variations
    return {
      body1: 1.0 + (Math.random() - 0.5) * 0.4,
      body2: 0.5 + (Math.random() - 0.5) * 0.2
    };
  }

  randomizeSizes() {
    // Size variations for domain randomization
    return {
      link1_length: 0.5 + (Math.random() - 0.5) * 0.1,
      link2_length: 0.4 + (Math.random() - 0.5) * 0.1
    };
  }

  randomizePositions() {
    return {
      x: (Math.random() - 0.5) * 2,
      y: (Math.random() - 0.5) * 2,
      z: Math.random() * 0.5
    };
  }

  randomizeVelocities() {
    return {
      vx: (Math.random() - 0.5) * 0.1,
      vy: (Math.random() - 0.5) * 0.1,
      vz: 0
    };
  }

  randomizeTarget() {
    return {
      x: (Math.random() - 0.5) * 3,
      y: (Math.random() - 0.5) * 3
    };
  }

  generateObstacles(count) {
    const obstacles = [];
    for (let i = 0; i < count; i++) {
      obstacles.push({
        position: this.randomizePositions(),
        size: 0.1 + Math.random() * 0.2
      });
    }
    return obstacles;
  }

  // Apply variations to MuJoCo XML
  applyVariation(variation) {
    let xml = this.baseXML;
    
    // Update gravity
    xml = xml.replace(
      /gravity="[^"]*"/,
      `gravity="0 0 ${variation.gravity}"`
    );
    
    // Update masses, sizes, etc.
    // This would be more sophisticated in practice
    
    return xml;
  }
}

// Export for use in workers
if (typeof module !== 'undefined') {
  module.exports = EnvironmentGenerator;
}

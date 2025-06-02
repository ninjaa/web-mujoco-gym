# LLM Scene Generation Vision

## 🌟 The Big Idea

Move beyond parameter tweaking to **full MuJoCo scene generation** via LLM prompts.

## Current State vs. Vision

### What We Have Now (Meta-RL Demo):
```javascript
// Same humanoid.xml, different reward functions
const rewardStrategies = [
  "maximize forward velocity",
  "minimize energy consumption", 
  "maintain balance and stability"
];
// Claude generates reward FUNCTIONS, same physics scene
```

### The Vision:
```javascript
// Different WORLDS for each prompt
const scenePrompts = [
  "humanoid walking on ice (low friction)",
  "robot climbing stairs with handrails", 
  "quadruped navigating obstacle course",
  "humanoid in low gravity (moon walking)"
];
// Claude generates entire MuJoCo XML scenes
```

## Technical Challenge: Hot-Swapping Physics

### Current Limitation:
```javascript
// Workers load ONE model at startup
const model = await loadModelFromURL('/workspace/humanoid.xml');
// Model is "locked in" for entire session
```

### Required Innovation:
```javascript
async function loadSceneFromPrompt(prompt) {
  // 1. Send prompt to Claude
  const xmlScene = await claude.generateMuJoCoScene(prompt);
  
  // 2. Validate XML structure  
  const validated = validateMuJoCoXML(xmlScene);
  
  // 3. Hot-swap physics model
  if (window.currentModel) {
    window.currentModel.free(); // Avoid memory leaks
  }
  
  window.currentModel = await loadModelFromXMLString(validated);
  window.simulation = window.currentModel.makeData();
  
  // 4. Reset observation/action spaces
  updateActionSpace(window.currentModel.nu);
  updateObservationSpace(window.currentModel.nbody);
}
```

## Example Prompt → Scene Transformations

### "Robot on narrow beam"
```xml
<worldbody>
  <body name="beam">
    <geom type="box" size="0.1 2.0 0.05" material="wood"/>
  </body>
  <body name="humanoid" pos="0 0 1.0">
    <!-- Humanoid starting ON the beam -->
  </body>
</worldbody>
```

### "Robot pushing heavy box up ramp"
```xml
<worldbody>
  <body name="ramp">
    <geom type="box" size="1.0 2.0 0.1" euler="0 0 0.2"/>
  </body>
  <body name="box" pos="0 -1 0.5">
    <geom type="box" size="0.3 0.3 0.3" mass="10"/>
  </body>
</worldbody>
```

## Implementation Roadmap

### Phase 1: Static Scene Library
```javascript
const prebuiltScenes = {
  "stairs": "/models/staircase.xml",
  "ice": "/models/slippery-surface.xml", 
  "obstacles": "/models/obstacle-course.xml"
};
// Test hot-swapping with known-good XMLs
```

### Phase 2: LLM Generator
```javascript
async function generateScene(prompt) {
  const response = await claude.complete(`
    Generate a valid MuJoCo XML scene for: "${prompt}"
    
    Requirements:
    - Include <worldbody>, <asset>, <actuator> sections
    - Ensure valid physics properties
    - Add appropriate lighting and materials
    - Compatible with humanoid agent
  `);
  return response.content;
}
```

### Phase 3: Adaptive Training
```javascript
const sceneSpecificTraining = {
  "stairs": "reward height gain + stability",
  "ice": "reward slow precise movements", 
  "obstacles": "reward path efficiency + collision avoidance"
};
```

## The "Infinite Environment Generator"

**Vision:** Human → Prompt → Claude → Physics → Learning Loop

1. **Human**: "Make robot learn to dance"
2. **Claude**: Generates dance floor XML + music-synced rewards
3. **Physics**: Robot learns rhythmic movement patterns  
4. **Human**: "Now dance on a tightrope"
5. **Claude**: Combines dance + balance in new XML

## Status: Future Work

This is a **post-MVP enhancement**. First priority:
1. ✅ Clean workspace organization
2. ✅ Fix basic humanoid standing RL
3. ✅ Stable multi-environment training
4. 🔮 Then explore scene generation

---
*Captured: 2024-06-01 - Vision discussion with Aditya*

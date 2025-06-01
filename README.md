# TabRL: AI Training AI in Your Browser Tab 🤖

A groundbreaking browser-based reinforcement learning framework that uses LLMs (Claude) to iteratively improve humanoid robot control policies - all running locally in your browser!

**🎥 Demo Video: https://tinyurl.com/tabrl**

![Demo Screenshot](./workspace/current%20dashboard.png)

## 🚀 Quick Start

### 1. Start the Claude API Proxy (Required for LLM Features)
```bash
# Simple proxy - no dependencies needed!
node workspace/simple-proxy.js
```

### 2. Open the Demo
```bash
# Main multi-environment demo
open http://localhost:8080/workspace/multi-env-demo.html

# LLM-guided meta-learning demo
open http://localhost:8080/workspace/claude-rl-demo.html
```

### 3. Configure Claude API (Optional)
Edit `workspace/claude-config.js` and add your API key:
```javascript
window.CLAUDE_CONFIG = {
    apiKey: 'YOUR_ANTHROPIC_API_KEY_HERE',
    model: 'claude-opus-4-20250514',
    maxTokens: 1000
};
```

## 🎯 Features

### Browser-Based RL Training
- **Real-time policy gradient learning** - Train neural networks directly in the browser
- **WebAssembly MuJoCo physics** - Full physics simulation at 1000+ Hz
- **Multi-threaded architecture** - Web Workers for parallel training
- **Zero installation** - Just open in a browser!

### LLM-Guided Meta-Learning
- **Claude-generated reward functions** - AI writes reward functions based on task descriptions
- **Iterative improvement** - Claude analyzes performance and suggests hyperparameter changes
- **Population-based training** - 4 policies compete with different strategies
- **Automatic convergence** - Meta-loop finds optimal configurations

### Visualization
- **2D stick figure rendering** - Real-time robot state visualization
- **3D Three.js views** - Click any environment for detailed 3D view
- **Performance graphs** - Track learning progress across iterations
- **Live statistics** - FPS, rewards, episode counts

## 🏗️ Architecture

```
┌─────────────────────────────────────────┐
│          Browser Main Thread            │
│  ┌─────────────┐  ┌──────────────┐    │
│  │ Orchestrator │  │ Visualization │    │
│  └─────────────┘  └──────────────┘    │
└─────────────┬───────────────────────────┘
               │
     ┌─────────┴─────────┬─────────────┐
     ▼                   ▼             ▼
┌─────────┐      ┌─────────┐    ┌─────────┐
│Worker 1 │      │Worker 2 │    │Worker N │
│┌───────┐│      │┌───────┐│    │┌───────┐│
││MuJoCo ││      ││MuJoCo ││    ││MuJoCo ││
│└───────┘│      │└───────┘│    │└───────┘│
│ Env 1-20│      │Env 21-40│    │   ...   │
└─────────┘      └─────────┘    └─────────┘
```
## MuJoCo RL Policy Learning Architecture & Convergence

```
+------------------------------+     s_t     +---------------------------------+     Gradients     +---------------------------------+
|     MuJoCo Environment       |-----------> |    RL Agent (Actor-Critic)      |-----------------> |    Training & Convergence       |
|                              |             |                                 |                   |                                 |
| - Physics Engine (MuJoCo)    | <---------- | - Actor Network pi(a|s)         |                   | - Policy Gradient Update        |
| - Task (e.g., Walk)          |  Action a_t |   (Policy Params θ,             |                   |   (θ ← θ + α∇J(θ),             |
| - Reward Function            |             |    Action Distribution)         |                   |    Φ ← Φ + β∇L(Φ))             |
| - State/Observation          | <---------- | - Critic Network V(s)           |                   | - Loss Functions                |
|   (joint pos, vel, etc.)     |  Reward r_t |   (Value Params Φ, State Value) |                   |   (Policy Loss, Value Loss,     |
|                              |             | - Algorithm Options             |                   |    Entropy Loss)                |
|                              |             |   (PPO, SAC, A3C/A2C, etc.)     |                   | - Convergence Metrics           |
|                              |             | - Experience Buffer/Replay      |                   |   (Avg Episode Return,          |
|                              |             |   (s, a, r, s', done)           |                   |    Policy Loss Reduction, etc.) |
+------------------------------+             +---------------------------------+                   +---------------------------------+
```

## Modular Design (v2)
The latest refactor splits functionality into focused modules:
- `mujoco-orchestrator.js` - Manages worker pool and environment distribution
- `mujoco-rl-worker-v2.js` - Runs MuJoCo physics in Web Workers
- `ui-controls.js` - UI state management and render loop
- `visualization-2d.js` - 2D stick figure rendering
- `threejs-modal.js` - 3D visualization popup (click any environment)


### Key Components
- **mujoco-orchestrator-v3.js** - Manages worker pool and environment distribution
- **browser-rl.js** - Policy gradient RL implementation with TinyMLP
- **claude-reward-generator.js** - LLM integration for reward function generation
- **visualization-2d.js** - Efficient 2D rendering with jazzy effects
- **threejs-modal.js** - 3D visualization popup
- **simple-proxy.js** - Lightweight CORS proxy for Claude API access

## 🧠 How It Works

### 1. Physics Simulation
MuJoCo WASM runs in Web Workers, simulating humanoid robot dynamics at 1000+ Hz.

### 2. Neural Network Policy
A tiny MLP (72→64→32→21) learns to control 21 joint torques based on:
- Body position and velocity
- Joint positions and velocities
- Contact forces

### 3. Policy Gradient Learning
```javascript
// Simplified update rule
gradient = advantage * log_prob
weights += learning_rate * gradient
```

### 4. LLM Meta-Loop
Claude generates reward functions and analyzes performance:
```
Iteration 1: Generate diverse reward functions
→ Train 4 policies in parallel
→ Claude analyzes results
→ Suggests hyperparameter changes

Iteration 2: Apply Claude's suggestions
→ Train with improved configs
→ Track convergence

Iteration 3: Final optimization
→ Export best policy
```

## 📊 Performance

- **Training Speed**: 50-500 episodes converge to stable walking
- **Physics Rate**: 1000+ steps/second per environment  
- **Rendering**: 120 FPS with 12 environments
- **Scalability**: Tested with 100+ parallel environments

## 🛠️ Development

### Docker Setup (Full Build Environment)
```bash
# Build and run
docker-compose up --build -d

# Access container
docker exec -it mujoco-wasm-container bash

# Rebuild WASM
docker exec -it mujoco-wasm-container build
```

### Project Structure
```
workspace/
├── claude-rl-demo.html      # LLM meta-learning demo
├── multi-env-demo.html      # Main parallel RL demo
├── browser-rl.js            # RL algorithm implementation
├── claude-reward-generator.js # LLM reward generation
├── mujoco-orchestrator-v3.js # Worker management
├── visualization-2d.js      # 2D rendering
├── threejs-modal.js        # 3D visualization
└── simple-proxy.js         # CORS proxy for Claude API
```

## 🎮 Usage Examples

### Basic RL Training
```javascript
const policy = new BrowserRL();
const orchestrator = new OptimizedOrchestrator(1, 1);
await orchestrator.initialize();

// Train for 100 episodes
for (let i = 0; i < 100; i++) {
    const reward = await policy.trainEpisode(orchestrator, rewardFunction, 0);
    console.log(`Episode ${i}: ${reward}`);
}
```

### LLM-Generated Rewards
```javascript
const generator = new ClaudeRewardGenerator(apiKey);
const rewardFn = await generator.generateReward("Make robot walk forward efficiently");
```

## 🚧 Current Status

**Hackathon Sprint - Statement 3: Reasoning and Task RL**
- ✅ Browser-based RL training working
- ✅ LLM-guided reward generation implemented
- ✅ Meta-learning loop with Claude analysis
- ✅ Real-time visualization
- ✅ CORS proxy for API calls
- 🔄 Integration with multi-agent factory (overtime hack)

**Next Steps (Overtime Hacking):**
- Connect trained policies from `claude-rl-demo.html` to `multi-env-demo.html`
- Enable running pre-trained policies without training episodes
- Scale to 1000+ environments running exported policies

## 🎯 Use Cases

1. **RL Education**: Students can experiment without cloud access
2. **Rapid Prototyping**: Test reward functions and environment designs instantly
3. **Interactive Demos**: Show off your trained agents with a shareable link
4. **Curriculum Learning**: Dynamically adjust environment difficulty
5. **Multi-Agent RL**: Run swarms of agents in the same browser

## 💡 Why This Matters

Traditional RL development has two major bottlenecks:
1. **Compute Infrastructure**: Expensive cloud setups for parallel training
2. **Reward Engineering**: Manual trial-and-error to design reward functions

**TabRL solves both.** Run massively parallel physics simulations in your browser while Claude AI automatically generates and optimizes reward functions based on natural language task descriptions.

## 🌟 Unique Value Proposition

**"AI Training AI, All in Your Browser"** - TabRL represents a paradigm shift where LLMs guide the entire RL training process, from reward design to hyperparameter optimization.

Traditional RL Development:
- 💸 Expensive cloud infrastructure
- 🔧 Manual reward function engineering
- ⏰ Trial-and-error hyperparameter tuning
- 🚫 Separate tools for simulation, training, and visualization

TabRL Revolution:
- 🤖 AI generates and optimizes reward functions
- 🧠 Meta-learning finds best hyperparameters automatically
- 🌐 Everything runs in your browser tab
- 👀 Watch AI train AI in real-time
- 📤 Export trained policies instantly

## 📝 Future Improvements

- [ ] More sophisticated neural network architectures
- [ ] PPO/SAC algorithm implementations
- [ ] Multi-task learning
- [ ] Sim-to-real transfer experiments
- [ ] Mobile browser support

## 🙏 Acknowledgments

- [MuJoCo WASM](https://github.com/zalo/mujoco_wasm) for physics engine
- [Anthropic Claude](https://www.anthropic.com/) for LLM capabilities
- Browser ML community for inspiration

## 📬 Contact

- Hackathon Team: [aditya@bestparents.com], [richa.flutr@gmail.com]
- Project Leads: Aditya, Richa
- GitHub: [ninjaa] [richafltr]

---

*🏆 CV x AIWF Hackathon 2025 - Statement 3: Reasoning and Task RL*

*Built with ❤️ using Claude Opus 4, Windsurf, and the power of browser-based ML*

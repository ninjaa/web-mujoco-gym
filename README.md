# 🚀 MuJoCo WebSim: Massively Parallel RL in Your Browser

## 🎯 The Vision

**"What if you could run 1000 reinforcement learning environments on your laptop... in a browser tab?"**

MuJoCo WebSim brings massively parallel physics simulation to the web, democratizing large-scale RL experimentation. No cloud setup. No infrastructure costs. Just open a browser and start training.

## 💡 Why This Matters

Current RL research requires either:
- 🖥️ Expensive cloud compute for parallel training
- ⏰ Slow local training with limited parallelism  
- 🔧 Complex distributed systems setup

**We're changing that.** With WebAssembly and Web Workers, we can run hundreds of MuJoCo physics simulations in parallel, right in your browser.

### Key Innovations
1. **Browser-Native Parallelism**: Leverage Web Workers for true parallel execution
2. **Zero Infrastructure**: No Docker swarms, no Kubernetes, no cloud bills
3. **Real-Time Visualization**: See what your agent is learning as it trains
4. **Instant Sharing**: Send a URL to share your trained agent with anyone
5. **Cross-Platform**: Works on any device with a modern browser

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

### Modular Design (v2)
The latest refactor splits functionality into focused modules:
- `mujoco-orchestrator.js` - Manages worker pool and environment distribution
- `mujoco-rl-worker-v2.js` - Runs MuJoCo physics in Web Workers
- `ui-controls.js` - UI state management and render loop
- `visualization-2d.js` - 2D stick figure rendering
- `threejs-modal.js` - 3D visualization popup (click any environment)

## 📊 Current Status

### ✅ Working
- MuJoCo WASM compilation pipeline (x86_64 via Docker on Apple Silicon)
- Multi-environment orchestration with Web Workers
- Real-time visualization dashboard
- Basic physics simulation (pendulum demo)
- RL policy integration
- Environment randomization

### 🚧 In Progress
- Integration of complex robot models (humanoid, ant, cheetah)
- Performance optimization for 1000+ environments
- RL policy integration
- Environment randomization

### 📈 Performance Targets
- **Current**: 120 visual FPS with 12 environments
- **Target**: 1000+ environments at 10,000+ physics steps/second
- **Strategy**: Decouple physics from rendering, batch updates

## 🎮 Use Cases

1. **RL Education**: Students can experiment without cloud access
2. **Rapid Prototyping**: Test reward functions and environment designs instantly
3. **Interactive Demos**: Show off your trained agents with a shareable link
4. **Curriculum Learning**: Dynamically adjust environment difficulty
5. **Multi-Agent RL**: Run swarms of agents in the same browser

## 🚀 Quick Start

```bash
# Clone the repository
git clone https://github.com/yourusername/mujoco-websim.git
cd mujoco-websim

# Build and run (requires Docker)
docker-compose up --build -d

# Open the demo
open http://localhost:8080/workspace/multi-env-demo.html
```

## 🛠️ Development Setup

### Prerequisites
- Docker (for building MuJoCo WASM)
- Modern browser with Web Worker support
- 8GB+ RAM recommended for 100+ environments

### Building from Source
```bash
# The Docker container handles the complex WASM build
docker-compose up --build -d

# Watch the build logs
docker logs -f mujoco-wasm-container

# Access the demos
http://localhost:8080/workspace/multi-env-demo.html    # Main parallel RL demo
```

## 🎯 Hackathon Goals

### Phase 1: Core Demo (Day 1)
- [ ] Fix robot model rendering (currently showing spheres)
- [ ] Integrate real MuJoCo physics into parallel demo
- [ ] Benchmark maximum environments on M1 MacBook Pro

### Phase 2: Scale & Performance (Day 2)  
- [ ] Optimize for 1000+ environments
- [ ] Add environment diversity and randomization
- [ ] Implement basic RL policy (PPO or SAC)
- [ ] Cloud deployment and scaling tests

### Phase 3: Polish & Present (Day 3)
- [ ] Create compelling visual demo
- [ ] Add interactive controls (speed, env count, visualization options)
- [ ] Performance comparison vs traditional approaches
- [ ] Prepare 3-minute pitch

## 📚 Technical Documentation

- [**Project Status & Demo Guide**](./PROJECT-STATUS.md) - Current implementation status and demo instructions
- [MuJoCo Array Mapping Guide](./MUJOCO-ARRAY-MAPPING.md) - Understanding how MuJoCo XML models map to WASM arrays
- [Technical Architecture Brief](./TECHNICAL-BRIEF.md) - Deep dive into system design and performance

## 🌟 Unique Value Proposition

**"The Jupyter Notebook of RL"** - Just as Jupyter democratized data science by making it interactive and shareable, MuJoCo WebSim democratizes RL research by making parallel simulation accessible to everyone.

No more:
- 💸 $1000s in cloud bills
- 🔧 Complex Docker/K8s setups  
- ⏰ Waiting hours for single-threaded training
- 🚫 "Works on my machine" problems

Just:
- 🌐 Open a browser
- 🚀 Run hundreds of environments
- 👀 Watch your agent learn
- 🔗 Share with a URL

## 📝 Architecture

This project implements a novel system for reinforcement learning where an AI agent not only learns policies within simulated environments but also autonomously adapts the environments themselves—including their reward functions—to optimize learning. This is achieved by running multiple MuJoCo WebAssembly (WASM) environments in parallel within the browser, managed by an intelligent agent.

### Core Idea

The central concept is an agent that learns *how to learn better*. Instead of passively training in static environments, the agent actively experiments by:
1.  Running multiple environment instances simultaneously.
2.  Monitoring policy performance and convergence metrics across these instances.
3.  Autonomously modifying environment configurations (e.g., task type, physical parameters) or redesigning reward functions for subsequent training iterations.

This creates a powerful feedback loop where the system can reroute its training efforts towards more promising configurations or explore diverse behaviors by dynamically shaping its own curriculum and objectives.

### System Layers

The architecture is composed of four main layers:

1.  **MuJoCo Simulation Workers (`workspace/mujoco-rl-worker-v2.js`)**
    *   **Functionality:** Each worker is an independent MuJoCo physics simulation running in its own Web Worker thread. This enables true parallel execution of multiple environments without blocking the browser's main UI thread.
    *   **Responsibilities:**
        *   Loading MuJoCo models (e.g., `humanoid.xml` or procedurally generated simple models).
        *   Executing physics steps based on actions received from the Orchestrator.
        *   Calculating low-level observations (e.g., joint positions, velocities) and a basic, internal reward signal.
        *   Determining episode termination conditions (e.g., robot falling, task completion, timeout).
        *   Communicating simulation results (next state, internal reward, done flag) back to the Orchestrator.

2.  **Environment Orchestrator (`workspace/mujoco-orchestrator-v3.js`)**
    *   **Functionality:** Manages the fleet of MuJoCo Simulation Workers. It acts as the intermediary between the low-level simulations and the high-level RL agent.
    *   **Responsibilities:**
        *   Initializing and managing a configurable number of parallel environments (`numEnvironments`) distributed across a pool of workers (`numWorkers`).
        *   Distributing initial environment configurations (e.g., `envType`) to workers.
        *   Collecting data (observations, internal rewards, done flags) from all workers.
        *   Aggregating and tracking per-environment statistics like total episodic reward (based on worker's internal reward) and episode length.
        *   Providing an API for the RL agent to send actions to specific environments (`setAction`) and retrieve their current state (`getEnvironmentState`).
        *   Handling environment resets upon episode completion.

3.  **Reinforcement Learning Agent (`workspace/browser-rl.js`)**
    *   **Functionality:** This is the primary learning component. It develops policies to control the robots in the MuJoCo environments.
    *   **Components & Responsibilities:**
        *   **Policy Network (`TinyMLP`):** A Multi-Layer Perceptron that maps observations to actions.
        *   **Learning Algorithms:** Implements algorithms like Policy Gradients or Evolution Strategies (`BrowserRL` and `EvolutionStrategies` classes).
        *   **Interaction:** Receives observations from the Orchestrator, uses its policy to select actions, and sends these actions back to the Orchestrator.
        *   **Dynamic Reward Usage:** Crucially, the agent uses its *own* reward function (potentially generated by the `ClaudeRewardGenerator`) to evaluate (state, action) pairs for its learning updates. This allows the agent to learn based on a dynamically changing objective, even if the worker's internal reward is more static.
        *   **Decision Making for Adaptation:** Monitors various performance and convergence metrics to decide when and how to modify environment configurations or reward functions.

4.  **Generative Reward Design (`workspace/claude-reward-generator.js`)**
    *   **Functionality:** Dynamically generates new JavaScript reward functions based on high-level task descriptions. This component simulates interaction with a large language model (Anthropic's Claude) or uses predefined mock functions for demonstration.
    *   **Integration:** When the RL Agent decides a new reward strategy is needed (e.g., to encourage a new behavior or overcome a learning plateau), it provides a `taskDescription` (e.g., "make the humanoid walk like a zombie") to this generator.
    *   **Output:** The generator returns a new JavaScript `rewardFunction(state, action)`.
    *   **Deployment:** This new `rewardFunction` is then adopted by the RL Agent for its subsequent learning updates. The agent uses this function to calculate the rewards it uses for policy optimization, effectively changing the learning objective.

### The Autonomous Adaptation Loop

The system's ability to autonomously adapt its training regime follows this cycle:

1.  **Initialization:** The Orchestrator starts `N` environments with initial configurations (e.g., default `envType`, RL agent uses a default or initial `rewardFunction`).
2.  **Training:** The RL Agent trains its policy/policies by interacting with these environments via the Orchestrator. It uses its current `rewardFunction` to interpret outcomes and guide learning.
3.  **Monitoring & Analysis:** The RL Agent continuously monitors:
    *   **Convergence Metrics:** Policy loss, value loss (if applicable), rate of improvement in episodic rewards.
    *   **Performance Metrics (from Orchestrator & Agent):** Average episodic reward (calculated by the agent using its current `rewardFunction`), episode length, task success rates.
4.  **Trigger for Adaptation:** If specific conditions are met—such as learning stagnation, achievement of a performance threshold for the current task, or a predefined exploration schedule—the agent decides to adapt.
5.  **Formulating Change:**
    *   The agent formulates a new `taskDescription` for the `ClaudeRewardGenerator` to obtain a new `rewardFunction`.
    *   Optionally, the agent might also decide to change the `envType` for some workers (e.g., switch from 'humanoid' to 'pendulum' or a custom-defined simple model).
6.  **Implementing Change:**
    *   The RL Agent updates the `rewardFunction` it uses for learning.
    *   If `envType` or other fundamental environment parameters need to change, the Agent instructs the Orchestrator to re-initialize specific workers with the new physical configurations.
7.  **Continued Learning:** The RL Agent resumes training, now with potentially modified environment physics and/or a new learning objective defined by the new `rewardFunction`.

This iterative process allows the system to intelligently explore the space of tasks and learning strategies, aiming for more robust and efficient policy development.

### Key Convergence & Performance Metrics

The agent primarily relies on the following metrics to guide its adaptation strategy:

*   **Policy Loss / Value Loss:** Direct indicators from the RL algorithm (`BrowserRL`) about how well the policy is learning.
*   **Average Episodic Return:** The total reward (as calculated by the agent's current dynamic `rewardFunction`) accumulated over an episode. Tracked by the `BrowserRL` agent using data from the `OptimizedOrchestrator`.
*   **Episode Length:** How long an agent can perform the task before termination. Provided by the `OptimizedOrchestrator`.
*   **Rate of Improvement:** The change in average episodic return or loss over time or training steps.
*   **Task-Specific Success Metrics:** Can be derived from observations if the reward function is designed to implicitly or explicitly track them (e.g., distance traveled, time balanced).

By leveraging these metrics, the agent makes informed decisions about when to stick with a current training regime and when to pivot by reconfiguring the environments or the definition of success itself.

## 🤝 Contributing

We're looking for help with:
- WebGL-based rendering optimizations
- RL algorithm implementations
- Environment variety (manipulation, locomotion, multi-agent)
- Performance profiling and optimization

## 📬 Contact

- Hackathon Team: [aditya@bestparents.com]
- Project Leads: Aditya, Richa
- GitHub: [ninjaa] [richafltr]

---

*Built with ❤️ at CV x AIWF Hackathon 2025*
*Shoutouts to Claude 4 Opus and Windsurf for the AI assistance*

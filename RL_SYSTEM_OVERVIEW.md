# RL System Overview for TabRL (browser-rl.js)

This document outlines the mechanics of the reinforcement learning (RL) system implemented primarily within `browser-rl.js`. It's intended to provide clarity for understanding its current functionality and for planning future upgrades or alternative approaches.

## 1. Core RL Approach

The system uses a custom, lightweight approach that combines elements of policy gradient methods (like REINFORCE) with a non-standard policy update mechanism based on **randomized weight perturbation** (akin to an evolutionary strategy or simple neuroevolution) rather than traditional backpropagation through the policy network.

**Key Characteristics:**
- **Policy Network:** A simple Multi-Layer Perceptron (`TinyMLP`) outputs actions directly.
- **Learning Signal:** Based on the total discounted reward (return) of an entire episode.
- **Policy Update:** Weights of the `TinyMLP` are adjusted by adding scaled random noise, where the scaling is influenced by the episode's return and a learning rate. This is **not a gradient descent** method using backpropagated gradients.

## 2. Key Components & Interactions

### a. `TinyMLP` (within `browser-rl.js`)
- **Responsibilities:** Implements a basic feedforward neural network.
  - **Initialization:** Takes an array of layer sizes. Weights are initialized randomly with small values; biases are initialized to zero.
  - **Forward Pass (`forward(input)`):** 
    - Propagates input through the network.
    - Uses ReLU activation for hidden layers.
    - Uses `tanh` activation for the output layer (suitable for actions bounded between -1 and 1).
  - **Weight Update (`updateWeights(gradient, learningRate)`):
    - This is the core of the learning mechanism and is non-standard.
    - The `gradient` parameter here is **not a true gradient vector** but rather a scalar signal representing the quality of the episode (e.g., the momentum-smoothed average normalized return).
    - It perturbs existing weights and biases by adding random noise. The magnitude and direction of this noise are influenced by the scalar `gradient` signal and the `learningRate`.
    - Weights and biases are clamped to predefined ranges to prevent them from growing too large.
  - **Serialization/Deserialization:** Allows saving and loading the trained policy network.

### b. `BrowserRL` (within `browser-rl.js`)
- **Responsibilities:** Orchestrates the entire RL training process for a single agent or environment instance.
  - **Initialization:**
    - Creates a `policy` network using `TinyMLP` (hardcoded architecture: `[72, 64, 32, 21]`, implying 72 observation dimensions and 21 action dimensions).
    - Sets learning parameters like `learningRate` and `gamma` (discount factor).
    - Manages training state (e.g., `isTraining`, `currentEpisode`, `maxEpisodes`).
  - **Episode Training (`trainEpisode(orchestrator, rewardFn, envId)`):
    - Manages a single episode of interaction.
    - Resets the specified environment via the `orchestrator`.
    - Collects a trajectory of (state, action, reward) tuples.
    - Calls `updatePolicy()` at the end of the episode.
  - **Policy Update (`updatePolicy(trajectory)`):
    - Calculates discounted returns (`G_t`) for each step in the trajectory (rewards-to-go).
    - Normalizes these returns (subtract mean, divide by standard deviation) for stability.
    - Computes an `updateSignal` which is the average of these normalized returns for the episode.
    - Applies momentum to this `updateSignal`.
    - Calls `this.policy.updateWeights()` using the momentum-smoothed `updateSignal` and an adaptive learning rate (adjusted based on the mean raw return of the episode).
  - **Training Management (`startTraining`, `stopTraining`, `trainMultipleEpisodes`):
    - Provides higher-level control for running multiple training episodes.
    - Handles callbacks for visualization (`onRewardUpdate`, `onTrainingStep`, `onEpisodeComplete`).

### c. Orchestrator (External, e.g., `mujoco-orchestrator-v3.js`)
- **Role:** Acts as an intermediary between `BrowserRL` and the MuJoCo simulation environments (which typically run in Web Workers).
- **Interactions:**
  - `BrowserRL` calls `orchestrator.workers[0].postMessage({ type: 'reset', ... })` to reset an environment.
  - `BrowserRL` calls `orchestrator.getEnvironmentState(envId)` to get the current observation from a specific environment.
  - `BrowserRL` calls `orchestrator.setAction(envId, action)` to send the chosen action to an environment.

### d. MuJoCo Workers (External, e.g., `mujoco-rl-worker-v2.js`)
- **Role:** Run the actual MuJoCo physics simulation for one or more environments.
- **Interactions:** Receive messages from the orchestrator (e.g., to reset, step with an action) and post messages back with simulation results (new state, done flag).

## 3. Training Loop & Data Flow (per episode in `trainEpisode`)

1.  **Reset Environment:** `BrowserRL` tells the `orchestrator` to reset a specific environment (`envId`).
2.  **Interaction Loop (fixed number of steps or until `done`):
    a.  **Get State:** `BrowserRL` requests the current state from the `orchestrator` for `envId`.
    b.  **Observation Processing (`observationToVector`, `observationToState`):
        - `observationToVector(obs)`: Converts the raw observation object from MuJoCo into a flat 72-dimensional numerical vector suitable for the `TinyMLP`. This involves:
            - Taking `bodyPos` (or defaulting).
            - **Estimating/defaulting `bodyVel` to `[0,0,0]` (potential area for improvement).**
            - Extracting `jointAngles` (`qpos[7:28]`).
            - Extracting `jointVels` (`qvel[6:27]`).
            - Extracting `bodyQuaternion` (`qpos[3:7]`).
            - **Estimating `footContacts` based on `bodyPos[2]` (simplified, potential area for improvement).**
            - **Setting `time` to `0` (could be episode progress, potential area for improvement).**
            - Padding with zeros if the vector is shorter than 72.
        - `observationToState(obs)`: Converts the raw observation into a structured object format expected by the `rewardFn`.
    c.  **Select Action:** 
        - The `stateVec` is fed into `this.policy.forward()` to get an action vector.
        - Exploration noise is added to the action. The noise scale anneals (decreases) as `stepCount` increases.
        - Actions are clamped to the `[-1, 1]` range.
    d.  **Execute Action:** `BrowserRL` sends the `action` to the `orchestrator` for `envId`.
    e.  **Calculate Reward:**
        - If a custom `rewardFn` (JavaScript function) is provided, it's called with the structured `obsState` and `action` to get a `reward`.
        - If no `rewardFn` is provided, a fallback reward is used: `+1` if `bodyPos[2] > 0.8` (upright), `-1` otherwise.
        - **Error handling:** If `rewardFn` throws an error or returns `NaN`/`Infinity`, reward defaults to `0`.
    f.  **Store Transition:** The tuple `{ state: stateVec, action: action, reward: reward }` is stored in the `trajectory` array.
    g.  **Check Termination:** The loop continues until `state.done` is true or `stepCount` reaches `maxSteps`.
3.  **Policy Update (End of Episode - `updatePolicy(trajectory)`):
    a.  Calculate discounted returns (`G_t`) for each step, going backward from the end of the trajectory: `G_t = r_t + gamma * G_{t+1}`.
    b.  Normalize these returns across the episode.
    c.  Calculate an `updateSignal` as the average of the normalized returns.
    d.  Apply momentum: `this.momentum = 0.9 * this.momentum + 0.1 * updateSignal`.
    e.  Adapt learning rate: `adaptiveLR` is adjusted based on the mean raw episode reward (increased for very bad performance, decreased for good performance).
    f.  Call `this.policy.updateWeights(this.momentum, adaptiveLR)` to update the policy network's weights and biases using the randomized perturbation method.

## 4. Episode Management
- Episodes are managed by `trainEpisode` for a single run and `startTraining`/`trainMultipleEpisodes` for sequences.
- An episode terminates if the environment signals `done` (e.g., humanoid falls) or if `maxSteps` (default 300) is reached.
- `startTraining` runs episodes sequentially with a fixed delay between them, calling `trainEpisode` repeatedly.

## 5. Integration with LLM-Generated Rewards
- The `rewardFn` parameter in `trainEpisode` and `startTraining` is designed to accept a JavaScript function.
- This allows an LLM to generate the body of this function as a string, which can then be evaluated (e.g., using `new Function(...)` or similar, though this is not shown in `browser-rl.js` itself) and passed to the training methods.
- `BrowserRL` then uses this dynamically provided function to calculate rewards during an episode.

## 6. Potential Bugs / Areas for Improvement Noted During Review

- **Policy Update Mechanism:** The `TinyMLP.updateWeights` method is a form of randomized search, not gradient descent. While simple, it can be very inefficient for high-dimensional parameter spaces (like neural networks) and may struggle with complex tasks. Convergence is not guaranteed and can be very slow or get stuck in local optima easily.
- **State Vector Simplifications (`observationToVector`):
  - `bodyVel` is always `[0,0,0]`. True velocity information is crucial for many control tasks.
  - `footContacts` are crudely estimated and identical for both feet. Accurate contact data is important for locomotion.
  - `time` (normalized episode progress) is always `0`. This can be a useful input for the policy.
  - The order and specific components of the 72-dimensional vector should be carefully validated against the MuJoCo model's actual observation space for consistency and completeness.
- **`gradient` Parameter Name:** The `gradient` parameter in `TinyMLP.updateWeights` is misleading. It's a scalar performance signal (average normalized return with momentum), not a gradient vector.
- **Hardcoded Dimensions:** The MLP architecture `[72, 64, 32, 21]` is hardcoded, making `BrowserRL` specific to environments with these exact observation/action space sizes.
- **Exploration Noise:** While noise is added, the strategy is basic. More advanced exploration strategies could be beneficial.
- **Single Environment Reset:** `orchestrator.workers[0].postMessage` suggests it's always interacting with the first worker or a specific structure. If multiple workers/environments are managed by the orchestrator, `envId` should be used more consistently to target the correct one for reset.
- **Synchronous Wait for Reset:** `await new Promise(resolve => setTimeout(resolve, 100));` is a fixed delay. A more robust approach would be to wait for an acknowledgment message from the worker/orchestrator confirming the reset is complete.
- **Step Interval:** `setInterval` for the stepping loop in `trainEpisode` can lead to timing issues if state fetching or processing takes longer than the interval. A `requestAnimationFrame` loop or a promise-based sequential stepping might be more stable.

This overview should serve as a good starting point for discussions on improving the RL system.

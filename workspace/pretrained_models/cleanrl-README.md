---
tags:
- Humanoid-v4
- deep-reinforcement-learning
- reinforcement-learning
- custom-implementation
library_name: cleanrl
model-index:
- name: PPO
  results:
  - task:
      type: reinforcement-learning
      name: reinforcement-learning
    dataset:
      name: Humanoid-v4
      type: Humanoid-v4
    metrics:
    - type: mean_reward
      value: 378.92 +/- 50.08
      name: mean_reward
      verified: false
---

# (CleanRL) **PPO** Agent Playing **Humanoid-v4**

This is a trained model of a PPO agent playing Humanoid-v4.
The model was trained by using [CleanRL](https://github.com/vwxyzjn/cleanrl) and the most up-to-date training code can be
found [here](https://github.com/vwxyzjn/cleanrl/blob/master/cleanrl/ppo_continuous_action.py).

## Get Started

To use this model, please install the `cleanrl` package with the following command:

```
pip install "cleanrl[ppo_continuous_action]"
python -m cleanrl_utils.enjoy --exp-name ppo_continuous_action --env-id Humanoid-v4
```

Please refer to the [documentation](https://docs.cleanrl.dev/get-started/zoo/) for more detail.


## Command to reproduce the training

```bash
curl -OL https://huggingface.co/cleanrl/Humanoid-v4-ppo_continuous_action-seed1/raw/main/ppo_continuous_action.py
curl -OL https://huggingface.co/cleanrl/Humanoid-v4-ppo_continuous_action-seed1/raw/main/pyproject.toml
curl -OL https://huggingface.co/cleanrl/Humanoid-v4-ppo_continuous_action-seed1/raw/main/poetry.lock
poetry install --all-extras
python ppo_continuous_action.py --track --save-model --upload-model --hf-entity cleanrl --env-id Humanoid-v4 --seed 1
```

# Hyperparameters
```python
{'anneal_lr': True,
 'batch_size': 2048,
 'capture_video': False,
 'clip_coef': 0.2,
 'clip_vloss': True,
 'cuda': True,
 'ent_coef': 0.0,
 'env_id': 'Humanoid-v4',
 'exp_name': 'ppo_continuous_action',
 'gae_lambda': 0.95,
 'gamma': 0.99,
 'hf_entity': 'cleanrl',
 'learning_rate': 0.0003,
 'max_grad_norm': 0.5,
 'minibatch_size': 64,
 'norm_adv': True,
 'num_envs': 1,
 'num_minibatches': 32,
 'num_steps': 2048,
 'save_model': True,
 'seed': 1,
 'target_kl': None,
 'torch_deterministic': True,
 'total_timesteps': 1000000,
 'track': True,
 'update_epochs': 10,
 'upload_model': True,
 'vf_coef': 0.5,
 'wandb_entity': None,
 'wandb_project_name': 'cleanRL'}
```
    
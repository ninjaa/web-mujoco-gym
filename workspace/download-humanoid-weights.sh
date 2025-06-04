#!/bin/bash

# Download pre-trained Humanoid models from HuggingFace

echo "Downloading pre-trained PPO model for Humanoid-v4..."

mkdir -p pretrained_models
cd pretrained_models

# CleanRL PPO model
echo "1. Downloading CleanRL PPO model..."
curl -L "https://huggingface.co/cleanrl/Humanoid-v4-ppo_continuous_action-seed1/resolve/main/agent.pt" -o agent.pt
curl -L "https://huggingface.co/cleanrl/Humanoid-v4-ppo_continuous_action-seed1/resolve/main/ppo_continuous_action.cleanrl_model" -o ppo_continuous_action.cleanrl_model

# Stable Baselines3 SAC model
echo -e "\n2. Downloading SB3 SAC model..."
curl -L "https://huggingface.co/sb3/sac-Humanoid-v3/resolve/main/sac-Humanoid-v3.zip" -o sac-Humanoid-v3.zip
curl -L "https://huggingface.co/sb3/sac-Humanoid-v3/resolve/main/config.yml" -o sac-config.yml

# Get model cards for reference
echo -e "\n3. Downloading model documentation..."
curl -L "https://huggingface.co/cleanrl/Humanoid-v4-ppo_continuous_action-seed1/raw/main/README.md" -o cleanrl-README.md

echo -e "\n✓ Downloads complete! Files saved in pretrained_models/"
echo "  - agent.pt: CleanRL PPO weights (10M training steps)"
echo "  - sac-Humanoid-v3.zip: SB3 SAC weights"

cd ..

# Create a simple viewer to check what's in the PyTorch file
echo -e "\nTo use these models, you'll need to:"
echo "1. Convert PyTorch weights to TensorFlow.js format"
echo "2. Match the network architecture (likely 256-256 hidden layers)"
echo "3. Handle the state dimension difference (376 vs 83)"

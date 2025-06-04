#!/usr/bin/env python3
"""
Download and convert pre-trained Humanoid PPO model from HuggingFace
"""

import os
import json
import requests
import torch
import numpy as np

def download_cleanrl_model():
    """Download the CleanRL PPO model for Humanoid-v4"""
    
    print("Downloading pre-trained PPO model for Humanoid-v4...")
    
    # Model files from HuggingFace
    base_url = "https://huggingface.co/cleanrl/Humanoid-v4-ppo_continuous_action-seed1/resolve/main/"
    files_to_download = {
        "agent.pt": "agent.pt",
        "ppo_continuous_action.py": "ppo_continuous_action.py",
        "ppo_continuous_action.cleanrl_model": "ppo_continuous_action.cleanrl_model"
    }
    
    os.makedirs("pretrained_models", exist_ok=True)
    
    for filename, save_as in files_to_download.items():
        url = base_url + filename
        save_path = os.path.join("pretrained_models", save_as)
        
        print(f"Downloading {filename}...")
        response = requests.get(url)
        
        if response.status_code == 200:
            with open(save_path, 'wb') as f:
                f.write(response.content)
            print(f"✓ Saved to {save_path}")
        else:
            print(f"✗ Failed to download {filename}")
    
    return "pretrained_models/agent.pt"

def convert_to_tfjs_format(model_path):
    """Convert PyTorch model to TensorFlow.js compatible format"""
    
    print("\nConverting to TensorFlow.js format...")
    
    # Load the PyTorch model
    checkpoint = torch.load(model_path, map_location='cpu')
    
    # Extract state dict (the actual weights)
    if isinstance(checkpoint, dict) and 'model_state_dict' in checkpoint:
        state_dict = checkpoint['model_state_dict']
    else:
        # Might be the model directly
        state_dict = checkpoint.state_dict() if hasattr(checkpoint, 'state_dict') else checkpoint
    
    # Convert to JSON-serializable format
    weights_json = {}
    
    # Common layer names in PPO networks
    layer_mapping = {
        # Actor network (policy)
        'actor.0.weight': 'actor_fc1_weight',
        'actor.0.bias': 'actor_fc1_bias',
        'actor.2.weight': 'actor_fc2_weight', 
        'actor.2.bias': 'actor_fc2_bias',
        'actor.4.weight': 'actor_fc3_weight',
        'actor.4.bias': 'actor_fc3_bias',
        'actor_mean.weight': 'actor_mean_weight',
        'actor_mean.bias': 'actor_mean_bias',
        'actor_logstd': 'actor_logstd',
        
        # Critic network (value function)
        'critic.0.weight': 'critic_fc1_weight',
        'critic.0.bias': 'critic_fc1_bias',
        'critic.2.weight': 'critic_fc2_weight',
        'critic.2.bias': 'critic_fc2_bias', 
        'critic.4.weight': 'critic_fc3_weight',
        'critic.4.bias': 'critic_fc3_bias',
    }
    
    # Convert each tensor to list
    for key, tensor in state_dict.items():
        if isinstance(tensor, torch.Tensor):
            # Use mapped name if available, otherwise use original
            save_key = layer_mapping.get(key, key)
            weights_json[save_key] = tensor.detach().numpy().tolist()
            print(f"  {key} -> {save_key}: shape {tensor.shape}")
    
    # Save as JSON
    output_path = "pretrained_models/humanoid_ppo_weights.json"
    with open(output_path, 'w') as f:
        json.dump(weights_json, f)
    
    print(f"\n✓ Weights saved to {output_path}")
    
    # Also save metadata
    metadata = {
        "model": "PPO",
        "environment": "Humanoid-v4", 
        "state_dim": 376,  # Humanoid-v4 observation space
        "action_dim": 17,
        "architecture": {
            "actor_hidden_dims": [256, 256],
            "critic_hidden_dims": [256, 256],
            "activation": "tanh"
        },
        "source": "CleanRL",
        "training_steps": 10000000  # 10M steps
    }
    
    with open("pretrained_models/model_metadata.json", 'w') as f:
        json.dump(metadata, f, indent=2)

def download_stable_baselines_model():
    """Alternative: Download from SB3 Zoo"""
    
    print("\nAlternative: Downloading Stable Baselines3 model...")
    
    # For SAC Humanoid-v3
    sb3_url = "https://huggingface.co/sb3/sac-Humanoid-v3/resolve/main/sac-Humanoid-v3.zip"
    
    response = requests.get(sb3_url)
    if response.status_code == 200:
        with open("pretrained_models/sac-Humanoid-v3.zip", 'wb') as f:
            f.write(response.content)
        print("✓ Downloaded SB3 model")
        
        # Would need to unzip and convert from SB3 format
        # This is more complex as SB3 uses a different structure

if __name__ == "__main__":
    # Download CleanRL model
    model_path = download_cleanrl_model()
    
    try:
        # Try to convert if PyTorch is available
        convert_to_tfjs_format(model_path)
    except Exception as e:
        print(f"\nNote: Conversion requires PyTorch. Error: {e}")
        print("You can still use the downloaded model files with appropriate loader.")
    
    # Also try SB3 model
    download_stable_baselines_model()
    
    print("\n✓ Done! Check the 'pretrained_models' folder for:")
    print("  - agent.pt (PyTorch model)")
    print("  - humanoid_ppo_weights.json (converted weights)")
    print("  - sac-Humanoid-v3.zip (alternative SB3 model)")

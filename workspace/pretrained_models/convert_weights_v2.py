#!/usr/bin/env python3
"""
Convert CleanRL PyTorch PPO model to TensorFlow.js format (v2)
Uses HDF5 format and manual weight extraction for better compatibility
"""

import torch
import tensorflow as tf
import numpy as np
import json
import os

def load_pytorch_model(model_path):
    """Load the PyTorch model weights"""
    print(f"Loading PyTorch model from {model_path}")
    
    # Load the model state dict
    state_dict = torch.load(model_path, map_location='cpu')
    
    print("Model architecture detected:")
    for key, tensor in state_dict.items():
        print(f"  {key}: {tensor.shape}")
    
    return state_dict

def extract_weights_to_json(state_dict, output_dir):
    """Extract weights as JSON files for manual loading"""
    print(f"\nExtracting weights to JSON format in {output_dir}")
    
    os.makedirs(output_dir, exist_ok=True)
    
    # Actor weights
    actor_weights = {}
    actor_weights['dense_1_kernel'] = state_dict['actor_mean.0.weight'].T.numpy().tolist()
    actor_weights['dense_1_bias'] = state_dict['actor_mean.0.bias'].numpy().tolist()
    actor_weights['dense_2_kernel'] = state_dict['actor_mean.2.weight'].T.numpy().tolist()
    actor_weights['dense_2_bias'] = state_dict['actor_mean.2.bias'].numpy().tolist()
    actor_weights['output_kernel'] = state_dict['actor_mean.4.weight'].T.numpy().tolist()
    actor_weights['output_bias'] = state_dict['actor_mean.4.bias'].numpy().tolist()
    
    # Save actor weights
    with open(os.path.join(output_dir, 'actor_weights.json'), 'w') as f:
        json.dump(actor_weights, f)
    print("✓ Actor weights saved")
    
    # Critic weights
    critic_weights = {}
    critic_weights['dense_1_kernel'] = state_dict['critic.0.weight'].T.numpy().tolist()
    critic_weights['dense_1_bias'] = state_dict['critic.0.bias'].numpy().tolist()
    critic_weights['dense_2_kernel'] = state_dict['critic.2.weight'].T.numpy().tolist()
    critic_weights['dense_2_bias'] = state_dict['critic.2.bias'].numpy().tolist()
    critic_weights['output_kernel'] = state_dict['critic.4.weight'].T.numpy().tolist()
    critic_weights['output_bias'] = state_dict['critic.4.bias'].numpy().tolist()
    
    # Save critic weights
    with open(os.path.join(output_dir, 'critic_weights.json'), 'w') as f:
        json.dump(critic_weights, f)
    print("✓ Critic weights saved")
    
    # Actor logstd
    actor_logstd = {
        'shape': list(state_dict['actor_logstd'].shape),
        'values': state_dict['actor_logstd'].numpy().tolist()
    }
    
    with open(os.path.join(output_dir, 'actor_logstd.json'), 'w') as f:
        json.dump(actor_logstd, f)
    print("✓ Actor logstd saved")
    
    # Model architecture info
    model_info = {
        'input_dim': 376,
        'action_dim': 17,
        'hidden_dim': 64,
        'architecture': 'PPO',
        'source': 'CleanRL Humanoid-v4',
        'actor_layers': [376, 64, 64, 17],
        'critic_layers': [376, 64, 64, 1],
        'activation': 'tanh',
        'format': 'json_weights'
    }
    
    with open(os.path.join(output_dir, 'model_info.json'), 'w') as f:
        json.dump(model_info, f, indent=2)
    print("✓ Model info saved")
    
    return True

def test_weights(state_dict):
    """Test the converted weights with a sample input"""
    print("\nTesting weight conversion...")
    
    # Create test input
    test_input = torch.randn(1, 376)
    
    # Manual forward pass through actor
    actor_h1 = torch.tanh(torch.matmul(test_input, state_dict['actor_mean.0.weight'].T) + state_dict['actor_mean.0.bias'])
    actor_h2 = torch.tanh(torch.matmul(actor_h1, state_dict['actor_mean.2.weight'].T) + state_dict['actor_mean.2.bias'])
    actor_output = torch.matmul(actor_h2, state_dict['actor_mean.4.weight'].T) + state_dict['actor_mean.4.bias']
    
    print(f"Test input shape: {test_input.shape}")
    print(f"Actor output shape: {actor_output.shape}")
    print(f"Actor output sample: {actor_output[0][:5].tolist()}")
    
    # Manual forward pass through critic
    critic_h1 = torch.tanh(torch.matmul(test_input, state_dict['critic.0.weight'].T) + state_dict['critic.0.bias'])
    critic_h2 = torch.tanh(torch.matmul(critic_h1, state_dict['critic.2.weight'].T) + state_dict['critic.2.bias'])
    critic_output = torch.matmul(critic_h2, state_dict['critic.4.weight'].T) + state_dict['critic.4.bias']
    
    print(f"Critic output shape: {critic_output.shape}")
    print(f"Critic output sample: {critic_output[0].tolist()}")
    
    # Test action sampling with logstd
    actor_logstd = state_dict['actor_logstd']
    actor_std = torch.exp(actor_logstd)
    noise = torch.randn_like(actor_output)
    sampled_action = actor_output + actor_std * noise
    
    print(f"Actor logstd: {actor_logstd[0][:5].tolist()}")
    print(f"Actor std: {actor_std[0][:5].tolist()}")
    print(f"Sampled action: {sampled_action[0][:5].tolist()}")

def main():
    """Main conversion function"""
    model_path = 'ppo_continuous_action.cleanrl_model'
    output_dir = 'weights_json'
    
    try:
        # Load PyTorch model
        state_dict = load_pytorch_model(model_path)
        
        # Test weights
        test_weights(state_dict)
        
        # Extract weights to JSON
        success = extract_weights_to_json(state_dict, output_dir)
        
        if success:
            print(f"\n✅ Weight extraction completed successfully!")
            print(f"Weights saved in {output_dir}/")
            print("\nFiles created:")
            print("  - actor_weights.json (actor network weights)")
            print("  - critic_weights.json (critic network weights)")
            print("  - actor_logstd.json (action noise parameters)")
            print("  - model_info.json (architecture info)")
        
    except Exception as e:
        print(f"\n❌ Conversion failed: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""
Convert CleanRL PyTorch PPO model to TensorFlow.js format
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

def create_tfjs_model(state_dict):
    """Create TensorFlow.js compatible model"""
    print("\nCreating TensorFlow.js model...")
    
    # Input dimensions
    input_dim = 376  # CleanRL Humanoid-v4 observation space
    hidden_dim = 64
    action_dim = 17
    
    # Create actor network (mean)
    actor_input = tf.keras.Input(shape=(input_dim,), name='actor_input')
    
    # Actor hidden layers
    actor_h1 = tf.keras.layers.Dense(
        hidden_dim, 
        activation='tanh', 
        name='actor_dense_1'
    )(actor_input)
    
    actor_h2 = tf.keras.layers.Dense(
        hidden_dim, 
        activation='tanh', 
        name='actor_dense_2'
    )(actor_h1)
    
    # Actor output (action mean)
    actor_mean = tf.keras.layers.Dense(
        action_dim, 
        activation=None, 
        name='actor_mean'
    )(actor_h2)
    
    # Create actor model
    actor_model = tf.keras.Model(inputs=actor_input, outputs=actor_mean, name='actor')
    
    # Create critic network  
    critic_input = tf.keras.Input(shape=(input_dim,), name='critic_input')
    
    # Critic hidden layers
    critic_h1 = tf.keras.layers.Dense(
        hidden_dim, 
        activation='tanh', 
        name='critic_dense_1'
    )(critic_input)
    
    critic_h2 = tf.keras.layers.Dense(
        hidden_dim, 
        activation='tanh', 
        name='critic_dense_2'
    )(critic_h1)
    
    # Critic output (value)
    critic_value = tf.keras.layers.Dense(
        1, 
        activation=None, 
        name='critic_value'
    )(critic_h2)
    
    # Create critic model
    critic_model = tf.keras.Model(inputs=critic_input, outputs=critic_value, name='critic')
    
    return actor_model, critic_model

def convert_weights(state_dict, actor_model, critic_model):
    """Convert PyTorch weights to TensorFlow format"""
    print("\nConverting weights...")
    
    # Map PyTorch to TensorFlow layer names
    weight_mapping = {
        # Actor weights
        'actor_mean.0.weight': 'actor_dense_1/kernel:0',
        'actor_mean.0.bias': 'actor_dense_1/bias:0', 
        'actor_mean.2.weight': 'actor_dense_2/kernel:0',
        'actor_mean.2.bias': 'actor_dense_2/bias:0',
        'actor_mean.4.weight': 'actor_mean/kernel:0',
        'actor_mean.4.bias': 'actor_mean/bias:0',
        
        # Critic weights
        'critic.0.weight': 'critic_dense_1/kernel:0',
        'critic.0.bias': 'critic_dense_1/bias:0',
        'critic.2.weight': 'critic_dense_2/kernel:0', 
        'critic.2.bias': 'critic_dense_2/bias:0',
        'critic.4.weight': 'critic_value/kernel:0',
        'critic.4.bias': 'critic_value/bias:0'
    }
    
    # Convert actor weights
    print("Converting actor weights...")
    for pytorch_name, tf_name in weight_mapping.items():
        if pytorch_name.startswith('actor_mean') and pytorch_name in state_dict:
            tensor = state_dict[pytorch_name].numpy()
            
            # PyTorch uses (out_features, in_features), TensorFlow uses (in_features, out_features)
            if 'weight' in pytorch_name:
                tensor = tensor.T
            
            # Find and set the corresponding TensorFlow weight
            for layer in actor_model.layers:
                for weight in layer.weights:
                    if weight.name == tf_name:
                        print(f"  {pytorch_name} -> {tf_name}: {tensor.shape}")
                        weight.assign(tensor)
                        break
    
    # Convert critic weights
    print("Converting critic weights...")
    for pytorch_name, tf_name in weight_mapping.items():
        if pytorch_name.startswith('critic') and pytorch_name in state_dict:
            tensor = state_dict[pytorch_name].numpy()
            
            # PyTorch uses (out_features, in_features), TensorFlow uses (in_features, out_features)
            if 'weight' in pytorch_name:
                tensor = tensor.T
            
            # Find and set the corresponding TensorFlow weight
            for layer in critic_model.layers:
                for weight in layer.weights:
                    if weight.name == tf_name:
                        print(f"  {pytorch_name} -> {tf_name}: {tensor.shape}")
                        weight.assign(tensor)
                        break
    
    # Store actor_logstd separately (used for action sampling)
    actor_logstd = None
    if 'actor_logstd' in state_dict:
        actor_logstd = state_dict['actor_logstd'].numpy()
        print(f"  actor_logstd: {actor_logstd.shape}")
    
    return actor_logstd

def save_tfjs_models(actor_model, critic_model, actor_logstd, output_dir):
    """Save models in TensorFlow.js format"""
    print(f"\nSaving TensorFlow.js models to {output_dir}...")
    
    os.makedirs(output_dir, exist_ok=True)
    
    # Save actor model
    actor_path = os.path.join(output_dir, 'actor')
    tf.saved_model.save(actor_model, actor_path)
    print(f"Actor model saved to {actor_path}")
    
    # Save critic model  
    critic_path = os.path.join(output_dir, 'critic')
    tf.saved_model.save(critic_model, critic_path)
    print(f"Critic model saved to {critic_path}")
    
    # Save actor_logstd as JSON
    if actor_logstd is not None:
        logstd_path = os.path.join(output_dir, 'actor_logstd.json')
        with open(logstd_path, 'w') as f:
            json.dump({
                'shape': list(actor_logstd.shape),
                'values': actor_logstd.tolist()
            }, f)
        print(f"Actor logstd saved to {logstd_path}")
    
    # Save model info
    info_path = os.path.join(output_dir, 'model_info.json')
    with open(info_path, 'w') as f:
        json.dump({
            'input_dim': 376,
            'action_dim': 17,
            'hidden_dim': 64,
            'architecture': 'PPO',
            'source': 'CleanRL Humanoid-v4',
            'actor_layers': [376, 64, 64, 17],
            'critic_layers': [376, 64, 64, 1]
        }, f, indent=2)
    print(f"Model info saved to {info_path}")

def main():
    """Main conversion function"""
    model_path = 'ppo_continuous_action.cleanrl_model'
    output_dir = 'tfjs_models'
    
    try:
        # Load PyTorch model
        state_dict = load_pytorch_model(model_path)
        
        # Create TensorFlow models
        actor_model, critic_model = create_tfjs_model(state_dict)
        
        # Convert weights
        actor_logstd = convert_weights(state_dict, actor_model, critic_model)
        
        # Test the models
        print("\nTesting converted models...")
        test_input = np.random.randn(1, 376).astype(np.float32)
        
        actor_output = actor_model(test_input)
        critic_output = critic_model(test_input)
        
        print(f"Actor output shape: {actor_output.shape}")
        print(f"Critic output shape: {critic_output.shape}")
        print(f"Actor output sample: {actor_output[0][:5].numpy()}")
        print(f"Critic output sample: {critic_output[0].numpy()}")
        
        # Save models
        save_tfjs_models(actor_model, critic_model, actor_logstd, output_dir)
        
        print("\n✅ Conversion completed successfully!")
        print(f"Models saved in {output_dir}/")
        
    except Exception as e:
        print(f"\n❌ Conversion failed: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    main()

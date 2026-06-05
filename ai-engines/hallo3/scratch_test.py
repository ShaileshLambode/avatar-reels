import os
import sys

print("Current working directory:", os.getcwd())
model_dir = "./pretrained_models/t5-v1_1-xxl"
parent_dir = os.path.dirname(model_dir)
cond_path = os.path.join(parent_dir, "cond_embed.pt")
uncond_path = os.path.join(parent_dir, "uncond_embed.pt")

print("model_dir:", model_dir)
print("parent_dir:", parent_dir)
print("cond_path:", cond_path, "Exists:", os.path.exists(cond_path))
print("uncond_path:", uncond_path, "Exists:", os.path.exists(uncond_path))

# Check absolute paths
print("Absolute cond_path:", os.path.abspath(cond_path))
print("Absolute uncond_path:", os.path.abspath(uncond_path))

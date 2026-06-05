import os
import sys

# Add hallo3 folder to sys.path so we can import sgm
sys.path.append(os.path.abspath("C:/Users/1/AiMaven/adwhiz/avatar-reels/ai-engines/hallo3/hallo3/hallo3"))

import torch
from sgm.modules.encoders.modules import FrozenT5Embedder

print("Instantiating FrozenT5Embedder...")
embedder = FrozenT5Embedder(model_dir="./pretrained_models/t5-v1_1-xxl")
print("Bypass flag:", getattr(embedder, "use_bypass", None))

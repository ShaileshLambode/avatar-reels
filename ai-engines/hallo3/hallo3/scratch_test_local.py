import os
import sys

# Add hallo3 folder to sys.path
sys.path.append(os.path.abspath("hallo3"))

import torch
from hallo3.sgm.modules.encoders.modules import FrozenT5Embedder

print("Instantiating FrozenT5Embedder in", os.getcwd())
embedder = FrozenT5Embedder(model_dir="./pretrained_models/t5-v1_1-xxl")
print("Bypass flag:", getattr(embedder, "use_bypass", None))

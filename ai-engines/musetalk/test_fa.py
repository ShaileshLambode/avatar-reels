import sys
import os
import torch
import numpy as np

# Add paths to sys.path so we can import face_detection
sys.path.append(os.path.join(os.path.dirname(__file__), "musetalk", "utils"))

from face_detection import FaceAlignment, LandmarksType

device = "cuda" if torch.cuda.is_available() else "cpu"
print(f"Initializing FaceAlignment on device: {device}...")
fa = FaceAlignment(LandmarksType._2D, flip_input=False, device=device)
print("FaceAlignment initialized.")

img = np.zeros((384, 288, 3), dtype=np.uint8)
print("Running face detection on a dummy image...")
res = fa.get_detections_for_batch(np.array([img]))
print("Face detection finished. Result:", res)

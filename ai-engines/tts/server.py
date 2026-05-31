import os
import tempfile
import logging
from fastapi import FastAPI, Form, HTTPException
from fastapi.responses import FileResponse

# Monkeypatch Hugging Face transformers to maintain compatibility with Coqui TTS imports
import torch
import transformers.pytorch_utils
if not hasattr(transformers.pytorch_utils, "isin_mps_friendly"):
    transformers.pytorch_utils.isin_mps_friendly = torch.isin

from TTS.api import TTS


# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("TTS_Server")

app = FastAPI(title="XTTS v2 Voice Generation Microservice")

# Setup directories
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
VOICES_DIR = os.path.join(BASE_DIR, "voices")
os.makedirs(VOICES_DIR, exist_ok=True)

# Global model container
tts_model = None

@app.on_event("startup")
def load_model():
    global tts_model
    try:
        logger.info("Initializing XTTS v2 model on CPU...")
        # Load XTTS v2 model directly on CPU
        tts_model = TTS("tts_models/multilingual/multi-dataset/xtts_v2").to("cpu")
        logger.info("XTTS v2 model loaded successfully!")
    except Exception as e:
        logger.error(f"Error loading XTTS v2 model: {str(e)}")
        # We don't crash the server startup so that GET /health can report the failure clearly
        tts_model = None

@app.get("/health")
def health_check():
    if tts_model is None:
        return {
            "status": "error",
            "model_loaded": False,
            "error": "Model failed to load. Check server logs."
        }
    return {
        "status": "ok",
        "model_loaded": True,
        "model_name": "xtts_v2",
        "available_speakers_count": len(tts_model.speakers) if tts_model.speakers else 0
    }

@app.get("/voices")
def get_voices():
    if tts_model is None:
        raise HTTPException(status_code=503, detail="TTS Model is not loaded")
    
    # Get internal presets
    built_in = list(tts_model.speakers) if tts_model.speakers else []
    
    # Get custom wav presets
    custom = []
    for file in os.listdir(VOICES_DIR):
        if file.endswith(".wav"):
            custom.append(os.path.splitext(file)[0])
            
    return {
        "built_in": built_in,
        "custom": custom,
        "recommended_default": "Claribel Dervla"
    }

@app.post("/synthesize")
async def synthesize(
    text: str = Form(...),
    speaker_id: str = Form("Claribel Dervla"),
    language: str = Form("en")
):
    if tts_model is None:
        raise HTTPException(status_code=503, detail="TTS Model is not loaded")
        
    if not text.strip():
        raise HTTPException(status_code=400, detail="Text cannot be empty")
        
    try:
        # Create a unique temp file path for the output WAV
        fd, temp_file_path = tempfile.mkstemp(suffix=".wav")
        os.close(fd) # Close file descriptor so TTS can write to it
        
        logger.info(f"Synthesizing text: '{text[:30]}...' using speaker: '{speaker_id}' in language: '{language}'")
        
        # Determine speaker selection strategy
        if speaker_id in tts_model.speakers:
            # Use built-in speaker
            tts_model.tts_to_file(
                text=text,
                speaker=speaker_id,
                language=language,
                file_path=temp_file_path
            )
        else:
            # Check if there is a custom wav file
            custom_wav = os.path.join(VOICES_DIR, f"{speaker_id}.wav")
            if os.path.exists(custom_wav):
                tts_model.tts_to_file(
                    text=text,
                    speaker_wav=custom_wav,
                    language=language,
                    file_path=temp_file_path
                )
            else:
                # Fallback
                default_speaker = "Claribel Dervla" if "Claribel Dervla" in tts_model.speakers else tts_model.speakers[0]
                logger.warning(f"Speaker '{speaker_id}' not found. Falling back to built-in '{default_speaker}'")
                tts_model.tts_to_file(
                    text=text,
                    speaker=default_speaker,
                    language=language,
                    file_path=temp_file_path
                )
                
        logger.info(f"Successfully synthesized audio to {temp_file_path}")
        return FileResponse(
            temp_file_path,
            media_type="audio/wav",
            filename=f"synthesized_{speaker_id}.wav"
        )
        
    except Exception as e:
        logger.error(f"Error during synthesis: {str(e)}")
        raise HTTPException(status_code=500, detail=f"TTS synthesis failed: {str(e)}")

# 🎬 AdWhiz AI Spokesperson Reels Pipeline

An end-to-end AI-powered production pipeline that generates professional spokesperson marketing reels with animated talking-head avatars, AI voiceover, dynamic captions, and background music — all orchestrated through a multi-stage job queue.

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                              Express Backend (Port 4001)                                │
│                   REST API  ·  BullMQ Queue  ·  MongoDB & Redis                         │
├────────────┬────────────┬──────────────┬─────────────────────────┬────────────┬─────────┤
│  Stage 1   │  Stage 2   │   Stage 3    │         Stage 4         │  Stage 5   │ Stage 6 │
│   Script   │   Voice    │    Avatar    │    LipSync & Enhance    │  Compose   │Render & │
│  (OpenAI)  │   (XTTS)   │(LivePortrait)│ (MuseTalk & CodeFormer) │  (FFmpeg)  │Captions │
│            │  :5100     │  :5200 GPU   │    :5300  &  :5500 GPU  │            │(Remotion│
└────────────┴────────────┴──────────────┴─────────────────────────┴────────────┴─────────┘
```

### Pipeline Stages
1. **Script Generation** — GPT-4o-mini generates scene-by-scene dialogue
2. **Voice Synthesis** — XTTS v2 produces high-fidelity speech audio (Port 5100)
3. **Avatar Expression Animation** — LivePortrait local microservice animates source spokesperson face expressions (Port 5200 GPU)
4. **LipSync & Face Enhancement** — MuseTalk local microservice generates precise audio-driven lip sync (Port 5300 GPU) and CodeFormer local microservice enhances the facial region (Port 5500 GPU)
5. **Video Composition** — FFmpeg composites the enhanced talking head over the background with background music
6. **Caption Overlay & Export** — Whisper.cpp transcribes the audio, and Remotion renders styled word-level animated captions to export the final vertical MP4 reel

## 🛠️ Tech Stack

| Layer | Technology |
|-------|-----------|
| **Backend API** | Node.js, Express, Mongoose |
| **Job Queue** | BullMQ + Redis |
| **Database** | MongoDB |
| **AI Script** | OpenAI GPT-4o-mini |
| **Voice TTS** | Coqui XTTS v2 (FastAPI microservice, Port 5100) |
| **Avatar Engine** | LivePortrait with PyTorch CUDA (FastAPI microservice, Port 5200) |
| **LipSync Engine** | MuseTalk with PyTorch CUDA (FastAPI microservice, Port 5300) |
| **Face Enhancer** | CodeFormer with PyTorch CUDA (FastAPI microservice, Port 5500) |
| **Video Processing** | FFmpeg, fluent-ffmpeg |
| **Caption Rendering** | Remotion + Whisper.cpp |
| **GPU Acceleration** | NVIDIA CUDA (GeForce RTX 2050+, minimum 4GB VRAM) |

## 📋 Prerequisites

- **NVIDIA GPU** with CUDA drivers
- **Python 3.10** (avoid 3.11+ for PyTorch compatibility)
- **Node.js v18+**
- **FFmpeg** in PATH or at `C:\ffmpeg\bin\ffmpeg.exe`
- **Git**
- **MongoDB** (local or Atlas)
- **Redis** (Docker or native)

## 🚀 Quick Start

See **[SETUP.md](SETUP.md)** for complete step-by-step setup and deployment instructions.

## 📁 Project Structure

```
avatar-reels/
├── ai-engines/
│   ├── avatar/          # LivePortrait GPU expression engine (Port 5200)
│   │   ├── server.py    # FastAPI wrapper
│   │   └── start-avatar.ps1  # Auto-setup: venv, CUDA PyTorch, model weights
│   ├── musetalk/        # MuseTalk GPU lip-sync engine (Port 5300)
│   │   ├── server.py    # FastAPI wrapper
│   │   └── start-musetalk.ps1 # Auto-setup: venv, dependencies, model weights (FP16 optimized)
│   ├── codeformer/      # CodeFormer GPU face enhancement engine (Port 5500)
│   │   ├── server.py    # FastAPI wrapper
│   │   └── start-codeformer.ps1 # Auto-setup: venv, basicsr build, model weights
│   └── tts/             # XTTS v2 voice synthesis engine (Port 5100)
│       ├── server.py    # FastAPI wrapper
│       └── start-tts.ps1     # Auto-setup: venv, dependencies
├── backend/             # Express.js API + BullMQ pipeline (Port 4001)
│   ├── src/
│   ├── .env.example     # Template for environment config
│   └── package.json
├── remotion/            # Remotion caption rendering + Whisper.cpp
│   ├── render.mjs       # Headless render script
│   └── src/             # React composition components
├── assets/              # Static assets (avatars, music, fonts, templates)
├── storage/             # Runtime storage (temp, cache, exports)
├── scripts/             # Utility scripts
├── SETUP.md             # Full setup & deployment guide
└── README.md
```

## 📄 License

Private — All rights reserved.

# 🎬 AdWhiz AI Spokesperson Reels Pipeline

An end-to-end AI-powered production pipeline that generates professional spokesperson marketing reels with animated talking-head avatars, AI voiceover, dynamic captions, and background music — all orchestrated through a multi-stage job queue.

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Express Backend (Port 4001)               │
│         REST API  ·  BullMQ Queue  ·  MongoDB                │
├──────────┬──────────┬──────────────┬────────────────────────┤
│ Stage 1  │ Stage 2  │   Stage 3    │  Stage 4    │ Stage 5-6│
│ Script   │ Voice    │   Avatar     │  Compose    │ Remotion │
│ (OpenAI) │ (XTTS)   │ (LivePortrait)│ (FFmpeg)   │ Captions │
│          │ :5100    │   :5200 GPU  │             │ Whisper  │
└──────────┴──────────┴──────────────┴─────────────┴──────────┘
```

### Pipeline Stages
1. **Script Generation** — GPT-4o-mini generates scene-by-scene dialogue
2. **Voice Synthesis** — XTTS v2 produces high-fidelity speech audio
3. **Avatar Animation** — LivePortrait animates a spokesperson face driven by audio (GPU-accelerated)
4. **Video Composition** — FFmpeg composites avatar over background with music
5. **Caption Overlay** — Remotion renders word-level animated captions via Whisper.cpp transcription
6. **Final Export** — Polished vertical reel ready for social media

## 🛠️ Tech Stack

| Layer | Technology |
|-------|-----------|
| **Backend API** | Node.js, Express, Mongoose |
| **Job Queue** | BullMQ + Redis |
| **Database** | MongoDB |
| **AI Script** | OpenAI GPT-4o-mini |
| **Voice TTS** | Coqui XTTS v2 (FastAPI microservice) |
| **Avatar Engine** | LivePortrait with PyTorch CUDA (FastAPI microservice) |
| **Video Processing** | FFmpeg, fluent-ffmpeg |
| **Caption Rendering** | Remotion + Whisper.cpp |
| **GPU Acceleration** | NVIDIA CUDA (RTX 2050+) |

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
│   ├── avatar/          # LivePortrait GPU spokesperson engine (Port 5200)
│   │   ├── server.py    # FastAPI wrapper
│   │   └── start-avatar.ps1  # Auto-setup: venv, CUDA PyTorch, model weights
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

"""
YarnGPT text-to-speech microservice for DanfoAI.

YarnGPT (https://github.com/saheedniyi02/yarngpt) is a Python-only,
model-heavy TTS system that produces Nigerian-accented speech in English,
Yoruba, Igbo, Hausa and Pidgin. It can't run inside the Next.js process, so it
lives here as a small FastAPI service. The Next.js /api/speak route proxies to
it (see app/api/speak/route.ts), configured via YARNGPT_API_URL.

Run:
    pip install -r requirements.txt
    # download the WavTokenizer files (see README.md), then:
    uvicorn main:app --host 0.0.0.0 --port 8000

The model loads lazily on first request so the server starts fast.
"""

import io
import os
import threading

import torch
import torchaudio
from fastapi import FastAPI, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel
from transformers import AutoModelForCausalLM

from yarngpt.audiotokenizer import AudioTokenizerV2

# --- Configuration (override via environment) -------------------------------
HF_MODEL = os.getenv("YARNGPT_MODEL", "saheedniyi/YarnGPT2")
WAV_CONFIG = os.getenv(
    "WAV_TOKENIZER_CONFIG",
    "models/wavtokenizer_mediumdata_frame75_3s_nq1_code4096_dim512_kmeans200_attn.yaml",
)
WAV_MODEL = os.getenv(
    "WAV_TOKENIZER_MODEL",
    "models/wavtokenizer_large_speech_320_24k.ckpt",
)
SAMPLE_RATE = 24000

SUPPORTED_LANGUAGES = {"english", "yoruba", "igbo", "hausa", "pidgin"}

app = FastAPI(title="DanfoAI YarnGPT TTS")

# Loaded once, lazily, guarded by a lock (model.generate is not thread-safe).
_tokenizer: "AudioTokenizerV2 | None" = None
_model = None
_load_lock = threading.Lock()
_infer_lock = threading.Lock()


def _ensure_loaded():
    global _tokenizer, _model
    if _model is not None:
        return
    with _load_lock:
        if _model is not None:
            return
        for path in (WAV_CONFIG, WAV_MODEL):
            if not os.path.exists(path):
                raise RuntimeError(
                    f"Missing WavTokenizer file: {path}. See README.md for downloads."
                )
        tokenizer = AudioTokenizerV2(HF_MODEL, WAV_MODEL, WAV_CONFIG)
        model = AutoModelForCausalLM.from_pretrained(
            HF_MODEL, torch_dtype="auto"
        ).to(tokenizer.device)
        _tokenizer, _model = tokenizer, model


class TTSRequest(BaseModel):
    text: str
    language: str = "english"
    voice: str = "idera"


@app.get("/health")
def health():
    return {"status": "ok", "model": HF_MODEL, "loaded": _model is not None}


@app.post("/tts")
def tts(req: TTSRequest):
    text = (req.text or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="text is required")

    language = req.language.lower().strip()
    if language not in SUPPORTED_LANGUAGES:
        language = "english"

    try:
        _ensure_loaded()
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))

    try:
        with _infer_lock:
            prompt = _tokenizer.create_prompt(
                text, lang=language, speaker_name=req.voice
            )
            input_ids = _tokenizer.tokenize_prompt(prompt)
            output = _model.generate(
                input_ids=input_ids,
                temperature=0.1,
                repetition_penalty=1.1,
                max_length=4000,
            )
            codes = _tokenizer.get_codes(output)
            audio = _tokenizer.get_audio(codes)

        # torchaudio.save needs a 2D [channels, frames] tensor on CPU.
        audio = audio.detach().cpu()
        if audio.dim() == 1:
            audio = audio.unsqueeze(0)

        buf = io.BytesIO()
        torchaudio.save(buf, audio, SAMPLE_RATE, format="wav")
        buf.seek(0)
        return Response(content=buf.read(), media_type="audio/wav")
    except Exception as e:  # noqa: BLE001 - surface a clean error to the client
        raise HTTPException(status_code=500, detail=f"TTS failed: {e}")

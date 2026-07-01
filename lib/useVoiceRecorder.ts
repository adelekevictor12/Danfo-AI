"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type RecorderStatus = "idle" | "recording" | "transcribing";

interface UseVoiceRecorderResult {
  status: RecorderStatus;
  /** True when the browser supports the APIs we need (mic + MediaRecorder). */
  supported: boolean;
  /**
   * True once the server has told us voice transcription isn't available
   * (no STT provider / Intron not approved). Persists so the UI can show a
   * standing hint without the user having to record and fail again.
   */
  unavailable: boolean;
  error: string | null;
  start: () => Promise<void>;
  stop: () => void;
  /** Cancel a recording without transcribing it. */
  cancel: () => void;
}

const UNAVAILABLE_KEY = "danfo-voice-unavailable";

/**
 * Records a short audio clip from the microphone and sends it to the 0G-backed
 * /api/transcribe endpoint. On success the recognised text is handed to
 * `onResult`. Designed for a press-to-record, press-again-to-stop flow.
 *
 * `getLanguage` is read lazily at stop time so the caller can change the
 * selected language without us re-subscribing.
 */
export function useVoiceRecorder(
  onResult: (text: string) => void,
  getLanguage?: () => string | undefined
): UseVoiceRecorderResult {
  const [status, setStatus] = useState<RecorderStatus>("idle");
  const [supported, setSupported] = useState(true);
  const [unavailable, setUnavailable] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const cancelledRef = useRef(false);

  useEffect(() => {
    const ok =
      typeof window !== "undefined" &&
      typeof navigator !== "undefined" &&
      !!navigator.mediaDevices?.getUserMedia &&
      typeof window.MediaRecorder !== "undefined";
    setSupported(ok);
    try {
      if (localStorage.getItem(UNAVAILABLE_KEY) === "1") setUnavailable(true);
    } catch {
      /* storage unavailable — ignore */
    }
  }, []);

  const cleanupStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    recorderRef.current = null;
    chunksRef.current = [];
  }, []);

  const start = useCallback(async () => {
    if (!supported || status !== "idle") return;
    setError(null);
    cancelledRef.current = false;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const recorder = new MediaRecorder(stream);
      recorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        const blob = new Blob(chunksRef.current, {
          type: recorder.mimeType || "audio/webm",
        });
        cleanupStream();

        if (cancelledRef.current || blob.size === 0) {
          setStatus("idle");
          return;
        }

        setStatus("transcribing");
        try {
          const form = new FormData();
          form.append("file", blob, "audio.webm");
          const language = getLanguage?.();
          if (language) form.append("language", language);

          const res = await fetch("/api/transcribe", {
            method: "POST",
            body: form,
          });
          const data = await res.json();
          if (!res.ok || data.error) {
            // 403/503 mean voice isn't available (no STT provider / Intron not
            // approved) — remember it so we can show a standing hint.
            if (res.status === 403 || res.status === 503) {
              setUnavailable(true);
              try {
                localStorage.setItem(UNAVAILABLE_KEY, "1");
              } catch {
                /* ignore */
              }
            }
            throw new Error(data.error || `Transcription failed (${res.status})`);
          }
          const text = (data.text || "").trim();
          if (text) {
            // A success clears any prior "unavailable" state (no-op if unset).
            setUnavailable(false);
            try {
              localStorage.removeItem(UNAVAILABLE_KEY);
            } catch {
              /* ignore */
            }
            onResult(text);
          } else setError("Didn't catch that — try again.");
        } catch (e) {
          setError((e as Error).message || "Couldn't transcribe audio.");
        } finally {
          setStatus("idle");
        }
      };

      recorder.start();
      setStatus("recording");
    } catch (e) {
      cleanupStream();
      setStatus("idle");
      const name = (e as Error).name;
      setError(
        name === "NotAllowedError"
          ? "Microphone permission denied."
          : "Couldn't access the microphone."
      );
    }
  }, [supported, status, cleanupStream, onResult, getLanguage]);

  const stop = useCallback(() => {
    if (recorderRef.current && status === "recording") {
      recorderRef.current.stop();
    }
  }, [status]);

  const cancel = useCallback(() => {
    cancelledRef.current = true;
    if (recorderRef.current && status === "recording") {
      recorderRef.current.stop();
    }
  }, [status]);

  // Make sure the mic is released if the component unmounts mid-recording.
  useEffect(() => cleanupStream, [cleanupStream]);

  return { status, supported, unavailable, error, start, stop, cancel };
}

"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface UseTextToSpeechResult {
  /** Index of the message currently loading audio, or null. */
  loadingId: number | null;
  /** Index of the message currently playing, or null. */
  playingId: number | null;
  error: string | null;
  /** Fetch + play TTS for a message; tapping the same one again stops it. */
  speak: (id: number, text: string, language?: string) => Promise<void>;
  stop: () => void;
}

/**
 * Plays YarnGPT-generated speech for assistant replies via the /api/speak
 * proxy. Tracks per-message state so the UI can show a spinner / "stop" on the
 * right bubble. Only one clip plays at a time.
 */
export function useTextToSpeech(): UseTextToSpeechResult {
  const [loadingId, setLoadingId] = useState<number | null>(null);
  const [playingId, setPlayingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const urlRef = useRef<string | null>(null);

  const cleanup = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = "";
      audioRef.current = null;
    }
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
    }
  }, []);

  const stop = useCallback(() => {
    cleanup();
    setPlayingId(null);
  }, [cleanup]);

  const speak = useCallback(
    async (id: number, text: string, language?: string) => {
      // Tapping the playing/loading message again acts as a toggle-off.
      if (playingId === id || loadingId === id) {
        stop();
        setLoadingId(null);
        return;
      }
      cleanup();
      setError(null);
      setPlayingId(null);
      setLoadingId(id);
      try {
        const res = await fetch("/api/speak", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text, language }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || `Speech failed (${res.status})`);
        }
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        urlRef.current = url;

        const audio = new Audio(url);
        audioRef.current = audio;
        audio.onended = () => stop();
        audio.onerror = () => {
          setError("Couldn't play audio.");
          stop();
        };
        await audio.play();
        setPlayingId(id);
      } catch (e) {
        setError((e as Error).message || "Text-to-speech failed.");
      } finally {
        setLoadingId(null);
      }
    },
    [playingId, loadingId, cleanup, stop]
  );

  useEffect(() => cleanup, [cleanup]);

  return { loadingId, playingId, error, speak, stop };
}

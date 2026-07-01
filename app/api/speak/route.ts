import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Text-to-speech proxy. Forwards text to a YarnGPT service (Nigerian-accented
 * TTS) and streams the generated WAV back to the browser. The YarnGPT model is
 * Python-only and heavy, so it runs as a separate service — see
 * yarngpt-service/README.md. Set YARNGPT_API_URL to point at it.
 */

// Our app's short language codes -> YarnGPT's language names.
const LANG_MAP: Record<string, string> = {
  yo: "yoruba",
  ig: "igbo",
  ha: "hausa",
  en: "english",
  pcm: "pidgin",
};

// A sensible default voice per language (YarnGPT2 speaker names).
const DEFAULT_VOICE: Record<string, string> = {
  yoruba: "idera",
  igbo: "ngozi",
  hausa: "zainab",
  english: "idera",
  pidgin: "idera",
};

export async function POST(req: NextRequest) {
  const base = process.env.YARNGPT_API_URL;
  if (!base) {
    return NextResponse.json(
      { error: "Text-to-speech is not configured (YARNGPT_API_URL is unset)." },
      { status: 503 }
    );
  }

  try {
    const { text, language, voice } = await req.json();
    const clean = (text || "").toString().trim();
    if (!clean) {
      return NextResponse.json({ error: "no text" }, { status: 400 });
    }

    const ygLanguage = LANG_MAP[language as string] || "english";
    const ygVoice = voice || DEFAULT_VOICE[ygLanguage] || "idera";

    const upstream = await fetch(`${base.replace(/\/$/, "")}/tts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: clean, language: ygLanguage, voice: ygVoice }),
    });

    if (!upstream.ok || !upstream.body) {
      const detail = await upstream.text().catch(() => "");
      throw new Error(`YarnGPT service error ${upstream.status}: ${detail}`);
    }

    return new NextResponse(upstream.body, {
      status: 200,
      headers: {
        "Content-Type": upstream.headers.get("Content-Type") || "audio/wav",
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    console.error("/api/speak error:", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

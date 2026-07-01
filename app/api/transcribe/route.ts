import { NextRequest, NextResponse } from "next/server";
import { transcribe } from "../../../lib/zg-speech";
import { isIntronConfigured, transcribeWithIntron } from "../../../lib/intron-speech";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get("file") as File | null;
    if (!file) return NextResponse.json({ error: "no file" }, { status: 400 });
    const language = (form.get("language") as string | null) || undefined;
    const buf = Buffer.from(await file.arrayBuffer());
    const filename = file.name || "audio.webm";

    // Intron (African-accent ASR incl. Pidgin) is the primary voice engine.
    if (isIntronConfigured()) {
      try {
        const text = await transcribeWithIntron(buf, filename, language);
        return NextResponse.json({ text, engine: "intron" });
      } catch (intronErr) {
        const msg = (intronErr as Error).message || "";
        // Intron gates its API behind an approved "integrator account".
        if (/\b403\b|integrator|permission denied/i.test(msg)) {
          console.error("/api/transcribe Intron permission error:", msg);
          return NextResponse.json(
            {
              error:
                "Voice input is set up, but your Intron account isn't approved for API access yet " +
                "(their API needs an 'integrator account'). Email voice@intron.io to request access. " +
                "You can keep typing in the meantime.",
            },
            { status: 403 }
          );
        }
        // Intron authorized the request but its backend didn't process the audio
        // ("file not queued" / 5xx). Usually a transient service issue or an
        // account not yet provisioned to run STT jobs.
        if (/file not queued|\b5\d\d\b/i.test(msg)) {
          console.error("/api/transcribe Intron processing error:", msg);
          return NextResponse.json(
            {
              error:
                "Intron received the audio but couldn't process it right now (its service may be " +
                "temporarily down, or your account isn't fully provisioned for transcription). " +
                "Try again shortly, or contact voice@intron.io. You can keep typing meanwhile.",
            },
            { status: 503 }
          );
        }
        throw intronErr;
      }
    }

    // No Intron key: try the 0G Whisper fallback. The public 0G network may not
    // have a speech provider online, so surface an actionable message if not.
    try {
      const text = await transcribe(buf, filename, language);
      return NextResponse.json({ text, engine: "0g-whisper" });
    } catch (fallbackErr) {
      console.error("/api/transcribe 0G fallback failed:", fallbackErr);
      return NextResponse.json(
        {
          error:
            "Voice input isn't available: no 0G speech-to-text provider is online. " +
            "Add INTRON_API_KEY (from https://voice.intron.io) to enable Yorùbá / Igbo / " +
            "Hausa / Pidgin / English voice input — or type your message instead.",
        },
        { status: 503 }
      );
    }
  } catch (e) {
    console.error("/api/transcribe error:", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
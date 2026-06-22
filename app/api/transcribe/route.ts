import { NextRequest, NextResponse } from "next/server";
import { transcribe } from "../../../lib/zg-speech";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get("file") as File | null;
    if (!file) return NextResponse.json({ error: "no file" }, { status: 400 });
    const buf = Buffer.from(await file.arrayBuffer());
    const text = await transcribe(buf, file.name || "audio.webm");
    return NextResponse.json({ text });
  } catch (e) {
    console.error("/api/transcribe error:", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
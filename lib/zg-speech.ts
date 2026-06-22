/**
 * 0G Compute speech-to-text (Whisper Large V3).
 * Same broker pattern as chat, but hits the audio/transcriptions endpoint.
 * Whisper handles Yoruba, Igbo, Hausa (with varying quality).
 */
import { ethers } from "ethers";
import { createZGComputeNetworkBroker } from "@0glabs/0g-serving-broker";

const RPC_URL = process.env.RPC_URL || "https://evmrpc-testnet.0g.ai";

let brokerPromise: ReturnType<typeof createZGComputeNetworkBroker> | null = null;

function getWallet() {
  const pk = process.env.PRIVATE_KEY;
  if (!pk) throw new Error("PRIVATE_KEY missing");
  return new ethers.Wallet(pk, new ethers.JsonRpcProvider(RPC_URL));
}
async function getBroker() {
  if (!brokerPromise) brokerPromise = createZGComputeNetworkBroker(getWallet());
  return brokerPromise;
}

/** Find a speech-to-text provider, or use STT_PROVIDER_ADDRESS if pinned. */
async function getSttProvider(): Promise<string> {
  const pinned = process.env.STT_PROVIDER_ADDRESS;
  if (pinned) return pinned;
  const broker = await getBroker();
  const services = await broker.inference.listService();
  // Prefer a service whose model name signals whisper / speech.
  const stt = services.find((s: any) =>
    /whisper|speech|transcri/i.test(s.model || "")
  );
  if (!stt) throw new Error("No 0G speech-to-text provider found. Pin STT_PROVIDER_ADDRESS.");
  return stt.provider;
}

export async function transcribe(audio: Buffer, filename = "audio.webm"): Promise<string> {
  const broker = await getBroker();
  const provider = await getSttProvider();

  await broker.inference.acknowledgeProviderSigner(provider).catch(() => {});

  const { endpoint, model } = await broker.inference.getServiceMetadata(provider);
  const headers = await broker.inference.getRequestHeaders(provider, "audio-transcription");

  const form = new FormData();
  form.append("file", new Blob([audio]), filename);
  form.append("model", model);
  // Let Whisper auto-detect language (don't force "en").

  const res = await fetch(`${endpoint}/audio/transcriptions`, {
    method: "POST",
    headers: { ...headers }, // do NOT set Content-Type; fetch sets the multipart boundary
    body: form,
  });

  if (!res.ok) {
    throw new Error(`0G transcription failed: ${res.status} ${await res.text()}`);
  }
  const data = await res.json();
  return data.text ?? "";
}
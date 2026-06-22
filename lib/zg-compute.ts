/**
 * 0G Compute integration for DanfoAI.
 *
 * Runs LLM inference on 0G's decentralized GPU network and verifies the
 * response via processResponse() — this is what makes DanfoAI's answers
 * "verifiable & censorship-resistant" rather than a centralized API call.
 *
 * Critical rules (from 0G agent-skills):
 *  - ALWAYS call processResponse() after every inference.
 *  - processResponse param order: (providerAddress, chatID, usageData).
 *  - Extract ChatID from the response (ZG-Res-Key header first, body fallback).
 *  - ethers v6 only.
 */
import { ethers } from "ethers";
import { createZGComputeNetworkBroker } from "@0glabs/0g-serving-broker";

const RPC_URL = process.env.RPC_URL || "https://evmrpc-testnet.0g.ai";

// Cache the broker across requests (init is expensive).
let brokerPromise: ReturnType<typeof createZGComputeNetworkBroker> | null = null;
let acknowledged = false;

function getWallet() {
  const pk = process.env.PRIVATE_KEY;
  if (!pk) throw new Error("PRIVATE_KEY missing from environment");
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  return new ethers.Wallet(pk, provider);
}

async function getBroker() {
  if (!brokerPromise) {
    brokerPromise = createZGComputeNetworkBroker(getWallet());
  }
  return brokerPromise;
}

/**
 * Ensure the compute account is funded and the provider is acknowledged.
 * Call once before the first inference. Funding amount is small for demo use.
 */
export async function ensureComputeReady(providerAddress: string) {
  const broker = await getBroker();

  // 1. Check the ledger. Create + fund it only if it doesn't exist or is low.
  let needsFunding = true;
  try {
    const ledger = await broker.ledger.getLedger();
    // ledger balance is a bigint in neuron (1e18). Fund if under ~0.05.
    const balance = BigInt(ledger?.totalBalance ?? ledger?.balance ?? 0);
    if (balance > 50_000_000_000_000_000n) needsFunding = false;
  } catch {
    // No ledger yet — must create it.
    needsFunding = true;
  }

  if (needsFunding) {
    try {
      // addLedger creates the account on first use; depositFund tops up an existing one.
      await broker.ledger.addLedger(0.1);
    } catch (e) {
      // Already exists -> top up instead.
      try {
        await broker.ledger.depositFund(0.1);
      } catch (e2) {
        console.warn("funding failed:", (e2 as Error).message);
      }
    }
  }

  // 2. Acknowledge the provider (only needs to happen once per provider).
  if (!acknowledged) {
    try {
      await broker.inference.acknowledgeProviderSigner(providerAddress);
    } catch (e) {
      // If it's already acknowledged the broker reverts; treat as fine.
      console.warn("acknowledge note:", (e as Error).message);
    }
    acknowledged = true;
  }
}

export interface DanfoChatResult {
  reply: string;
  chatId: string | null;
  verified: boolean;
  model: string;
  provider: string;
}

/**
 * Run a chat completion on 0G Compute and verify it.
 * `messages` follows the OpenAI chat format.
 */
export async function danfoChat(
  providerAddress: string,
  messages: { role: string; content: string }[]
): Promise<DanfoChatResult> {
  const broker = await getBroker();

  await ensureComputeReady(providerAddress);

  const { endpoint, model } = await broker.inference.getServiceMetadata(
    providerAddress
  );

  // The "content" passed to getRequestHeaders is the billed content —
  // use the last user message.
  const lastUser =
    [...messages].reverse().find((m) => m.role === "user")?.content || "";
  const headers = await broker.inference.getRequestHeaders(
    providerAddress,
    lastUser
  );

  const res = await fetch(`${endpoint}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify({ model, messages }),
  });

  if (!res.ok) {
    throw new Error(`0G Compute request failed: ${res.status} ${await res.text()}`);
  }

  // ChatID: header first, body fallback (per 0G critical rules).
  const headerChatId = res.headers.get("ZG-Res-Key");
  const data = await res.json();
  const bodyChatId = data.id || null;
  const chatId = headerChatId || bodyChatId;

  const reply: string = data.choices?.[0]?.message?.content ?? "";

  // Verify the response. processResponse confirms the provider's signature
  // over the output (TEE-backed). If it returns true, the answer is verified.
  let verified = false;
  try {
    if (chatId) {
      verified = Boolean(
        await broker.inference.processResponse(
          providerAddress,
          chatId,
          data.usage
        )
      );
    }
  } catch (e) {
    console.warn("processResponse failed:", (e as Error).message);
  }

  return { reply, chatId, verified, model, provider: providerAddress };
}

/** Discover a verifiable (TEE) provider. */
export async function discoverProvider(): Promise<string> {
  const explicit = process.env.PROVIDER_ADDRESS;
  if (explicit) return explicit;

  const broker = await getBroker();
  const services = await broker.inference.listService();
  // Prefer TEE-verifiable providers.
  const tee = services.find((s: any) => s.verifiability === "TeeML");
  const chosen = tee || services[0];
  if (!chosen) throw new Error("No 0G Compute providers available");
  return chosen.provider;
}

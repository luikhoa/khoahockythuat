import { clearStats, getStats, incrementEvent } from "./lib/stats";
import type {
  ExtensionMessage,
  ExtensionResponse,
  OffscreenMessage,
} from "./lib/types";

const OFFSCREEN_PATH = "dist/offscreen.html";
let creatingOffscreen: Promise<void> | undefined;
let requestSequence = 0;

export async function ensureOffscreenDocument(): Promise<void> {
  if (await hasOffscreenDocument()) return;
  if (!creatingOffscreen) {
    creatingOffscreen = chrome.offscreen.createDocument({
      url: OFFSCREEN_PATH,
      reasons: ["WORKERS" as chrome.offscreen.Reason],
      justification: "Host the packaged local AI inference worker",
    }).finally(() => {
      creatingOffscreen = undefined;
    });
  }
  await creatingOffscreen;
}

export async function dispatch(message: ExtensionMessage): Promise<ExtensionResponse<unknown>> {
  try {
    switch (message.type) {
      case "event":
        await incrementEvent(message.event);
        return { ok: true, data: { ok: true } };
      case "stats":
        return { ok: true, data: await getStats(message.range) };
      case "clear-stats":
        await clearStats(message.range);
        return { ok: true, data: { ok: true } };
      case "predict":
      case "model-status":
      case "retry-model":
        return relayToOffscreen(message);
    }
  } catch (error) {
    return {
      ok: false,
      error: {
        kind: message.type === "event" || message.type === "stats" || message.type === "clear-stats"
          ? "invalid-response"
          : "model-load",
        retryable: false,
        message: error instanceof Error ? error.message : String(error ?? "Unknown extension error"),
      },
    };
  }
}

async function relayToOffscreen(
  message: Extract<ExtensionMessage, { type: "predict" | "model-status" | "retry-model" }>,
): Promise<ExtensionResponse<unknown>> {
  await ensureOffscreenDocument();
  const relay: OffscreenMessage = {
    target: "offscreen",
    type: message.type,
    requestId: message.requestId ?? nextRequestId(),
    ...(message.type === "predict" ? { content: message.content } : {}),
  };
  return chrome.runtime.sendMessage<OffscreenMessage, ExtensionResponse<unknown>>(relay);
}

async function hasOffscreenDocument(): Promise<boolean> {
  const documentUrl = chrome.runtime.getURL(OFFSCREEN_PATH);
  const runtime = chrome.runtime as typeof chrome.runtime & {
    getContexts?: (filter: {
      contextTypes: string[];
      documentUrls: string[];
    }) => Promise<Array<{ documentUrl?: string }>>;
  };
  if (typeof runtime.getContexts === "function") {
    const contexts = await runtime.getContexts({
      contextTypes: ["OFFSCREEN_DOCUMENT"],
      documentUrls: [documentUrl],
    });
    return contexts.length > 0;
  }

  const workerClients = (globalThis as unknown as {
    clients?: { matchAll(): Promise<Array<{ url: string }>> };
  }).clients;
  if (!workerClients) return false;
  const matched = await workerClients.matchAll();
  return matched.some((client) => client.url === documentUrl);
}

function nextRequestId(): string {
  requestSequence += 1;
  return `cs-${Date.now()}-${requestSequence}`;
}

chrome.runtime.onMessage.addListener((message: ExtensionMessage | OffscreenMessage, _sender, sendResponse) => {
  if ("target" in message) return false;
  void dispatch(message).then(sendResponse);
  return true;
});

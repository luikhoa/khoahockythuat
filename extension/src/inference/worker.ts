import { AutoTokenizer, env, type PreTrainedTokenizer } from "@huggingface/transformers";
import * as ort from "onnxruntime-web/webgpu";

import {
  ModelRuntime,
  ModelRuntimeError,
  type EncodedInput,
  type InferenceAdapter,
  type InferenceSession,
  type TokenizerAdapter,
} from "./model-runtime";
import type {
  InferenceError,
  InferenceProvider,
  InferenceWorkerRequest,
  InferenceWorkerResponse,
} from "./protocol";

const DIST_URL = new URL("./", globalThis.location.href).href;
const MODEL_URL = new URL("model/model.onnx", DIST_URL).href;

env.allowLocalModels = true;
env.allowRemoteModels = false;
env.localModelPath = DIST_URL;
env.useBrowserCache = false;

ort.env.wasm.numThreads = 1;
ort.env.wasm.wasmPaths = new URL("wasm/", DIST_URL).href;

class BrowserTokenizerAdapter implements TokenizerAdapter {
  constructor(private readonly tokenizer: PreTrainedTokenizer) {}

  async encode(text: string): Promise<EncodedInput> {
    const encoded = this.tokenizer(text, {
      truncation: true,
      max_length: 128,
      return_tensor: false,
    });
    const inputIds = BigInt64Array.from(encoded.input_ids, (value) => BigInt(value));
    const attentionMask = BigInt64Array.from(encoded.attention_mask, (value) => BigInt(value));
    return {
      text,
      inputIds,
      attentionMask,
      dims: [1, inputIds.length],
    };
  }
}

class BrowserInferenceSession implements InferenceSession {
  constructor(private readonly session: ort.InferenceSession) {}

  async run(input: EncodedInput): Promise<readonly number[]> {
    const inputIds = new ort.Tensor("int64", input.inputIds, input.dims);
    const attentionMask = new ort.Tensor("int64", input.attentionMask, input.dims);
    let output: ort.Tensor | undefined;

    try {
      const outputs = await this.session.run({
        input_ids: inputIds,
        attention_mask: attentionMask,
      });
      output = outputs.toxic_logit ?? outputs[this.session.outputNames[0]];
      if (!output) return [];
      const data = await output.getData();
      const values: number[] = [];
      for (let index = 0; index < data.length; index += 1) {
        values.push(Number(data[index]));
      }
      return values;
    } finally {
      output?.dispose();
      inputIds.dispose();
      attentionMask.dispose();
    }
  }

  async dispose(): Promise<void> {
    await this.session.release();
  }
}

class BrowserInferenceAdapter implements InferenceAdapter {
  async loadTokenizer(): Promise<TokenizerAdapter> {
    const tokenizer = await AutoTokenizer.from_pretrained("model", {
      local_files_only: true,
    });
    return new BrowserTokenizerAdapter(tokenizer);
  }

  async createSession(provider: InferenceProvider): Promise<InferenceSession> {
    const session = await ort.InferenceSession.create(MODEL_URL, {
      executionProviders: [provider],
      graphOptimizationLevel: "all",
    });
    return new BrowserInferenceSession(session);
  }
}

const runtime = new ModelRuntime(new BrowserInferenceAdapter());

interface WorkerScope {
  addEventListener(
    type: "message",
    listener: (event: MessageEvent<InferenceWorkerRequest>) => void,
  ): void;
  postMessage(message: InferenceWorkerResponse): void;
}

const workerScope = globalThis as unknown as WorkerScope;

workerScope.addEventListener("message", (event) => {
  void handleRequest(event.data).then((response) => workerScope.postMessage(response));
});

async function handleRequest(request: InferenceWorkerRequest): Promise<InferenceWorkerResponse> {
  try {
    switch (request.type) {
      case "initialize":
        return { requestId: request.requestId, ok: true, type: request.type, data: await runtime.initialize() };
      case "predict":
        return {
          requestId: request.requestId,
          ok: true,
          type: request.type,
          data: await runtime.predict(request.content),
        };
      case "status":
        return { requestId: request.requestId, ok: true, type: request.type, data: runtime.getStatus() };
      case "dispose":
        await runtime.dispose();
        return { requestId: request.requestId, ok: true, type: request.type, data: null };
    }
  } catch (error) {
    return { requestId: request.requestId, ok: false, error: serializeError(error) };
  }
}

function serializeError(error: unknown): InferenceError {
  if (error instanceof ModelRuntimeError) return error.toJSON();
  return {
    kind: "inference",
    retryable: true,
    message: error instanceof Error ? error.message : String(error ?? "Unknown inference error"),
  };
}

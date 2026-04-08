/**
 * Fireworks Provider Extension
 *
 * Registers Fireworks as a custom provider using the openai-completions API.
 * Base URL: https://api.fireworks.ai/inference/v1
 *
 * Usage:
 *   # Set your API key
 *   export FIREWORKS_API_KEY=your-api-key
 *
 *   # Run pi with the extension
 *   pi -e /path/to/pi-fireworks-provider
 *
 * Then use /model to select from available models
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import customModels from "./custom-models.json" with { type: "json" };

// Transform custom-models.json structure to pi's expected format
interface CustomModel {
  id: string;
  name: string;
  reasoning: boolean;
  modalities: {
    input: string[];
  };
  cost: {
    input: number;
    output: number;
    cache_read: number;
    cache_write: number;
  };
  limit: {
    context: number | null;
    output: number | null;
  };
}

const models = (customModels as CustomModel[]).map((model) => ({
  id: model.id,
  name: model.name,
  reasoning: model.reasoning,
  input: model.modalities.input,
  cost: {
    input: model.cost.input,
    output: model.cost.output,
    cacheRead: model.cost.cache_read,
    cacheWrite: model.cost.cache_write,
  },
  contextWindow: model.limit.context ?? 0,
  maxTokens: model.limit.output ?? 0,
}));

export default function (pi: ExtensionAPI) {
  pi.registerProvider("fireworks", {
    baseUrl: "https://api.fireworks.ai/inference/v1",
    apiKey: "FIREWORKS_API_KEY",
    api: "openai-completions",
    models,
  });
}

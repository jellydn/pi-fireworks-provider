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
import regular from "./models.json" with { type: "json" };
import custom from "./custom-models.json" with { type: "json" };

// Model data structure from JSON files
interface JsonModel {
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

// Pi's expected model structure
interface PiModel {
  id: string;
  name: string;
  reasoning: boolean;
  input: string[];
  cost: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
  };
  contextWindow: number;
  maxTokens: number;
}

// Transform JSON model to Pi's expected format
function transformModel(m: JsonModel): PiModel {
  const c = m.cost ?? {};
  return {
    id: m.id,
    name: m.name,
    reasoning: m.reasoning,
    input: m.modalities.input,
    cost: {
      input: c.input ?? 0,
      output: c.output ?? 0,
      cacheRead: c.cache_read ?? 0,
      cacheWrite: c.cache_write ?? 0,
    },
    contextWindow: m.limit.context ?? 0,
    maxTokens: m.limit.output ?? m.limit.context ?? 0,
  };
}

// Merge regular and custom models (custom takes precedence on ID conflict)
function mergeModels(regular: JsonModel[], custom: JsonModel[]): PiModel[] {
  const byId = new Map<string, JsonModel>();
  for (const m of regular) byId.set(m.id, m);
  for (const m of custom) byId.set(m.id, m);
  return Array.from(byId.values()).map(transformModel);
}

const models = mergeModels(regular, custom);

export default function (pi: ExtensionAPI) {
  pi.registerProvider("fireworks", {
    baseUrl: "https://api.fireworks.ai/inference/v1",
    apiKey: "FIREWORKS_API_KEY",
    api: "openai-completions",
    models,
  });
}

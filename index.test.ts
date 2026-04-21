import { describe, it, expect } from "vitest";

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

describe("transformModel", () => {
  it("should transform a complete model correctly", () => {
    const jsonModel: JsonModel = {
      id: "accounts/fireworks/models/deepseek-r1",
      name: "DeepSeek R1",
      reasoning: true,
      modalities: { input: ["text", "image"] },
      cost: {
        input: 3.0,
        output: 8.0,
        cache_read: 0.9,
        cache_write: 3.0,
      },
      limit: {
        context: 128000,
        output: 8192,
      },
    };

    const result = transformModel(jsonModel);

    expect(result).toEqual({
      id: "accounts/fireworks/models/deepseek-r1",
      name: "DeepSeek R1",
      reasoning: true,
      input: ["text", "image"],
      cost: {
        input: 3.0,
        output: 8.0,
        cacheRead: 0.9,
        cacheWrite: 3.0,
      },
      contextWindow: 128000,
      maxTokens: 8192,
    });
  });

  it("should handle missing cost fields with defaults", () => {
    const jsonModel: JsonModel = {
      id: "test-model",
      name: "Test Model",
      reasoning: false,
      modalities: { input: ["text"] },
      cost: {
        input: undefined as unknown as number,
        output: undefined as unknown as number,
        cache_read: undefined as unknown as number,
        cache_write: undefined as unknown as number,
      },
      limit: {
        context: null,
        output: null,
      },
    };

    const result = transformModel(jsonModel);

    expect(result.cost).toEqual({
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
    });
    expect(result.contextWindow).toBe(0);
    expect(result.maxTokens).toBe(0);
  });

  it("should use context as maxTokens when output is null", () => {
    const jsonModel: JsonModel = {
      id: "test-model",
      name: "Test Model",
      reasoning: false,
      modalities: { input: ["text"] },
      cost: {
        input: 1.0,
        output: 2.0,
        cache_read: 0,
        cache_write: 0,
      },
      limit: {
        context: 64000,
        output: null,
      },
    };

    const result = transformModel(jsonModel);

    expect(result.maxTokens).toBe(64000);
  });

  it("should handle empty cost object", () => {
    const jsonModel: JsonModel = {
      id: "test-model",
      name: "Test Model",
      reasoning: false,
      modalities: { input: ["text"] },
      cost: undefined as unknown as { input: number; output: number; cache_read: number; cache_write: number },
      limit: {
        context: 1000,
        output: 500,
      },
    };

    const result = transformModel(jsonModel);

    expect(result.cost).toEqual({
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
    });
  });
});

describe("mergeModels", () => {
  it("should merge regular and custom models", () => {
    const regular: JsonModel[] = [
      {
        id: "model-1",
        name: "Model 1",
        reasoning: false,
        modalities: { input: ["text"] },
        cost: { input: 1, output: 2, cache_read: 0, cache_write: 0 },
        limit: { context: 1000, output: 500 },
      },
    ];
    const custom: JsonModel[] = [
      {
        id: "model-2",
        name: "Custom Model 2",
        reasoning: true,
        modalities: { input: ["text", "image"] },
        cost: { input: 3, output: 4, cache_read: 1, cache_write: 2 },
        limit: { context: 2000, output: 1000 },
      },
    ];

    const result = mergeModels(regular, custom);

    expect(result).toHaveLength(2);
    expect(result.map((m) => m.id)).toContain("model-1");
    expect(result.map((m) => m.id)).toContain("model-2");
  });

  it("should have custom models take precedence on ID conflict", () => {
    const regular: JsonModel[] = [
      {
        id: "model-1",
        name: "Regular Model 1",
        reasoning: false,
        modalities: { input: ["text"] },
        cost: { input: 1, output: 2, cache_read: 0, cache_write: 0 },
        limit: { context: 1000, output: 500 },
      },
    ];
    const custom: JsonModel[] = [
      {
        id: "model-1",
        name: "Custom Override",
        reasoning: true,
        modalities: { input: ["text", "image"] },
        cost: { input: 5, output: 6, cache_read: 2, cache_write: 3 },
        limit: { context: 5000, output: 2000 },
      },
    ];

    const result = mergeModels(regular, custom);

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Custom Override");
    expect(result[0].reasoning).toBe(true);
  });

  it("should handle empty arrays", () => {
    const result1 = mergeModels([], []);
    expect(result1).toHaveLength(0);

    const regular: JsonModel[] = [
      {
        id: "model-1",
        name: "Model 1",
        reasoning: false,
        modalities: { input: ["text"] },
        cost: { input: 1, output: 2, cache_read: 0, cache_write: 0 },
        limit: { context: 1000, output: 500 },
      },
    ];

    const result2 = mergeModels(regular, []);
    expect(result2).toHaveLength(1);
    expect(result2[0].id).toBe("model-1");

    const result3 = mergeModels([], regular);
    expect(result3).toHaveLength(1);
    expect(result3[0].id).toBe("model-1");
  });

  it("should handle duplicate models across arrays", () => {
    const regular: JsonModel[] = [
      {
        id: "model-1",
        name: "Model 1",
        reasoning: false,
        modalities: { input: ["text"] },
        cost: { input: 1, output: 2, cache_read: 0, cache_write: 0 },
        limit: { context: 1000, output: 500 },
      },
    ];

    const result = mergeModels(regular, regular);

    expect(result).toHaveLength(1);
  });
});

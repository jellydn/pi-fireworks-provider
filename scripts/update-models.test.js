import { describe, it, expect } from "vitest";

// Helper functions extracted from update-models.js for testing
function modelsAreEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function findDuplicateCustomModels(upstream, custom) {
  const byId = new Map(upstream.map((m) => [m.id, m]));
  return custom.filter((m) => {
    const u = byId.get(m.id);
    return u && modelsAreEqual(m, u);
  });
}

function findConflictingCustomModels(upstream, custom) {
  const byId = new Map(upstream.map((m) => [m.id, m]));
  return custom.filter((m) => {
    const u = byId.get(m.id);
    return u && !modelsAreEqual(m, u);
  });
}

function removeDuplicateCustomModels(custom, duplicates) {
  const ids = new Set(duplicates.map((m) => m.id));
  return custom.filter((m) => !ids.has(m.id));
}

function mergeModels(upstream, custom) {
  const byId = new Map();
  for (const m of upstream) byId.set(m.id, m);
  for (const m of custom) byId.set(m.id, m);
  return Array.from(byId.values());
}

function formatCost(cost) {
  if (cost == null) return "-";
  if (cost === 0) return "Free";
  return `$${cost.toFixed(2)}`;
}

function formatNumber(num) {
  if (num == null) return "-";
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(0)}K`;
  return String(num);
}

function getInputTypes(modalities) {
  const types = modalities?.input ?? ["text"];
  const labels = [];
  if (types.includes("text")) labels.push("Text");
  if (types.includes("image")) labels.push("Image");
  if (types.includes("video")) labels.push("Video");
  return labels.join(" + ") || "Text";
}

function generateReadmeRow(m) {
  const c = m.cost ?? {};
  const l = m.limit ?? {};
  return `| ${m.name} | ${getInputTypes(m.modalities)} | ${formatNumber(l.context)} | ${formatNumber(l.output)} | ${formatCost(c.input)} | ${formatCost(c.output)} |`;
}

describe("modelsAreEqual", () => {
  it("should return true for identical models", () => {
    const model = {
      id: "test",
      name: "Test Model",
      cost: { input: 1.0, output: 2.0 },
    };
    expect(modelsAreEqual(model, { ...model })).toBe(true);
  });

  it("should return false for different models", () => {
    const model1 = { id: "test", name: "Test" };
    const model2 = { id: "test", name: "Different" };
    expect(modelsAreEqual(model1, model2)).toBe(false);
  });

  it("should return true for empty objects", () => {
    expect(modelsAreEqual({}, {})).toBe(true);
  });
});

describe("findDuplicateCustomModels", () => {
  it("should find exact duplicates between upstream and custom", () => {
    const model = {
      id: "test-model",
      name: "Test Model",
      cost: { input: 1.0, output: 2.0 },
    };
    const upstream = [model];
    const custom = [{ ...model }];

    const duplicates = findDuplicateCustomModels(upstream, custom);
    expect(duplicates).toHaveLength(1);
    expect(duplicates[0].id).toBe("test-model");
  });

  it("should return empty array when no duplicates exist", () => {
    const upstream = [{ id: "model-1", name: "Model 1" }];
    const custom = [{ id: "model-2", name: "Model 2" }];

    const duplicates = findDuplicateCustomModels(upstream, custom);
    expect(duplicates).toHaveLength(0);
  });

  it("should not consider similar models with different content as duplicates", () => {
    const upstream = [{ id: "test", name: "Test", cost: { input: 1.0 } }];
    const custom = [{ id: "test", name: "Test", cost: { input: 2.0 } }];

    const duplicates = findDuplicateCustomModels(upstream, custom);
    expect(duplicates).toHaveLength(0);
  });
});

describe("findConflictingCustomModels", () => {
  it("should find conflicts with same ID but different content", () => {
    const upstream = [{ id: "test", name: "Upstream", cost: { input: 1.0 } }];
    const custom = [{ id: "test", name: "Custom", cost: { input: 2.0 } }];

    const conflicts = findConflictingCustomModels(upstream, custom);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].id).toBe("test");
  });

  it("should not report exact duplicates as conflicts", () => {
    const model = { id: "test", name: "Test" };
    const upstream = [{ ...model }];
    const custom = [{ ...model }];

    const conflicts = findConflictingCustomModels(upstream, custom);
    expect(conflicts).toHaveLength(0);
  });

  it("should return empty array when no shared IDs", () => {
    const upstream = [{ id: "model-1", name: "Model 1" }];
    const custom = [{ id: "model-2", name: "Model 2" }];

    const conflicts = findConflictingCustomModels(upstream, custom);
    expect(conflicts).toHaveLength(0);
  });
});

describe("removeDuplicateCustomModels", () => {
  it("should remove duplicate models from custom list", () => {
    const custom = [
      { id: "keep", name: "Keep Me" },
      { id: "remove", name: "Remove Me" },
    ];
    const duplicates = [{ id: "remove", name: "Remove Me" }];

    const result = removeDuplicateCustomModels(custom, duplicates);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("keep");
  });

  it("should return all models when no duplicates provided", () => {
    const custom = [
      { id: "model-1", name: "Model 1" },
      { id: "model-2", name: "Model 2" },
    ];

    const result = removeDuplicateCustomModels(custom, []);
    expect(result).toHaveLength(2);
  });

  it("should handle empty custom list", () => {
    const result = removeDuplicateCustomModels([], [{ id: "test" }]);
    expect(result).toHaveLength(0);
  });
});

describe("mergeModels", () => {
  it("should merge upstream and custom models", () => {
    const upstream = [{ id: "up-1", name: "Upstream 1" }];
    const custom = [{ id: "cust-1", name: "Custom 1" }];

    const result = mergeModels(upstream, custom);
    expect(result).toHaveLength(2);
  });

  it("should have custom take precedence on ID conflict", () => {
    const upstream = [{ id: "same", name: "Upstream" }];
    const custom = [{ id: "same", name: "Custom" }];

    const result = mergeModels(upstream, custom);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Custom");
  });

  it("should handle empty arrays", () => {
    expect(mergeModels([], [])).toHaveLength(0);
    expect(mergeModels([{ id: "test" }], [])).toHaveLength(1);
    expect(mergeModels([], [{ id: "test" }])).toHaveLength(1);
  });
});

describe("formatCost", () => {
  it("should format cost with dollar sign", () => {
    expect(formatCost(3.5)).toBe("$3.50");
    expect(formatCost(10)).toBe("$10.00");
  });

  it("should return 'Free' for zero cost", () => {
    expect(formatCost(0)).toBe("Free");
  });

  it("should return '-' for null/undefined", () => {
    expect(formatCost(null)).toBe("-");
    expect(formatCost(undefined)).toBe("-");
  });
});

describe("formatNumber", () => {
  it("should format large numbers with K/M suffix", () => {
    expect(formatNumber(1000)).toBe("1K");
    expect(formatNumber(1500)).toBe("2K");
    expect(formatNumber(1000000)).toBe("1.0M");
    expect(formatNumber(2500000)).toBe("2.5M");
  });

  it("should return string for small numbers", () => {
    expect(formatNumber(500)).toBe("500");
    expect(formatNumber(0)).toBe("0");
  });

  it("should return '-' for null/undefined", () => {
    expect(formatNumber(null)).toBe("-");
    expect(formatNumber(undefined)).toBe("-");
  });
});

describe("getInputTypes", () => {
  it("should format single input type", () => {
    expect(getInputTypes({ input: ["text"] })).toBe("Text");
  });

  it("should join multiple input types", () => {
    expect(getInputTypes({ input: ["text", "image"] })).toBe("Text + Image");
    expect(getInputTypes({ input: ["text", "image", "video"] })).toBe(
      "Text + Image + Video"
    );
  });

  it("should default to 'Text' when no modalities", () => {
    expect(getInputTypes(undefined)).toBe("Text");
    expect(getInputTypes({})).toBe("Text");
    expect(getInputTypes({ input: [] })).toBe("Text");
  });
});

describe("generateReadmeRow", () => {
  it("should generate markdown table row", () => {
    const model = {
      name: "Test Model",
      modalities: { input: ["text"] },
      limit: { context: 128000, output: 4096 },
      cost: { input: 3.0, output: 8.0 },
    };

    const row = generateReadmeRow(model);
    expect(row).toBe(
      "| Test Model | Text | 128K | 4K | $3.00 | $8.00 |"
    );
  });

  it("should handle missing cost and limit fields", () => {
    const model = {
      name: "Minimal Model",
      modalities: { input: ["text"] },
    };

    const row = generateReadmeRow(model);
    expect(row).toBe("| Minimal Model | Text | - | - | - | - |");
  });
});

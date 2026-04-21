#!/usr/bin/env node
// @ts-check
/**
 * Script to update fireworks models from models.dev API
 * Updates models.json (regular models) and README.md
 * Custom models are maintained separately in custom-models.json
 */

import https from 'https';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const API_URL = 'https://models.dev/api.json';
const PROVIDER_ID = 'fireworks-ai';
const MODELS_PATH = path.join(__dirname, '..', 'models.json');
const CUSTOM_MODELS_PATH = path.join(__dirname, '..', 'custom-models.json');

/**
 * @typedef {Object} ModelCost
 * @property {number} [input]
 * @property {number} [output]
 * @property {number} [cache_read]
 * @property {number} [cache_write]
 */

/**
 * @typedef {Object} ModelLimit
 * @property {number|null} [context]
 * @property {number|null} [output]
 */

/**
 * @typedef {Object} Model
 * @property {string} id
 * @property {string} name
 * @property {string} [status]
 * @property {string} [family]
 * @property {ModelCost} [cost]
 * @property {ModelLimit} [limit]
 * @property {{input?: string[]}} [modalities]
 */

// Fetch JSON from URL
/** @param {string} url */
function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', (/** @type {string} */ chunk) => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (/** @type {any} */ e) {
          reject(new Error(`Failed to parse JSON: ${e.message}`));
        }
      });
    }).on('error', reject);
  });
}

// Load models from JSON file
/** @param {string} filePath */
function loadModels(filePath) {
  if (!fs.existsSync(filePath)) {
    return [];
  }

  try {
    const data = fs.readFileSync(filePath, 'utf8');
    const models = JSON.parse(data);
    if (!Array.isArray(models)) {
      throw new Error('Expected a JSON array');
    }
    console.log(`✓ Loaded ${models.length} models from ${path.basename(filePath)}`);
    return models;
  } catch (/** @type {any} */ error) {
    throw new Error(`Could not load ${path.basename(filePath)}: ${error.message}`);
  }
}

// Save models to JSON file
/** @param {string} filePath */
function saveModels(filePath, /** @type {Model[]} */ models) {
  fs.writeFileSync(filePath, JSON.stringify(models, null, 2) + '\n');
  console.log(`✓ Saved ${models.length} models to ${path.basename(filePath)}`);
}

/** @param {any} a @param {any} b */
function modelsAreEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** @param {Model[]} upstream @param {Model[]} custom */
function findDuplicateCustomModels(upstream, custom) {
  const byId = new Map(upstream.map(m => [m.id, m]));
  return custom.filter(m => {
    const u = byId.get(m.id);
    return u && modelsAreEqual(m, u);
  });
}

/** @param {Model[]} upstream @param {Model[]} custom */
function findConflictingCustomModels(upstream, custom) {
  const byId = new Map(upstream.map(m => [m.id, m]));
  return custom.filter(m => {
    const u = byId.get(m.id);
    return u && !modelsAreEqual(m, u);
  });
}

/** @param {Model[]} custom @param {Model[]} duplicates */
function removeDuplicateCustomModels(custom, duplicates) {
  const ids = new Set(duplicates.map(m => m.id));
  return custom.filter(m => !ids.has(m.id));
}

/** @param {Model[]} upstream @param {Model[]} custom */
function mergeModels(upstream, custom) {
  const byId = new Map();
  for (const m of upstream) byId.set(m.id, m);
  for (const m of custom) byId.set(m.id, m);
  return Array.from(byId.values());
}

/** @param {number|null|undefined} cost */
function formatCost(cost) {
  if (cost == null) return '-';
  if (cost === 0) return 'Free';
  return `$${cost.toFixed(2)}`;
}

/** @param {number|null|undefined} num */
function formatNumber(num) {
  if (num == null) return '-';
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(0)}K`;
  return String(num);
}

/** @param {{input?: string[]}|undefined} modalities */
function getInputTypes(modalities) {
  const types = modalities?.input ?? ['text'];
  const labels = [];
  if (types.includes('text')) labels.push('Text');
  if (types.includes('image')) labels.push('Image');
  if (types.includes('video')) labels.push('Video');
  return labels.join(' + ') || 'Text';
}

/** @param {Model} m */
function generateReadmeRow(m) {
  const c = m.cost ?? {};
  const l = m.limit ?? {};
  return `| ${m.name} | ${getInputTypes(m.modalities)} | ${formatNumber(l.context)} | ${formatNumber(l.output)} | ${formatCost(c.input)} | ${formatCost(c.output)} |`;
}

/** @param {Model[]} models */
function updateReadme(models) {
  const readmePath = path.join(process.cwd(), 'README.md');
  let readme = fs.readFileSync(readmePath, 'utf8');

  const sorted = [...models].sort((a, b) => {
    const fa = a.family ?? '';
    const fb = b.family ?? '';
    return fa !== fb ? fa.localeCompare(fb) : a.name.localeCompare(b.name);
  });

  const rows = sorted.map(generateReadmeRow).join('\n');
  const table = `| Model | Type | Context | Max Tokens | Input Cost | Output Cost |\n|-------|------|---------|------------|------------|-------------|\n${rows}`;

  readme = readme.replace(
    /\| Model \| Type \| Context \| Max Tokens \| Input Cost \| Output Cost \|[\s\S]*?(?=\n\*Costs are per million)/,
    table
  );

  readme = readme.replace(/\*\*\d+\+ AI Models\*\*/, `**${models.length}+ AI Models**`);

  fs.writeFileSync(readmePath, readme);
  console.log(`✓ Updated README.md with ${models.length} models`);
}

async function main() {
  console.log('Fetching models from API...');

  try {
    const data = await fetchJSON(API_URL);
    const provider = data[PROVIDER_ID];

    if (!provider) {
      throw new Error(`Provider "${PROVIDER_ID}" not found in API`);
    }

    if (!provider.models) {
      throw new Error(`No models found for provider "${PROVIDER_ID}"`);
    }

    // Convert models object to array and filter out deprecated
    const upstreamModels = Object.values(provider.models).filter(m => m.status !== 'deprecated');
    console.log(`Found ${upstreamModels.length} upstream models from API`);

    let customModels = loadModels(CUSTOM_MODELS_PATH);

    // Helper to normalize cost fields on a model; returns true if changes were made
    /** @param {Model} m */
    function normalizeModelCost(m) {
      let changed = false;
      if (m.cost == null) {
        m.cost = {};
        changed = true;
      }
      if (m.cost.input == null) {
        m.cost.input = 0;
        changed = true;
      }
      if (m.cost.output == null) {
        m.cost.output = 0;
        changed = true;
      }
      if (m.cost.cache_read == null) {
        m.cost.cache_read = 0;
        changed = true;
      }
      if (m.cost.cache_write == null) {
        m.cost.cache_write = 0;
        changed = true;
      }
      return changed;
    }

    // Ensure all cost fields exist (prevents NaN in pi cost calculations)
    for (const m of upstreamModels) {
      normalizeModelCost(m);
    }
    let customModelsChanged = false;
    for (const m of customModels) {
      if (normalizeModelCost(m)) {
        customModelsChanged = true;
      }
    }

    // Find exact duplicates and conflicts
    const duplicates = findDuplicateCustomModels(upstreamModels, customModels);
    const conflicts = findConflictingCustomModels(upstreamModels, customModels);

    if (duplicates.length > 0) {
      console.log(`Found ${duplicates.length} duplicate(s) now available upstream:`);
      for (const dup of duplicates) {
        console.log(`  - ${dup.id} (${dup.name})`);
      }
      const cleaned = removeDuplicateCustomModels(customModels, duplicates);
      saveModels(CUSTOM_MODELS_PATH, cleaned);
      customModels = cleaned;
    }

    // Log warnings for conflicts (custom overrides are preserved)
    if (conflicts.length > 0) {
      console.log(`\n⚠️  Found ${conflicts.length} custom override(s) with same ID but different content:`);
      for (const conflict of conflicts) {
        console.log(`  - ${conflict.id} (${conflict.name}) - preserved as custom override`);
      }
    }

    // Persist normalized custom models if they changed but weren't saved above
    if (customModelsChanged && duplicates.length === 0) {
      saveModels(CUSTOM_MODELS_PATH, customModels);
    }

    // Save upstream models to models.json (regular models)
    saveModels(MODELS_PATH, upstreamModels);

    // Merge for README update
    const allModels = mergeModels(upstreamModels, customModels);
    console.log(`Total: ${allModels.length} models (${upstreamModels.length} regular + ${customModels.length} custom, ${allModels.length - upstreamModels.length} custom overrides)`);

    // Update README with merged models
    updateReadme(allModels);
    console.log('\nDone!');
  } catch (/** @type {any} */ error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

main();

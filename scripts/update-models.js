#!/usr/bin/env node

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

// Fetch JSON from URL
function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error(`Failed to parse JSON: ${e.message}`));
        }
      });
    }).on('error', reject);
  });
}

// Load models from JSON file
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
  } catch (error) {
    throw new Error(`Could not load ${path.basename(filePath)}: ${error.message}`);
  }
}

// Save models to JSON file
function saveModels(filePath, models) {
  fs.writeFileSync(filePath, JSON.stringify(models, null, 2) + '\n');
  console.log(`✓ Saved ${models.length} models to ${path.basename(filePath)}`);
}

function modelsAreEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function findDuplicateCustomModels(upstream, custom) {
  const byId = new Map(upstream.map(m => [m.id, m]));
  return custom.filter(m => {
    const u = byId.get(m.id);
    return u && modelsAreEqual(m, u);
  });
}

function findConflictingCustomModels(upstream, custom) {
  const byId = new Map(upstream.map(m => [m.id, m]));
  return custom.filter(m => {
    const u = byId.get(m.id);
    return u && !modelsAreEqual(m, u);
  });
}

function removeDuplicateCustomModels(custom, duplicates) {
  const ids = new Set(duplicates.map(m => m.id));
  return custom.filter(m => !ids.has(m.id));
}

function mergeModels(upstream, custom) {
  const byId = new Map();
  for (const m of upstream) byId.set(m.id, m);
  for (const m of custom) byId.set(m.id, m);
  return Array.from(byId.values());
}

function formatCost(cost) {
  if (cost == null) return '-';
  if (cost === 0) return 'Free';
  return `$${cost.toFixed(2)}`;
}

function formatNumber(num) {
  if (num == null) return '-';
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(0)}K`;
  return String(num);
}

function getInputTypes(modalities) {
  const types = modalities?.input ?? ['text'];
  const labels = [];
  if (types.includes('text')) labels.push('Text');
  if (types.includes('image')) labels.push('Image');
  if (types.includes('video')) labels.push('Video');
  return labels.join(' + ') || 'Text';
}


function generateReadmeRow(m) {
  const c = m.cost ?? {};
  const l = m.limit ?? {};
  return `| ${m.name} | ${getInputTypes(m.modalities)} | ${formatNumber(l.context)} | ${formatNumber(l.output)} | ${formatCost(c.input)} | ${formatCost(c.output)} |`;
}

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

    const customModels = loadModels(CUSTOM_MODELS_PATH);

    // Ensure all cost fields exist (prevents NaN in pi cost calculations)
    for (const m of upstreamModels) {
      m.cost ??= {};
      m.cost.input ??= 0;
      m.cost.output ??= 0;
      m.cost.cache_read ??= 0;
      m.cost.cache_write ??= 0;
    }
    for (const m of customModels) {
      m.cost ??= {};
      m.cost.input ??= 0;
      m.cost.output ??= 0;
      m.cost.cache_read ??= 0;
      m.cost.cache_write ??= 0;
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

    // Save upstream models to models.json (regular models)
    saveModels(MODELS_PATH, upstreamModels);

    // Merge for README update
    const allModels = mergeModels(upstreamModels, customModels);
    console.log(`Total: ${allModels.length} models (${upstreamModels.length} regular + ${customModels.length} custom, ${allModels.length - upstreamModels.length} custom overrides)`);

    // Update README with merged models
    updateReadme(allModels);
    console.log('\nDone!');
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

main();

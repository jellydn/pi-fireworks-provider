#!/usr/bin/env node

/**
 * Script to update fireworks models from models.dev API
 * Updates both index.ts and README.md
 */

import https from 'https';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const API_URL = 'https://models.dev/api.json';
const PROVIDER_ID = 'fireworks-ai';
const CUSTOM_MODELS_PATH = path.join(process.cwd(), 'custom-models.json');

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

// Load custom models from JSON file
function loadCustomModels() {
  try {
    if (!fs.existsSync(CUSTOM_MODELS_PATH)) {
      return [];
    }
    const data = fs.readFileSync(CUSTOM_MODELS_PATH, 'utf8');
    const models = JSON.parse(data);
    console.log(`✓ Loaded ${models.length} custom models`);
    return models;
  } catch (error) {
    console.warn('Warning: Could not load custom models:', error.message);
    return [];
  }
}

// Merge upstream and custom models (custom takes precedence on ID conflict)
function mergeModels(upstreamModels, customModels) {
  const modelMap = new Map();
  
  // Add upstream models first
  for (const model of upstreamModels) {
    modelMap.set(model.id, model);
  }
  
  // Add/override with custom models
  for (const model of customModels) {
    modelMap.set(model.id, model);
  }
  
  return Array.from(modelMap.values());
}

// Format cost for display (handles null/undefined)
function formatCost(cost) {
  if (cost === null || cost === undefined) return '-';
  if (cost === 0) return 'Free';
  return `$${cost.toFixed(2)}`;
}

// Format number with K/M suffix (handles null/undefined)
function formatNumber(num) {
  if (num === null || num === undefined) return '-';
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(0)}K`;
  return num.toString();
}

// Get input types from modalities
function getInputTypes(modalities) {
  const types = modalities?.input || ['text'];
  const hasImage = types.includes('image');
  const hasText = types.includes('text');
  
  if (hasImage && hasText) return 'Text + Image';
  if (hasImage) return 'Image';
  return 'Text';
}

// Generate model entry for index.ts
function generateModelEntry(model) {
  const inputTypes = model.modalities?.input || ['text'];
  const cost = model.cost || {};
  const limit = model.limit || {};
  
  // Handle null/undefined limits (use 0 as fallback)
  const contextWindow = limit.context ?? 0;
  const maxTokens = limit.output ?? 0;
  
  return `{
		id: "${model.id}",
		name: "${model.name}",
		reasoning: ${model.reasoning || false},
		input: ${JSON.stringify(inputTypes)},
		cost: {
			input: ${cost.input ?? 0},
			output: ${cost.output ?? 0},
			cacheRead: ${cost.cache_read ?? cost.cacheRead ?? 0},
			cacheWrite: ${cost.cache_write ?? cost.cacheWrite ?? 0},
		},
		contextWindow: ${contextWindow},
		maxTokens: ${maxTokens},
	}`;
}

// Generate index.ts content
function generateIndexTS(models) {
  const modelEntries = models.map(m => '\t\t' + generateModelEntry(m)).join(',\n');
  
  return `/**
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

export default function (pi: ExtensionAPI) {
	pi.registerProvider("fireworks", {
		baseUrl: "https://api.fireworks.ai/inference/v1",
		apiKey: "FIREWORKS_API_KEY",
		api: "openai-completions",

		models: [
${modelEntries}
		],
	});
}
`;
}

// Generate README model table row
function generateReadmeRow(model) {
  const cost = model.cost || {};
  const limit = model.limit || {};
  
  return `| ${model.name} | ${getInputTypes(model.modalities)} | ${formatNumber(limit.context)} | ${formatNumber(limit.output)} | ${formatCost(cost.input)} | ${formatCost(cost.output)} |`;
}

// Update README model table
function updateReadme(models) {
  const readmePath = path.join(process.cwd(), 'README.md');
  let readme = fs.readFileSync(readmePath, 'utf8');
  
  // Sort models by family and name
  const sortedModels = [...models].sort((a, b) => {
    const familyA = a.family || '';
    const familyB = b.family || '';
    if (familyA !== familyB) return familyA.localeCompare(familyB);
    return a.name.localeCompare(b.name);
  });
  
  // Generate table rows
  const tableRows = sortedModels.map(generateReadmeRow).join('\n');
  const newTable = `| Model | Type | Context | Max Tokens | Input Cost | Output Cost |
|-------|------|---------|------------|------------|-------------|
${tableRows}`;
  
  // Replace table in README
  const tableRegex = /\| Model \| Type \| Context \| Max Tokens \| Input Cost \| Output Cost \|[\s\S]*?(?=\n\*Costs are per million)/;
  readme = readme.replace(tableRegex, newTable);
  
  // Update model count in features
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
    
    // Load and merge custom models
    const customModels = loadCustomModels();
    const models = mergeModels(upstreamModels, customModels);
    
    console.log(`Found ${upstreamModels.length} upstream models, ${models.length} total after merge`);
    
    // Generate and write index.ts
    const indexContent = generateIndexTS(models);
    fs.writeFileSync(path.join(process.cwd(), 'index.ts'), indexContent);
    console.log('✓ Updated index.ts');
    
    // Update README
    updateReadme(models);
    
    console.log('\nDone!');
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

main();

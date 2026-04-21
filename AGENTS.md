# pi-fireworks-provider - Agent Notes

> A [pi](https://github.com/marioechr/pi) extension that registers Fireworks AI as a custom provider.

## Development Commands

```bash
# Run tests (vitest)
npm test

# Watch mode
npm run test:watch

# No build step - pi loads TypeScript directly
```

## Architecture

- **Entry:** `index.ts` - exports a default function that registers the provider via `pi.registerProvider()`
- **Models:** Loaded from two JSON files, merged at runtime:
  - `models.json` - Regular models (auto-updated from API)
  - `custom-models.json` - Custom models (manual, takes precedence on ID conflicts)
- **Types:** `types.d.ts` - pi-coding-agent type declarations (runtime dependency only available inside pi)

## Model Update Workflow

- **Script:** `scripts/update-models.js` - fetches from `https://models.dev/api.json`
- **CI:** `.github/workflows/update-models.yml` runs daily, creates PR on changes
- **Behavior:**
  - Updates `models.json` and `README.md` model table
  - Preserves `custom-models.json` (custom overrides)
  - Removes duplicates from custom when they appear upstream
  - Sorts by family, then name in README

## Adding Custom Models

Add to `custom-models.json` (not `models.json` - that's auto-generated):

```json
{
  "id": "accounts/fireworks/routers/model-name",
  "name": "Display Name",
  "reasoning": true,
  "modalities": { "input": ["text"] },
  "cost": { "input": 0.5, "output": 1.5, "cache_read": 0, "cache_write": 0 },
  "limit": { "context": 128000, "output": 8192 }
}
```

## Testing

- `index.test.ts` - Tests model transformation and merging logic
- Tests mirror the implementation (functions duplicated in test file)
- Vitest config uses default settings

## Pre-commit Hooks

```bash
pre-commit install    # One-time setup
pre-commit run --all-files  # Manual run
```

Checks:

- Trailing whitespace, EOF fixer
- JSON/YAML validity
- Prettier formatting (JSON/markdown/YAML)
- Security: blocks files containing real Fireworks API keys (`fw-...`)

## TypeScript Configuration

- Target: ES2022, NodeNext module resolution
- `noEmit: true` - pi loads TS directly, no compilation needed
- `checkJs: true` - type checks JS files too

## Security Notes

- API key format: `fw-xxxxxxxxxxxxxxxx` (checked by pre-commit)
- Example files: `.env.example`, `auth.example.json`
- Never commit real keys - pre-commit hook will block

## Repo-specific Conventions

- No `build` or `check` scripts (package.json has placeholders echoing "nothing to X")
- Model costs must always have all fields (input/output/cache_read/cache_write) to prevent NaN in pi cost calculations
- Custom models override upstream models with same ID
- Run `node scripts/update-models.js` to manually refresh models and README

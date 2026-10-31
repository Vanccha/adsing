// Node tarafı yardımcı: diskten veri paketi okur (motor dosya sistemine dokunmaz).
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseParamFile, parseScenarioFile } from '../../engine/data/schema';
import type { DataBundle, MarketId } from '../../engine/data/schema';

export const ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));

export const readJson = (path: string): unknown => JSON.parse(readFileSync(path, 'utf8'));

export function loadBundle(root: string, market: MarketId, scenario = 'salon-saas'): DataBundle {
  return {
    global: parseParamFile(readJson(join(root, 'data', 'global.json'))),
    market: parseParamFile(readJson(join(root, 'markets', `${market}.json`))),
    scenario: parseScenarioFile(readJson(join(root, 'scenarios', `${scenario}.json`))),
  };
}

export function listJson(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => join(dir, f));
}

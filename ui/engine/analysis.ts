// Sonuç analizi: motorun analyzeRun'ını oyun yapılandırmasına bağlar.
import { analyzeRun } from '@engine/analysis';
import type { AnalysisView } from '@engine/analysis';
import type { GameState } from '@engine/core';
import { makeInitial } from './jobs';
import type { GameConfig } from './jobs';

export type { AnalysisView };

export function analyze(cfg: GameConfig, finalState: GameState): AnalysisView {
  return analyzeRun((seed) => makeInitial(seed === undefined ? cfg : { ...cfg, seed }), finalState);
}

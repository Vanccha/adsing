// Veri şeması (zod): her sayı bir Param; dosya biçimi { schemaVersion, market, params[], meta }.
// Kurallar: sourced => kaynak (accessed zorunlu) + güven; derived => formül + girdiler; assumption => not (range önerilir).
import { z } from 'zod';

export const MarketIdSchema = z.enum(['global', 'us', 'de', 'tr']);
export type ParamMarket = z.infer<typeof MarketIdSchema>;
export type MarketId = Exclude<ParamMarket, 'global'>;

const DateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD bekleniyor');

export const SourceSchema = z.object({
  url: z.string().nullable().optional(),
  name: z.string().min(1),
  published: DateStr.nullable().optional(),
  accessed: DateStr, // zorunlu: eksikse denetim hatası
});
export type Source = z.infer<typeof SourceSchema>;

export const ParamValueSchema = z.union([z.number(), z.string(), z.boolean()]);
export type ParamValue = z.infer<typeof ParamValueSchema>;

export const RangeSchema = z
  .object({
    min: z.number(),
    max: z.number(),
    dist: z.enum(['uniform', 'triangular']).optional(),
  })
  .refine((r) => r.min <= r.max, 'range.min <= range.max olmalı');

export const ParamSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9_]+(\.[a-z0-9_]+)*$/i, 'nokta ayrımlı kimlik'),
    value: ParamValueSchema.optional(),
    range: RangeSchema.optional(),
    unit: z.string(),
    market: MarketIdSchema,
    layer: z.enum(['sourced', 'derived', 'assumption']),
    source: SourceSchema.nullable().optional(),
    confidence: z.enum(['low', 'medium', 'high']).optional(),
    note: z.string().optional(),
    note_i18n: z.record(z.string(), z.string()).optional(),
    formula: z.string().nullable().optional(),
    inputs: z.array(z.string()).optional(),
  })
  .superRefine((p, ctx) => {
    const add = (message: string) => ctx.addIssue({ code: 'custom', message });
    if (p.value === undefined && p.range === undefined) add('value veya range zorunlu');
    if (p.layer === 'sourced') {
      if (!p.source) add('sourced için source zorunlu');
      if (!p.confidence) add('sourced için confidence zorunlu');
    }
    if (p.layer === 'derived') {
      if (!p.formula) add('derived için formula zorunlu');
      if (!p.inputs) add('derived için inputs zorunlu (boş olabilir)');
    }
    if (p.layer === 'assumption' && !p.note) add('assumption için note (gerekçe) zorunlu');
  });
export type Param = z.infer<typeof ParamSchema>;

/** data/global.json ve markets/*.json biçimi. */
export const ParamFileSchema = z.looseObject({
  schemaVersion: z.literal(1),
  market: MarketIdSchema,
  params: z.array(ParamSchema),
  meta: z.record(z.string(), z.unknown()).optional(),
});
export type ParamFile = z.infer<typeof ParamFileSchema>;

/** scenarios/*.json: ürün parametreleri + hedefler (param listesi) + serbest meta. */
export const ScenarioFileSchema = z.looseObject({
  schemaVersion: z.literal(1),
  id: z.string(),
  market: MarketIdSchema.optional(),
  params: z.array(ParamSchema).default([]),
  meta: z.record(z.string(), z.unknown()).optional(),
});
export type ScenarioFile = z.infer<typeof ScenarioFileSchema>;

/** Pazar meta alanları (motorun okuduğu kısım; fazlası serbest). */
export interface MarketMeta {
  currency?: string;
  locale?: string;
  fxToUSD?: number;
  holidays?: Array<{ date?: string; name?: string; month?: number; day?: number } | string>;
  channels?: Record<string, unknown>;
  legal?: Record<string, unknown>;
  competitors?: unknown[];
  [k: string]: unknown;
}

export interface DataBundle {
  global: ParamFile;
  market: ParamFile;
  scenario: ScenarioFile;
}

export function parseParamFile(raw: unknown): ParamFile {
  return ParamFileSchema.parse(raw);
}
export function parseScenarioFile(raw: unknown): ScenarioFile {
  return ScenarioFileSchema.parse(raw);
}

// Vaka ve olay JSON şemaları (zod). Biçim: cases/schema.md.
import { z } from 'zod';

export const OpSchema = z.enum(['>', '>=', '<', '<=', '==', '!=']);
export type Op = z.infer<typeof OpSchema>;

const CondValue = z.union([z.number(), z.string(), z.object({ param: z.string() })]);
export const ConditionSchema = z.object({ metric: z.string(), op: OpSchema, value: CondValue });
export type Condition = z.infer<typeof ConditionSchema>;

export const TriggerSchema = z.object({
  all: z.array(ConditionSchema).optional(),
  any: z.array(ConditionSchema).optional(),
  chance: z.number().min(0).max(1).default(1),
  cooldownDays: z.number().min(0).default(0),
});
export type Trigger = z.infer<typeof TriggerSchema>;

export const EffectSchema = z.object({
  target: z.string(),
  op: z.enum(['mul', 'add', 'set']),
  value: z.union([z.number(), z.string()]),
  durationDays: z.union([z.number(), z.string()]),
});
export type Effect = z.infer<typeof EffectSchema>;

const ResponseSchema = z.object({ action: z.string(), outcome: z.string() });

export const CaseSchema = z.looseObject({
  id: z.string().regex(/^C\d{2}$/),
  slug: z.string(),
  stage: z.string(),
  markets: z.array(z.enum(['us', 'de', 'tr'])),
  trigger: TriggerSchema,
  marketOverrides: z.record(z.string(), z.object({ trigger: TriggerSchema.optional(), effects: z.array(EffectSchema).optional() })).default({}),
  effects: z.array(EffectSchema).default([]),
  symptoms: z.array(z.string()).default([]),
  correctResponses: z.array(ResponseSchema),
  wrongResponses: z.array(ResponseSchema),
  learningHint: z.string(),
  i18n: z.object({ title: z.string(), summary: z.string(), symptoms: z.string() }),
});
export type CaseDef = z.infer<typeof CaseSchema>;

export const EventSchema = z.looseObject({
  id: z.string().regex(/^E\d{2}$/),
  slug: z.string(),
  markets: z.array(z.enum(['us', 'de', 'tr'])),
  baseDailyProbability: z.object({ value: z.number().min(0).max(1) }),
  rateScale: z.string().optional(),
  conditions: z.array(ConditionSchema).default([]),
  effects: z.array(EffectSchema).default([]),
  calendar: z.object({ source: z.string(), match: z.record(z.string(), z.unknown()) }).optional(),
  i18n: z.object({ title: z.string(), text: z.string() }),
});
export type EventDef = z.infer<typeof EventSchema>;

export const EventsFileSchema = z.object({ schemaVersion: z.literal(1), events: z.array(EventSchema) });

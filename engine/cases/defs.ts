// Vaka ve olay tanımları (doğrulanmış, önbellekli). Testler için geçersiz kılınabilir.
import { CASE_I18N, RAW_CASES, RAW_EVENTS } from './raw';
import { CaseSchema, EventsFileSchema } from './schema';
import type { CaseDef, EventDef } from './schema';

let cases: CaseDef[] | null = null;
let events: EventDef[] | null = null;

export function caseDefs(): CaseDef[] {
  cases ??= RAW_CASES.map((c) => CaseSchema.parse(c));
  return cases;
}
export function eventDefs(): EventDef[] {
  events ??= EventsFileSchema.parse(RAW_EVENTS).events;
  return events;
}
export const getCase = (id: string): CaseDef | undefined => caseDefs().find((c) => c.id === id);

/** Yalnız test: tanımları değiştirir (null: varsayılana dön). */
export function overrideDefs(o: { cases?: CaseDef[] | null; events?: EventDef[] | null }): void {
  if (o.cases !== undefined) cases = o.cases;
  if (o.events !== undefined) events = o.events;
}

/** cases/i18n içindeki metinler (tr/en). Motor çevirmez; arayüz katmanı kullanır. */
export const caseI18n = CASE_I18N;

// Çekirdek tipler: GameState düz JSON'dur (sınıf/Map yok), serileştirilebilir ve derin karşılaştırılabilir.
import type { MarketId, ParamValue } from '../data/schema';
import type { ParamInfo } from '../data/resolve';

export type Mode = 'full' | 'quick';
export type Difficulty = 'easy' | 'normal' | 'hard';

/** Aday kaynağı (lead kanalı). */
export type LeadChannel = 'google' | 'meta' | 'organic' | 'gbp' | 'referral' | 'field' | 'outreach' | 'content' | 'geo';
export const LEAD_CHANNELS: readonly LeadChannel[] = ['google', 'meta', 'organic', 'gbp', 'referral', 'field', 'outreach', 'content', 'geo'];
export type PaidChannel = 'google' | 'meta';

/** Arama sorgusu sınıfı (+ marka). */
export type QueryClass = 'target' | 'neighbor' | 'irrelevant' | 'info' | 'brand';

export interface StageCounts {
  impressions: number;
  clicks: number;
  visits: number;
  leads: number;
  qualified: number;
  trials: number;
  activated: number;
  paid: number;
}
export const STAGES: readonly (keyof StageCounts)[] = ['impressions', 'clicks', 'visits', 'leads', 'qualified', 'trials', 'activated', 'paid'];

export interface StatCounter {
  n: number; // deneme sayısı
  k: number; // gerçek başarı (gizli)
  kObs: number; // oyuncunun gördüğü (takip kaybıyla) başarı
}

// ---- Gizli kaliteli nesneler ----
export interface Offer {
  id: string;
  name: string;
  kind: 'trial' | 'demo' | 'free_setup' | 'discount';
  q: number; // gizli latent (1 = pazar ortalaması)
  stats: { trial: StatCounter }; // nitelikli lead -> deneme
  availableDay: number;
}
export interface Creative {
  id: string;
  channel: PaidChannel;
  angle: string;
  bold: boolean; // abartılı iddia: CTR↑ ama hesap riski
  q: number; // gizli latent
  stats: { ctr: StatCounter }; // gösterim -> tık
  availableDay: number;
}
export interface LandingPage {
  id: string;
  style: string;
  q: number; // gizli dönüşüm latent'i
  speed: number; // gizli (0-1) hız/mobil uyumu
  stats: { cvr: StatCounter }; // ziyaret -> lead
  availableDay: number;
}

// ---- Google Ads ----
export type MatchType = 'exact' | 'phrase' | 'broad';
export type BidStrategy = 'manual' | 'maxClicks' | 'maxConversions' | 'tcpa';
export type LearningState = 'learning' | 'stable' | 'limited' | 'manual';

export interface PlatformStats {
  impressions: number;
  clicks: number;
  cost: number;
  conv: number; // platformun raporladığı dönüşüm
}
export interface GKeyword {
  id: string;
  text: string;
  theme: 'core' | 'adjacent' | 'brand';
  match: MatchType;
  bid: number | null; // null: kampanya teklifi
  status: 'active' | 'paused';
  relQ: number; // gizli alaka latent'i (0-1)
  stats: PlatformStats;
}
export interface GAdGroup {
  id: string;
  name: string;
  creativeId: string;
  keywords: GKeyword[];
}
export interface Negative {
  cls: QueryClass;
  breadth: 'narrow' | 'broad';
}
export interface SearchTermRow {
  cls: QueryClass;
  impressions: number;
  clicks: number;
  cost: number;
  conv: number;
}
export interface GDayReport {
  impressions: number;
  clicks: number;
  cost: number;
  conv: number;
  convTrue: number;
  eligible: number; // uygun arama sayısı
  isShare: number;
  isLostBudget: number;
  isLostRank: number;
  avgQs: number;
}
export interface GCampaign {
  id: string;
  name: string;
  type: 'search' | 'pmax';
  status: 'active' | 'paused';
  dailyBudget: number;
  strategy: BidStrategy;
  manualBid: number | null;
  tcpaTarget: number | null;
  lpId: string;
  offerId: string;
  adGroups: GAdGroup[];
  negatives: Negative[];
  learning: { state: LearningState; sinceReset: number; resets: number; convWindow: number[] };
  stats: PlatformStats;
  last: GDayReport | null;
  searchTerms: { day: number; rows: SearchTermRow[] } | null;
  termAcc: Record<string, SearchTermRow>; // son dönem birikimi (arama terimleri raporu için)
  createdDay: number;
}
export interface GoogleState {
  campaigns: GCampaign[];
  nextId: number;
}

// ---- Meta ----
export type AudienceKind = 'interest' | 'lookalike' | 'advantage' | 'broad';
export type MetaLearning = 'learning' | 'active' | 'limited';
export interface MAd {
  creativeId: string;
  impr7: number; // üstel ağırlıklı 7 günlük gösterim
}
export interface MAdSet {
  id: string;
  name: string;
  objective: 'leads' | 'messages';
  audience: AudienceKind;
  dailyBudget: number;
  ads: MAd[];
  lpId: string;
  offerId: string;
  status: 'active' | 'paused';
  learning: { state: MetaLearning; sinceReset: number; resets: number; events: number[] };
  stats: PlatformStats;
  last: { impressions: number; clicks: number; cost: number; conv: number; convTrue: number; frequency: number; ctrEff: number; cpm: number } | null;
  createdDay: number;
}
export interface MetaState {
  adSets: MAdSet[];
  nextId: number;
}

// ---- Yerel / ücretsiz / GEO ----
export interface LocalState {
  gbp: { claimed: boolean; score: number; reviews: number; rating: number; pending: Array<{ day: number; n: number }> };
  referral: { active: boolean; reward: number };
  content: { social: number; seo: number; seoEff: number };
  outreach: { domainHealth: number; sent30: number };
}
export interface GeoState {
  visibility: number; // v(t)
  pipeline: number[]; // gecikmeli yatırım kuyruğu (gün başına)
  observedScore: number;
}

// ---- Hesaplar, takip ----
export interface AccountState {
  health: number; // 0-1
  suspendedUntil: number | null;
  permanent: boolean;
  strikes: number;
}
export interface TrackingState {
  health: number; // etiket sağlığı 0-1 (gerçek)
  consentMode: boolean;
  serverSide: boolean;
  crmFeedback: boolean;
}

// ---- Huni / müşteri ----
export interface LeadBatch {
  day: number;
  channel: LeadChannel;
  n: number;
  qual: number; // nitelik çarpanı (ICP uyumu)
  msg: boolean;
  offerId: string;
  nonIncr: number; // artımsal olmayan (zaten gelecek) lead sayısı
  assisted: boolean;
  preQualified: boolean; // saha satışı: nitelik aşaması atlanır
  trialP: number | null; // deneme başlatma olasılığı üzerine yazma
  tauMult: number;
}
export interface TrialBatch {
  startDay: number;
  endDay: number;
  channel: LeadChannel;
  n: number;
  assisted: boolean;
  nonIncr: number;
}
export interface Cohort {
  id: number;
  startDay: number;
  n0: number;
  alive: number;
  arpa: number;
  onb: number;
  byChannel: Partial<Record<LeadChannel, number>>;
  churned: number;
}
export interface ChannelCum {
  leads: number;
  incrLeads: number;
  qualified: number;
  trials: number;
  paid: number;
  spend: number;
}
export interface FunnelState {
  queue: LeadBatch[];
  trials: TrialBatch[];
  cum: StageCounts;
  byChannel: Record<string, ChannelCum>;
}

// ---- Olaylar ----
export interface Modifier {
  id: string;
  target: string; // 'cpc' | 'cpm' | 'demand' | 'churn' | 'conv' | 'organic' ...
  kind: 'mult' | 'add';
  value: number;
  from: number;
  until: number; // hariç
  source: string;
}
export interface GameEvent {
  day: number;
  id: string;
  key: string; // i18n anahtarı
  params: Record<string, number | string>;
  tone: 'good' | 'bad' | 'info';
}

// ---- Testler ----
export interface ABTest {
  id: string;
  kind: 'lp';
  a: string;
  b: string;
  split: number;
  startDay: number;
  endDay: number;
  status: 'running' | 'done' | 'stopped';
  statsA: StatCounter;
  statsB: StatCounter;
}
export interface Holdout {
  id: string;
  channel: PaidChannel;
  share: number;
  startDay: number;
  endDay: number;
  status: 'running' | 'done' | 'stopped';
  regionNoise: number;
  controlLeads: number;
  holdoutLeads: number;
  days: number;
  reportedLeads: number; // platformun raporladığı (kontrol bölgesi)
  result: HoldoutResult | null;
}
export interface HoldoutResult {
  incrPerDay: number;
  ciLow: number;
  ciHigh: number;
  reportedPerDay: number;
  incrShare: number;
  conclusive: boolean;
}

export interface Scheduled {
  day: number;
  kind: 'tracking';
  level: 'basic' | 'consent_mode' | 'server_side' | 'crm_feedback';
}

// ---- Kayıtlar ----
export interface MrrMove {
  new: number;
  expansion: number;
  contraction: number;
  churn: number;
}
export interface DayRecord {
  day: number;
  stages: StageCounts; // günlük gerçek akışlar
  spend: Record<string, number>;
  leads: Record<string, number>; // kanal -> gerçek lead
  incrLeads: Record<string, number>;
  newCustomers: Record<string, number>;
  platformConv: Record<string, number>;
  analyticsConv: number;
  crmLeads: number;
  crmCustomers: number;
  organicBase: number;
  lpVisits: number; // yalnızca reklam LP trafiği (doğrudan lead'ler hariç)
  lpLeads: number;
  revenueNet: number;
  cashIn: number;
  cashOut: number;
  cash: number;
  mrr: number;
  mrrMove: MrrMove;
  customers: number;
  churned: number;
  trackedFraction: Record<string, number>;
  hoursUsed: number;
  hoursCapacity: number;
  queueLen: number;
}

export interface Ledger {
  revenue: number;
  vatCollected: number;
  vatRemitted: number;
  cogs: number;
  payFees: number;
  adSpend: number;
  adTax: number;
  fixed: number;
  reps: number;
  tools: number;
  actionCosts: number;
  referralRewards: number;
  incomeTax: number;
  fines: number;
}

export interface QueuedAction {
  action: Action;
  queuedDay: number;
}

export interface Founder {
  burnout: number; // 0-1
  queue: QueuedAction[];
  capacityToday: number;
  usedToday: number;
  overtimeToday: number;
  overtimeYesterday: number;
  reserved: { sales: number; onboarding: number }; // sabit günlük tahsis (saat)
  docsStock: number; // dokümantasyon/onboarding birikimi
}

export interface Goals {
  mrr: number;
  ltvCac: number;
  paybackMonths: number;
  reputationFloor: number;
}

export interface Outcome {
  status: 'lost' | 'won' | 'healthy' | 'survived' | 'stagnant';
  reason: string; // i18n anahtarı
  day: number;
  detail: Record<string, number | string>;
}

export interface DecisionEntry {
  day: number;
  action: Action;
  status: 'applied' | 'queued' | 'rejected' | 'executed_from_queue';
  reason?: string;
  fromQueue?: boolean;
}

export interface GameState {
  schemaVersion: 1;
  engineVersion: string;
  seed: string;
  scenarioId: string;
  marketId: MarketId;
  mode: Mode;
  difficulty: Difficulty;
  learningMode: boolean;
  startDate: string;
  refDate: string;
  day: number;
  horizon: number;
  currency: string;
  fxToUSD: number;
  holidays: HolidayFx[];
  seasonality: Seasonality;
  channelRel: Record<string, { access: string; relative: number }>;
  params: Record<string, ParamValue>;
  paramInfo: Record<string, ParamInfo>;
  goals: Goals;
  cash: number;
  startCash: number;
  ledger: Ledger;
  founder: Founder;
  reps: number;
  autoReply: boolean;
  product: { price: number; onboarding: number };
  reputation: number;
  accounts: { google: AccountState; meta: AccountState };
  tracking: TrackingState;
  competitorIndex: number;
  assets: { offers: Offer[]; creatives: Creative[]; lps: LandingPage[]; nextId: number };
  google: GoogleState;
  meta: MetaState;
  local: LocalState;
  geo: GeoState;
  funnel: FunnelState;
  cohorts: Cohort[];
  nextCohortId: number;
  mrr: number;
  modifiers: Modifier[];
  tests: { ab: ABTest[]; holdouts: Holdout[] };
  scheduled: Scheduled[];
  history: DayRecord[];
  decisions: DecisionEntry[];
  events: GameEvent[]; // son olaylar (kırpılır)
  outcome: Outcome | null;
}

export interface HolidayFx {
  date: string;
  endDate: string;
  salonDemand: number;
  saasBuying: number;
  closed: boolean;
}
export interface Seasonality {
  adCost: Record<string, number>;
  salonDemand: Record<string, number>;
  saasBuying: Record<string, number>;
}

// ---- Aksiyonlar ----
export interface ActionParamsMap {
  'gads.create_campaign': { name?: string; type: 'search' | 'pmax'; dailyBudget: number; strategy: BidStrategy; manualBid?: number; tcpaTarget?: number; lpId: string; offerId: string };
  'gads.add_adgroup': { campaignId: string; name?: string; creativeId: string };
  'gads.add_keywords': { campaignId: string; adGroupId: string; keywords: Array<{ text?: string; theme: 'core' | 'adjacent' | 'brand'; match: MatchType; bid?: number }> };
  'gads.set_budget': { campaignId: string; dailyBudget: number };
  'gads.set_strategy': { campaignId: string; strategy: BidStrategy; manualBid?: number; tcpaTarget?: number };
  'gads.set_keyword_bid': { campaignId: string; keywordId: string; bid: number | null };
  'gads.set_lp': { campaignId: string; lpId: string };
  'gads.set_status': { campaignId: string; status: 'active' | 'paused' };
  'gads.add_negatives': { campaignId: string; classes: QueryClass[]; breadth: 'narrow' | 'broad' };
  'gads.review_search_terms': { campaignId: string };
  'meta.create_adset': { name?: string; objective: 'leads' | 'messages'; audience: AudienceKind; dailyBudget: number; creativeIds: string[]; lpId: string; offerId: string };
  'meta.set_budget': { adSetId: string; dailyBudget: number };
  'meta.set_audience': { adSetId: string; audience: AudienceKind };
  'meta.add_creative': { adSetId: string; creativeId: string };
  'meta.remove_creative': { adSetId: string; creativeId: string };
  'meta.set_status': { adSetId: string; status: 'active' | 'paused' };
  'asset.create_offer': { kind: Offer['kind']; name?: string };
  'asset.create_creative': { channel: PaidChannel; angle?: string; bold?: boolean };
  'asset.create_lp': { style?: string };
  'asset.start_ab_test': { a: string; b: string; days: number; split: number };
  'asset.stop_ab_test': { testId: string };
  'track.fix': { level: 'basic' | 'consent_mode' | 'server_side' | 'crm_feedback' };
  'measure.start_holdout': { channel: PaidChannel; share: number; days: number };
  'measure.stop_holdout': { holdoutId: string };
  'ops.set_alloc': { sales: number; onboarding: number };
  'ops.hire_rep': Record<string, never>;
  'ops.fire_rep': Record<string, never>;
  'ops.set_price': { price: number };
  'ops.set_auto_reply': { on: boolean };
  'ops.build_docs': { hours: number };
  'local.optimize_gbp': { hours: number };
  'local.request_reviews': { count: number };
  'local.set_referral': { on: boolean; reward?: number };
  'local.field_sales': { hours: number };
  'local.cold_outreach': { kind: 'email' | 'call' | 'sms'; volume: number };
  'local.content': { kind: 'social' | 'seo'; hours: number };
  'geo.invest': { hours: number };
}
export type ActionType = keyof ActionParamsMap;
export type Action = { [K in ActionType]: { type: K; params: ActionParamsMap[K]; hours?: number } }[ActionType];
export type ActionLog = Array<{ day: number; actions: Action[] }>;

export interface ActionResult {
  action: Action;
  status: 'applied' | 'queued' | 'rejected';
  reason?: { key: string; params?: Record<string, number | string> };
}

export interface StepResult {
  state: GameState;
  events: GameEvent[];
  report: DayRecord;
  actionResults: ActionResult[];
}

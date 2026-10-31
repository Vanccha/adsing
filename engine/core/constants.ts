// Motor sabitleri: modelin YAPISAL varsayımları (pazar verisi DEĞİL). Hepsi docs/model.md'de listelidir.
// Pazara bağlı sayılar yalnızca data/markets/scenarios parametrelerinden okunur; buradakiler ince ayar katsayılarıdır.
// İlgili bir parametre kimliği verilmişse (örn. 'gads.rank.alpha') o kimlik bu sabitin üzerine yazar.

export const ENGINE_VERSION = '0.1.0';

export const K = {
  // Zaman
  weekdayShape: [0.55, 1.05, 1.1, 1.1, 1.05, 1.0, 0.65], // Pzr..Cmt talep çarpanı (ortalama ~1)
  holidayDemandMult: 0.55,

  // Sorgu sınıfları
  classCvrMult: { target: 1, neighbor: 0.35, irrelevant: 0.02, info: 0.1, brand: 2.0, social: 1 },
  classCtrMult: { target: 1, neighbor: 0.8, irrelevant: 0.5, info: 0.7, brand: 3.0, social: 1 },
  classQualMult: { target: 1, neighbor: 0.7, irrelevant: 0.3, info: 0.3, brand: 1.1, social: 1 },
  brandCpcMult: 0.35,
  matchReach: { exact: 0.35, phrase: 0.65, broad: 1.0 },
  matchNeighborShare: { exact: 0.1, phrase: 0.2, broad: 0.3 },
  leakIrrelevantShare: 0.6, // sızıntının irrelevant payı (kalanı info)
  negativeEff: { narrow: 0.6, broad: 0.95 }, // sınıf elemesi
  negativeFalsePositive: { narrow: 0, broad: 0.25 }, // aşırı negatif: hedef trafik kaybı
  negativeBlindPenalty: 0.7, // arama terimleri raporu incelenmediyse etkinlik çarpanı

  // Arama hacimleri (kişi/gün, salon_count başına) — yapısal varsayım
  volCorePerSalon: 0.004,
  volAdjacentPerSalon: 0.02,
  volBrandBase: 0.0005,

  // Ad Rank
  rankAlpha: 1.0,
  qsRef: 5.5,
  rankMedianRatio: 1.25,
  rankSigmaBase: 0.3,
  rankSigmaComp: 0.3,
  qsWeights: { eCtr: 0.4, rel: 0.35, lp: 0.25 },
  autoBidBase: 1.35,
  smartIota: { stable: 0.85, learning: 0.3, limited: 0.45, manual: 0 },
  smartNoise: { stable: 0.05, learning: 0.25, limited: 0.15, manual: 0 },
  googleResetBudgetChange: 0.2,
  googleResetTargetChange: 0.15,
  impressionDispersion: 40, // NegBin r (büyük = Poisson'a yakın)
  pmaxReach: 1.2,
  pmaxClassMix: { target: 0.35, neighbor: 0.2, irrelevant: 0.25, info: 0.2 },
  pmaxBrandCapture: 0.35,
  pmaxCtrMult: 0.9,
  brandNonIncr: 0.8,
  searchNonIncr: 0.1,

  // Meta
  audienceReach: { interest: 0.2, lookalike: 0.12, advantage: 0.6, broad: 0.5 }, // salon_count payı
  audienceCvrMult: { interest: 1, lookalike: 1, advantage: 1, broad: 0.85 },
  audienceCpmMult: { interest: 1.1, lookalike: 1.15, advantage: 0.95, broad: 0.85 },
  audienceNonIncr: { interest: 0.12, lookalike: 0.15, advantage: 0.3, broad: 0.1 },
  metaLearnCpm: { learning: 1.1, active: 1, limited: 1.25 },
  metaLearnCvr: { learning: 0.9, active: 1, limited: 0.85 },
  metaLearnDelivery: { learning: 0.95, active: 1, limited: 0.85 },
  metaResetBudgetChange: 0.2,
  metaFreqCpmSlope: 0.15,
  metaMessageCvrMult: { whatsapp: 1.5, messenger: 1.15, form: 1 }, // motor varsayımı; pazar parametresi 'meta.msg.mult' ezer
  metaMessageTauMult: 0.5,
  metaMessageQualMult: 0.85,

  // Huni
  loadRateBase: 0.8,
  loadRateSpeed: 0.15,
  maxLeadWaitDays: 10,
  contactP0: 0.92,
  baseResponseHours: 6,
  autoReplyResponseHours: 1,
  hoursPerLead: 0.4,
  repLeadsPerDay: 12,
  act0: 0.7,
  trialDaysDefault: 14,
  channelQual: { google: 1, meta: 0.85, organic: 1, gbp: 1.05, referral: 1.3, field: 1.4, outreach: 0.7, content: 1, geo: 0.9 },

  // Churn / MRR
  earlyChurnBoost: 1.5,
  earlyChurnTauMonths: 2,
  onbChurnA: 1.45,
  onbChurnB: 0.9,
  expansionMonthly: 0.008,
  contractionMonthly: 0.004,
  payFailRate: 0.03,
  dunningRecover: 0.6,

  // Onboarding
  onbStart: 0.5,
  onbBase: 0.25,
  onbGain: 0.6,
  onbHalfHours: 1.0,
  onbRate: 0.05,
  docsDecay: 0.002,
  docsMax: 0.15,
  docsPerHour: 0.02,

  // Kurucu
  burnoutGain: 0.02,
  burnoutRecover: 0.03,
  burnoutHigh: 0.9,
  burnoutLow: 0.6,
  burnoutEffect: 0.4,
  queueMaxDays: 7,

  // Kalite latent (Beta(a,a)); q = 2θ
  latentBetaA: 5,
  boldQMult: 1.12,
  boldPolicyRisk: 0.004, // günlük hesap sağlığı kaybı olasılığı (abartılı iddia)
  priorStrength: 30,
  ciLevel: 0.9,
  minN: 100,
  minCiRelWidth: 0.8,

  // Yerel/ücretsiz
  organicPerSalon: 1.5e-5,
  organicAwarenessGain: 3,
  awarenessScale: 20,
  gbpScorePerHour: 0.08,
  gbpDecay: 0.001,
  reviewArrivalRate: 0.15,
  reviewMax: 60,
  referralBaseline: 0.4,
  fieldVisitsPerHour: 0.5,
  fieldAssistedBoost: 1.2,
  outreachYield: { allowed: 0.02, restricted: 0.008, banned: 0.003 },
  outreachPerHour: 40,
  outreachRepHit: { allowed: 0, restricted: 0.01, banned: 0.04 },
  outreachFineProb: { allowed: 0, restricted: 0.003, banned: 0.02 },
  contentSocialPerHour: 0.02,
  contentSeoPerHour: 0.01,
  contentSeoLag: 0.97,
  contentDecay: 0.003,
  contentLeadsPerPoint: 0.5,
  geoLagDays: 30,
  geoGainPerHour: 0.01,
  geoDecay: 0.004,
  geoLeadsAtFull: 1.2,

  // Hesap sağlığı / itibar
  accountHealthRecover: 0.002,
  suspendHealth: 0.2,
  suspendDays: 10,
  repRecover: 0.001,

  // Finans varsayılanları (senaryo parametresi yoksa)
  // Aylık fiyatın katı olarak ifade edilir (pazar para biriminden bağımsız); senaryo parametresi (cost.*) varsa o kullanılır.
  fixedMonthlyPriceMult: 15,
  repMonthlyPriceMult: 30,
  autoReplyMonthlyPriceMult: 0.6,
  serverSidePriceMult: 4,
  crmFeedbackPriceMult: 2,
  startCashPriceMult: 400,
  creativePriceMult: 1,
  lpPriceMult: 3,
  founderHourValuePriceMult: 0.4,
  grossMarginDefault: 0.8,

  // Olay oranları (günlük)
  ev: {
    trackingBreak: 0.004,
    bidSurge: 0.006,
    priceCut: 0.003,
    policyReview: 0.003,
    downturn: 0.002,
    demandBoost: 0.004,
    paymentSurprise: 0.003,
    geoUpdate: 0.004,
    viralMention: 0.002,
    productBug: 0.002,
  },
  difficultyBadMult: { easy: 0.6, normal: 1, hard: 1.4 },

  // Ölçüm
  platformCrmMissRate: 0.05,
  crmDelayDays: 2,
  crmAttribAccuracy: 0.8,
  consentRecoveryDefault: 0.5,
  serverSideRecovery: 0.5,
  iosShareDefault: 0.5,
  analyticsNoise: 0.03,
} as const;

export type ClassKey = keyof typeof K.classCvrMult;

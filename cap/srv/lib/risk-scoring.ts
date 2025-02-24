/**
 * Supplier risk scoring.
 *
 * Produces a score from 0 (no concerns) to 100 (do not order here) and folds
 * it into the three risk classes the approval matrix works with. The score is
 * a weighted sum of five indicators that a procurement organisation typically
 * has available in or next to S/4HANA:
 *
 *   | Indicator                  | Weight | Source                                   |
 *   |----------------------------|--------|------------------------------------------|
 *   | Financial rating           |  40 %  | external rating agency feed              |
 *   | On time delivery rate      |  25 %  | purchase order history (confirmed vs GR) |
 *   | Quality incidents 12 months|  20 %  | QM notifications of type Q2/Q3           |
 *   | Country risk               |  10 %  | OECD country risk category (compliance)  |
 *   | ISO 9001 certification     |   5 %  | supplier self disclosure                 |
 *
 * The module is deliberately free of any `cds` import: the rating and country
 * risk tables live in the database, the caller resolves them and passes plain
 * numbers in. That keeps the rules unit testable without a database and lets
 * the identical rule set be re-implemented in ABAP (ZCL_PR_RISK_SCORING).
 */

/** The three risk classes, worst last. */
export const RISK_CLASSES = ['A', 'B', 'C'] as const;

/** 'A' low, 'B' medium, 'C' high. */
export type RiskClass = (typeof RISK_CLASSES)[number];

/** Name of one scoring indicator, used as the key in the breakdown. */
export type Indicator =
  | 'financialRating'
  | 'onTimeDelivery'
  | 'qualityIncidents'
  | 'countryRisk'
  | 'certification'
  | 'purchasingBlock';

/** Indicators of one supplier, with the customizing already resolved. */
export interface SupplierRiskProfile {
  /** Purchasing block from the backend. Overrules every other indicator. */
  isBlocked?: boolean | null;
  /** 0..100, resolved from the FinancialRatings code list. */
  financialRatingPoints?: number | null;
  /** 0..100, resolved from the CountryRisks code list. */
  countryRiskPoints?: number | null;
  /** Share of purchase order items delivered on time, 0..1. */
  onTimeDeliveryRate?: number | string | null;
  /** Absolute count of quality notifications in the last 12 months. */
  qualityIncidents12M?: number | null;
  isoCertified?: boolean | null;
}

/** One line of the explanation shown next to the score. */
export interface BreakdownLine {
  indicator: Indicator;
  weight: number;
  points: number;
  contribution: number;
}

export interface RiskAssessment {
  /** 0..100, rounded to an integer. */
  score: number;
  riskClass: RiskClass;
  /** True if the score was forced by a purchasing block. */
  blocked: boolean;
  breakdown: BreakdownLine[];
}

/** Relative weight of each indicator. Must add up to 1. */
export const WEIGHTS = {
  financialRating: 0.4,
  onTimeDelivery: 0.25,
  qualityIncidents: 0.2,
  countryRisk: 0.1,
  certification: 0.05
} as const satisfies Record<string, number>;

/** Upper bound (exclusive) of each risk class, walked from best to worst. */
export const RISK_CLASS_THRESHOLDS: ReadonlyArray<{ maxScore: number; riskClass: RiskClass }> = [
  { maxScore: 25, riskClass: 'A' },
  { maxScore: 55, riskClass: 'B' },
  { maxScore: Infinity, riskClass: 'C' }
];

/**
 * Assumptions for indicators that are not maintained yet. They are
 * deliberately pessimistic: an unknown supplier is not a good supplier.
 */
export const DEFAULTS = {
  /** Same penalty as a "B" rating - highly speculative. */
  unratedFinancialPoints: 50,
  /** Slightly worse than the median OECD category. */
  unknownCountryPoints: 50,
  /** New suppliers have no delivery history; assume 80 % on time. */
  onTimeDeliveryRate: 0.8
} as const;

/** Number of quality incidents that on its own maxes out the quality indicator. */
export const QUALITY_INCIDENTS_AT_MAX = 8;

/** Score assigned to a supplier that carries a purchasing block. */
export const BLOCKED_SCORE = 100;

/** Clamps a value into [min, max]. Non-finite input collapses to `min`. */
function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(Math.max(value, min), max);
}

/** Reads an optional numeric indicator, falling back to a documented default. */
function pointsOrDefault(value: number | string | null | undefined, fallback: number): number {
  if (value === null || value === undefined) return fallback;
  const num = Number(value);
  return Number.isFinite(num) ? clamp(num, 0, 100) : fallback;
}

function financialRatingPoints(profile: SupplierRiskProfile): number {
  return pointsOrDefault(profile.financialRatingPoints, DEFAULTS.unratedFinancialPoints);
}

function onTimeDeliveryPoints(profile: SupplierRiskProfile): number {
  const rate = profile.onTimeDeliveryRate;
  const num = rate === null || rate === undefined ? Number.NaN : Number(rate);
  const effective = Number.isFinite(num) ? clamp(num, 0, 1) : DEFAULTS.onTimeDeliveryRate;
  return (1 - effective) * 100;
}

function qualityPoints(profile: SupplierRiskProfile): number {
  const incidents = clamp(Number(profile.qualityIncidents12M ?? 0), 0, Number.MAX_SAFE_INTEGER);
  return clamp((incidents / QUALITY_INCIDENTS_AT_MAX) * 100, 0, 100);
}

function countryPoints(profile: SupplierRiskProfile): number {
  return pointsOrDefault(profile.countryRiskPoints, DEFAULTS.unknownCountryPoints);
}

/** All or nothing: a supplier is certified or it is not. */
function certificationPoints(profile: SupplierRiskProfile): number {
  return profile.isoCertified ? 0 : 100;
}

/** Calculates the weighted risk score of a supplier. */
export function assessSupplier(profile: SupplierRiskProfile = {}): RiskAssessment {
  if (profile.isBlocked) {
    return {
      score: BLOCKED_SCORE,
      riskClass: 'C',
      blocked: true,
      breakdown: [
        { indicator: 'purchasingBlock', weight: 1, points: BLOCKED_SCORE, contribution: BLOCKED_SCORE }
      ]
    };
  }

  const breakdown: BreakdownLine[] = (
    [
      { indicator: 'financialRating', weight: WEIGHTS.financialRating, points: financialRatingPoints(profile) },
      { indicator: 'onTimeDelivery', weight: WEIGHTS.onTimeDelivery, points: onTimeDeliveryPoints(profile) },
      { indicator: 'qualityIncidents', weight: WEIGHTS.qualityIncidents, points: qualityPoints(profile) },
      { indicator: 'countryRisk', weight: WEIGHTS.countryRisk, points: countryPoints(profile) },
      { indicator: 'certification', weight: WEIGHTS.certification, points: certificationPoints(profile) }
    ] satisfies Array<Omit<BreakdownLine, 'contribution'>>
  ).map((entry) => ({ ...entry, contribution: entry.weight * entry.points }));

  const raw = breakdown.reduce((sum, entry) => sum + entry.contribution, 0);
  const score = Math.round(clamp(raw, 0, 100));

  return { score, riskClass: deriveRiskClass(score), blocked: false, breakdown };
}

/** Maps a risk score onto a risk class. */
export function deriveRiskClass(score: number): RiskClass {
  const value = clamp(Number(score), 0, 100);
  // The last tier carries Infinity, so find() always hits - but TypeScript
  // cannot know that, and a non-null assertion would hide a real bug if the
  // table were ever edited down to nothing.
  const tier = RISK_CLASS_THRESHOLDS.find((entry) => value < entry.maxScore);
  return tier?.riskClass ?? 'C';
}

/** Type guard for values coming out of the database as plain strings. */
function isRiskClass(code: unknown): code is RiskClass {
  return typeof code === 'string' && (RISK_CLASSES as readonly string[]).includes(code);
}

/**
 * Returns the worst (highest) of a list of risk classes.
 * A requisition inherits the worst risk class of all its item suppliers.
 *
 * @returns the worst class, or null if nothing usable was passed
 */
export function worstRiskClass(riskClasses: ReadonlyArray<string | null | undefined>): RiskClass | null {
  const known = (riskClasses ?? []).filter(isRiskClass);
  if (known.length === 0) return null;
  return known.reduce<RiskClass>(
    (worst, code) => (RISK_CLASSES.indexOf(code) > RISK_CLASSES.indexOf(worst) ? code : worst),
    'A'
  );
}

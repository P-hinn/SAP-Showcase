'use strict';

/**
 * Supplier risk scoring.
 *
 * Produces a score from 0 (no concerns) to 100 (do not order here) and folds it
 * into the three risk classes the approval matrix works with. The score is a
 * weighted sum of five indicators that a procurement organisation typically has
 * available in or next to S/4HANA:
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

/** Relative weight of each indicator. Must add up to 1. */
const WEIGHTS = Object.freeze({
  financialRating: 0.40,
  onTimeDelivery: 0.25,
  qualityIncidents: 0.20,
  countryRisk: 0.10,
  certification: 0.05
});

/** Upper bound (exclusive) of each risk class, walked from best to worst. */
const RISK_CLASS_THRESHOLDS = Object.freeze([
  { maxScore: 25, riskClass: 'A' },
  { maxScore: 55, riskClass: 'B' },
  { maxScore: Infinity, riskClass: 'C' }
]);

/**
 * Assumptions for indicators that are not maintained yet. They are deliberately
 * pessimistic: an unknown supplier is not a good supplier.
 */
const DEFAULTS = Object.freeze({
  /** Same penalty as a "B" rating - highly speculative. */
  unratedFinancialPoints: 50,
  /** Slightly worse than the median OECD category. */
  unknownCountryPoints: 50,
  /** New suppliers have no delivery history; assume 80 % on time. */
  onTimeDeliveryRate: 0.8
});

/** Number of quality incidents that on its own maxes out the quality indicator. */
const QUALITY_INCIDENTS_AT_MAX = 8;

/** Score assigned to a supplier that carries a purchasing block. */
const BLOCKED_SCORE = 100;

/**
 * @typedef {object} SupplierRiskProfile
 * @property {boolean} [isBlocked]           purchasing block from the backend
 * @property {number}  [financialRatingPoints] 0..100, resolved from FinancialRatings
 * @property {number}  [countryRiskPoints]   0..100, resolved from CountryRisks
 * @property {number}  [onTimeDeliveryRate]  0..1
 * @property {number}  [qualityIncidents12M] absolute count, >= 0
 * @property {boolean} [isoCertified]
 */

/**
 * @typedef {object} RiskAssessment
 * @property {number} score       0..100, rounded to an integer
 * @property {string} riskClass   'A' | 'B' | 'C'
 * @property {boolean} blocked    true if the score was forced by a purchasing block
 * @property {Array<{indicator: string, weight: number, points: number, contribution: number}>} breakdown
 */

/** Clamps a value into [min, max]. */
function clamp(value, min, max) {
  if (!Number.isFinite(value)) return min;
  return Math.min(Math.max(value, min), max);
}

/** Penalty points for the financial rating indicator. */
function financialRatingPoints(profile) {
  const points = profile.financialRatingPoints;
  if (points === null || points === undefined || !Number.isFinite(Number(points))) {
    return DEFAULTS.unratedFinancialPoints;
  }
  return clamp(Number(points), 0, 100);
}

/** Penalty points for the delivery reliability indicator. */
function onTimeDeliveryPoints(profile) {
  const rate = profile.onTimeDeliveryRate;
  const effective = (rate === null || rate === undefined || !Number.isFinite(Number(rate)))
    ? DEFAULTS.onTimeDeliveryRate
    : clamp(Number(rate), 0, 1);
  return (1 - effective) * 100;
}

/** Penalty points for the quality indicator. */
function qualityPoints(profile) {
  const incidents = clamp(Number(profile.qualityIncidents12M ?? 0), 0, Number.MAX_SAFE_INTEGER);
  return clamp((incidents / QUALITY_INCIDENTS_AT_MAX) * 100, 0, 100);
}

/** Penalty points for the country risk indicator. */
function countryPoints(profile) {
  const points = profile.countryRiskPoints;
  if (points === null || points === undefined || !Number.isFinite(Number(points))) {
    return DEFAULTS.unknownCountryPoints;
  }
  return clamp(Number(points), 0, 100);
}

/** Penalty points for the certification indicator: all or nothing. */
function certificationPoints(profile) {
  return profile.isoCertified ? 0 : 100;
}

/**
 * Calculates the weighted risk score of a supplier.
 *
 * @param {SupplierRiskProfile} profile
 * @returns {RiskAssessment}
 */
function assessSupplier(profile = {}) {
  if (profile.isBlocked) {
    return {
      score: BLOCKED_SCORE,
      riskClass: 'C',
      blocked: true,
      breakdown: [{
        indicator: 'purchasingBlock',
        weight: 1,
        points: BLOCKED_SCORE,
        contribution: BLOCKED_SCORE
      }]
    };
  }

  const indicators = [
    { indicator: 'financialRating', weight: WEIGHTS.financialRating, points: financialRatingPoints(profile) },
    { indicator: 'onTimeDelivery', weight: WEIGHTS.onTimeDelivery, points: onTimeDeliveryPoints(profile) },
    { indicator: 'qualityIncidents', weight: WEIGHTS.qualityIncidents, points: qualityPoints(profile) },
    { indicator: 'countryRisk', weight: WEIGHTS.countryRisk, points: countryPoints(profile) },
    { indicator: 'certification', weight: WEIGHTS.certification, points: certificationPoints(profile) }
  ].map((entry) => ({ ...entry, contribution: entry.weight * entry.points }));

  const raw = indicators.reduce((sum, entry) => sum + entry.contribution, 0);
  const score = Math.round(clamp(raw, 0, 100));

  return {
    score,
    riskClass: deriveRiskClass(score),
    blocked: false,
    breakdown: indicators
  };
}

/**
 * Maps a risk score onto a risk class.
 * @param {number} score 0..100
 * @returns {string} 'A' | 'B' | 'C'
 */
function deriveRiskClass(score) {
  const value = clamp(Number(score), 0, 100);
  return RISK_CLASS_THRESHOLDS.find((tier) => value < tier.maxScore).riskClass;
}

/**
 * Returns the worst (highest) of a list of risk classes.
 * A requisition inherits the worst risk class of all its item suppliers.
 *
 * @param {string[]} riskClasses
 * @returns {string|null} 'A' | 'B' | 'C', or null if the list is empty
 */
function worstRiskClass(riskClasses) {
  const order = ['A', 'B', 'C'];
  const known = (riskClasses || []).filter((code) => order.includes(code));
  if (known.length === 0) return null;
  return known.reduce((worst, code) => (order.indexOf(code) > order.indexOf(worst) ? code : worst), 'A');
}

module.exports = {
  WEIGHTS,
  RISK_CLASS_THRESHOLDS,
  DEFAULTS,
  QUALITY_INCIDENTS_AT_MAX,
  BLOCKED_SCORE,
  assessSupplier,
  deriveRiskClass,
  worstRiskClass
};

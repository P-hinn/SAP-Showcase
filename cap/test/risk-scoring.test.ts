import {
  WEIGHTS,
  assessSupplier,
  deriveRiskClass,
  worstRiskClass,
  QUALITY_INCIDENTS_AT_MAX,
  BLOCKED_SCORE,
  DEFAULTS,
  type RiskClass,
  type SupplierRiskProfile
} from '../srv/lib/risk-scoring';

/** A supplier with no concerns at all - the baseline for the weight tests. */
const perfect: SupplierRiskProfile = {
  financialRatingPoints: 0,
  countryRiskPoints: 0,
  onTimeDeliveryRate: 1,
  qualityIncidents12M: 0,
  isoCertified: true
};

describe('risk scoring', () => {
  it('has weights that add up to exactly 1', () => {
    const total = Object.values(WEIGHTS).reduce((sum, weight) => sum + weight, 0);
    expect(total).toBeCloseTo(1, 10);
  });

  it('scores a flawless supplier with 0 and class A', () => {
    const assessment = assessSupplier(perfect);
    expect(assessment.score).toBe(0);
    expect(assessment.riskClass).toBe('A');
    expect(assessment.blocked).toBe(false);
  });

  it('scores a worst case supplier with 100 and class C', () => {
    const assessment = assessSupplier({
      financialRatingPoints: 100,
      countryRiskPoints: 100,
      onTimeDeliveryRate: 0,
      qualityIncidents12M: 20,
      isoCertified: false
    });
    expect(assessment.score).toBe(100);
    expect(assessment.riskClass).toBe('C');
  });

  describe('indicator weights', () => {
    it.each<[string, SupplierRiskProfile, number]>([
      ['financialRating', { ...perfect, financialRatingPoints: 100 }, 40],
      ['onTimeDelivery', { ...perfect, onTimeDeliveryRate: 0 }, 25],
      ['qualityIncidents', { ...perfect, qualityIncidents12M: QUALITY_INCIDENTS_AT_MAX }, 20],
      ['countryRisk', { ...perfect, countryRiskPoints: 100 }, 10],
      ['certification', { ...perfect, isoCertified: false }, 5]
    ])('a maxed out %s indicator contributes %i points', (_indicator, profile, expected) => {
      expect(assessSupplier(profile).score).toBe(expected);
    });
  });

  it('caps the quality indicator once the incident threshold is passed', () => {
    const atMax = assessSupplier({ ...perfect, qualityIncidents12M: QUALITY_INCIDENTS_AT_MAX });
    const wayOver = assessSupplier({ ...perfect, qualityIncidents12M: 500 });
    expect(wayOver.score).toBe(atMax.score);
  });

  describe('values as the database hands them over', () => {
    // Decimal columns come back as strings from several database drivers, so
    // the scoring has to cope with '0.8400' as well as with 0.84.
    it('accepts a decimal string for the delivery rate', () => {
      const asString = assessSupplier({ ...perfect, onTimeDeliveryRate: '0.5000' });
      const asNumber = assessSupplier({ ...perfect, onTimeDeliveryRate: 0.5 });
      expect(asString.score).toBe(asNumber.score);
      expect(asString.score).toBe(13); // 0.25 * 50 = 12.5, rounded
    });

    it('falls back to the documented default for an unparsable delivery rate', () => {
      const broken = assessSupplier({ ...perfect, onTimeDeliveryRate: 'n/a' });
      const defaulted = assessSupplier({ ...perfect, onTimeDeliveryRate: DEFAULTS.onTimeDeliveryRate });
      expect(broken.score).toBe(defaulted.score);
    });

    it('clamps indicators that arrive out of range', () => {
      expect(assessSupplier({ ...perfect, financialRatingPoints: 150 }).score).toBe(40);
      expect(assessSupplier({ ...perfect, countryRiskPoints: -20 }).score).toBe(0);
      expect(assessSupplier({ ...perfect, onTimeDeliveryRate: 5 }).score).toBe(0);
    });

    it('treats a NaN incident count as none', () => {
      expect(assessSupplier({ ...perfect, qualityIncidents12M: Number.NaN }).score).toBe(0);
    });
  });

  describe('missing data', () => {
    it('treats an unrated supplier like a B rating', () => {
      const unrated = assessSupplier({ ...perfect, financialRatingPoints: undefined });
      const ratedB = assessSupplier({ ...perfect, financialRatingPoints: 50 });
      expect(unrated.score).toBe(ratedB.score);
    });

    it('never scores an incomplete profile better than a complete one', () => {
      const empty = assessSupplier({});
      const complete = assessSupplier(perfect);
      expect(empty.score).toBeGreaterThan(complete.score);
    });

    it('survives a missing profile entirely', () => {
      expect(() => assessSupplier()).not.toThrow();
    });
  });

  describe('purchasing block', () => {
    it('overrules every other indicator', () => {
      const assessment = assessSupplier({ ...perfect, isBlocked: true });
      expect(assessment.score).toBe(BLOCKED_SCORE);
      expect(assessment.riskClass).toBe('C');
      expect(assessment.blocked).toBe(true);
    });
  });

  describe('deriveRiskClass', () => {
    it.each<[number, RiskClass]>([
      [0, 'A'], [24, 'A'],
      [25, 'B'], [54, 'B'],
      [55, 'C'], [100, 'C']
    ])('maps score %i to class %s', (score, expected) => {
      expect(deriveRiskClass(score)).toBe(expected);
    });

    it('clamps out of range input', () => {
      expect(deriveRiskClass(-10)).toBe('A');
      expect(deriveRiskClass(999)).toBe('C');
    });
  });

  describe('worstRiskClass', () => {
    it.each<[Array<string | null | undefined>, RiskClass]>([
      [['A', 'B', 'C'], 'C'],
      [['A', 'A'], 'A'],
      [['B', 'A'], 'B'],
      [['A', null, undefined], 'A']
    ])('reduces %j to %s', (input, expected) => {
      expect(worstRiskClass(input)).toBe(expected);
    });

    it('returns null when nothing is known', () => {
      expect(worstRiskClass([])).toBeNull();
      expect(worstRiskClass([null, undefined])).toBeNull();
      expect(worstRiskClass(['not a risk class'])).toBeNull();
    });

    it('survives a missing list', () => {
      expect(worstRiskClass(undefined as unknown as string[])).toBeNull();
    });
  });

  it('explains the score through the breakdown', () => {
    const assessment = assessSupplier({ ...perfect, financialRatingPoints: 100 });
    const financial = assessment.breakdown.find((entry) => entry.indicator === 'financialRating');
    expect(financial).toMatchObject({ weight: 0.4, points: 100, contribution: 40 });
    const sum = assessment.breakdown.reduce((total, entry) => total + entry.contribution, 0);
    expect(Math.round(sum)).toBe(assessment.score);
  });
});

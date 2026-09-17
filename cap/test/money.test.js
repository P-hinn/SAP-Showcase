'use strict';

const { toMinorUnits, fromMinorUnits, roundCurrency, lineAmount, sumAmounts } = require('../srv/lib/money');

describe('money', () => {
  describe('toMinorUnits', () => {
    it.each([
      [0, 0],
      [1, 100],
      [24999.99, 2499999],
      ['1234.56', 123456],
      // The reason this module exists: a float that is a hair below the
      // threshold must still round to the threshold in cents.
      [24999.999999999996, 2500000]
    ])('converts %p to %p cents', (input, expected) => {
      expect(toMinorUnits(input)).toBe(expected);
    });

    it.each([null, undefined, NaN, 'not a number'])('treats %p as zero', (input) => {
      expect(toMinorUnits(input)).toBe(0);
    });
  });

  describe('roundCurrency', () => {
    it('rounds an exact half away from zero', () => {
      // These literals are exactly representable in binary, so the half really
      // is a half and Math.round takes it up.
      expect(roundCurrency(0.125)).toBe(0.13);
      expect(roundCurrency(0.135)).toBe(0.14);
      expect(roundCurrency(2.675)).toBe(2.68);
    });

    it('documents that a decimal "half" is often not a binary half', () => {
      // 1.005 is stored as 1.00499999999999989..., so scaling it gives
      // 100.4999... and commercial rounding takes it DOWN. ABAP's packed
      // numbers would round it up, because they are exact in base 10.
      // This is a real difference between the two implementations and it is
      // written down here on purpose rather than hidden.
      // See docs/adr/0004-money-handling.md.
      expect(roundCurrency(1.005)).toBe(1.0);
      expect(roundCurrency(1.015)).toBe(1.01);
      expect(roundCurrency(1.025)).toBe(1.02);
    });

    it('round trips through minor units', () => {
      expect(fromMinorUnits(toMinorUnits(99.99))).toBe(99.99);
    });
  });

  describe('lineAmount', () => {
    it('rounds once, at the end', () => {
      expect(lineAmount(3, 1.115)).toBe(3.35);
    });

    it('handles the decimal strings the database returns', () => {
      expect(lineAmount('2000.000', '2.40')).toBe(4800);
    });

    it('returns zero for unusable input', () => {
      expect(lineAmount(undefined, 5)).toBe(0);
      expect(lineAmount(5, null)).toBe(0);
    });
  });

  describe('sumAmounts', () => {
    it('does not accumulate floating point error', () => {
      expect(sumAmounts([0.1, 0.2, 0.3])).toBe(0.6);
      expect(0.1 + 0.2 + 0.3).not.toBe(0.6); // guards the premise of the test above
    });

    it('sums an empty list to zero', () => {
      expect(sumAmounts([])).toBe(0);
    });

    it('sums 1000 cents exactly', () => {
      expect(sumAmounts(Array(1000).fill(0.01))).toBe(10);
    });
  });
});

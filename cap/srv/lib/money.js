'use strict';

/**
 * Money helpers.
 *
 * Amounts arrive from the database as JavaScript numbers. Comparing them
 * directly against threshold values (`value >= 25000`) is a classic source of
 * off-by-one-cent bugs, because 24999.999999999996 is a perfectly normal result
 * of a floating point multiplication. Every comparison and every rounding in
 * this project therefore goes through the helpers below, which work on integer
 * minor units ("cents").
 *
 * The ABAP counterpart does not need this: ABAP's packed numbers (DECFLOAT /
 * TYPE p) are exact for currency amounts. See docs/adr/0004-money-handling.md.
 */

/** Minor units per major unit. All currencies in this demo landscape have 2. */
const MINOR_UNITS = 100;

/**
 * Converts an amount into integer minor units.
 * @param {number|string|null|undefined} value
 * @returns {number} the amount in cents, 0 for null/undefined/NaN input
 */
function toMinorUnits(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  return Math.round(num * MINOR_UNITS);
}

/**
 * Converts integer minor units back into a major unit amount.
 * @param {number} minorUnits
 * @returns {number}
 */
function fromMinorUnits(minorUnits) {
  return minorUnits / MINOR_UNITS;
}

/**
 * Commercial rounding of an amount to 2 decimals.
 * @param {number|string|null|undefined} value
 * @returns {number}
 */
function roundCurrency(value) {
  return fromMinorUnits(toMinorUnits(value));
}

/**
 * Multiplies a quantity with a unit price and rounds the result the way SAP
 * does for item net values: round once, at the end.
 * @param {number|string} quantity
 * @param {number|string} unitPrice
 * @returns {number}
 */
function lineAmount(quantity, unitPrice) {
  const qty = Number(quantity);
  const price = Number(unitPrice);
  if (!Number.isFinite(qty) || !Number.isFinite(price)) return 0;
  return roundCurrency(qty * price);
}

/**
 * Exact sum of a list of amounts. Sums in minor units to avoid accumulating
 * floating point error across many items.
 * @param {Array<number|string>} amounts
 * @returns {number}
 */
function sumAmounts(amounts) {
  const total = amounts.reduce((acc, amount) => acc + toMinorUnits(amount), 0);
  return fromMinorUnits(total);
}

module.exports = {
  MINOR_UNITS,
  toMinorUnits,
  fromMinorUnits,
  roundCurrency,
  lineAmount,
  sumAmounts
};

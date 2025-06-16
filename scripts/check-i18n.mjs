#!/usr/bin/env node
/*
 * Checks that every text exists in both languages, with the same placeholders.
 *
 * A missing German label does not break a build, a test or a type check - it
 * shows up in front of a customer as an English word in a German screen. So it
 * gets its own check, and CI runs it.
 *
 * Usage: node scripts/check-i18n.mjs
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Bundle folders to check: every *.properties in them is a base file with a _de sibling. */
const BUNDLE_DIRS = ['cap/_i18n', 'cap/app/shared/i18n', 'cap/app/purchase-requisitions/webapp/i18n', 'cap/app/approvals/webapp/i18n', 'cap/app/suppliers/webapp/i18n'];

/** key=value, ignoring comments and blank lines. */
function readProperties(file) {
  const entries = new Map();
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const separator = trimmed.indexOf('=');
    if (separator < 0) continue;
    entries.set(trimmed.slice(0, separator).trim(), trimmed.slice(separator + 1));
  }
  return entries;
}

const placeholders = (text) => [...(text.match(/\{\d+\}/g) ?? [])].sort().join(',');

const problems = [];

for (const dir of BUNDLE_DIRS) {
  const absolute = join(root, dir);
  if (!existsSync(absolute)) {
    problems.push(`${dir}: bundle folder is missing`);
    continue;
  }

  const bases = readdirSync(absolute).filter((name) => name.endsWith('.properties') && !name.includes('_'));
  for (const base of bases) {
    const german = base.replace('.properties', '_de.properties');
    if (!existsSync(join(absolute, german))) {
      problems.push(`${dir}/${german}: German bundle is missing`);
      continue;
    }

    const en = readProperties(join(absolute, base));
    const de = readProperties(join(absolute, german));

    for (const key of en.keys()) {
      if (!de.has(key)) problems.push(`${dir}/${german}: missing key ${key}`);
      else if (placeholders(en.get(key)) !== placeholders(de.get(key))) {
        problems.push(`${dir}/${german}: placeholders of ${key} differ from the English text`);
      }
    }
    for (const key of de.keys()) {
      if (!en.has(key)) problems.push(`${dir}/${base}: missing key ${key}`);
    }
  }
}

if (problems.length) {
  for (const problem of problems) console.error(`::error::${problem}`);
  console.error(`\n${problems.length} translation problem(s).`);
  process.exit(1);
}

console.log('Translations complete: every key exists in English and German with matching placeholders.');

/**
 * i18n parity check — fails if en.ts and de.ts key sets diverge.
 *
 * The TranslationDict type (de.ts `satisfies`) already enforces parity at
 * compile time, but this gives a fast, readable CI/pre-commit guard and a
 * clear diff of any drift. Run with: `npm run i18n:check`.
 */
import { en } from "../src/lib/i18n/locales/en";
import { de } from "../src/lib/i18n/locales/de";

function flatten(obj: unknown, prefix = ""): string[] {
  if (obj === null || typeof obj !== "object") return [prefix];
  return Object.entries(obj as Record<string, unknown>).flatMap(([k, v]) =>
    flatten(v, prefix ? `${prefix}.${k}` : k),
  );
}

const enKeys = new Set(flatten(en));
const deKeys = new Set(flatten(de));

const missingInDe = [...enKeys].filter((k) => !deKeys.has(k)).sort();
const missingInEn = [...deKeys].filter((k) => !enKeys.has(k)).sort();

if (missingInDe.length === 0 && missingInEn.length === 0) {
  console.log(`✓ i18n parity OK — ${enKeys.size} keys present in both locales`);
  process.exit(0);
}

if (missingInDe.length) {
  console.error(`\n✗ ${missingInDe.length} key(s) present in en.ts but missing in de.ts:`);
  for (const k of missingInDe) console.error(`  - ${k}`);
}
if (missingInEn.length) {
  console.error(`\n✗ ${missingInEn.length} key(s) present in de.ts but missing in en.ts:`);
  for (const k of missingInEn) console.error(`  - ${k}`);
}
process.exit(1);

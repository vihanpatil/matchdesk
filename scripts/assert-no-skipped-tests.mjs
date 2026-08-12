#!/usr/bin/env node
/**
 * Section 0.2.2: no skipped, `.only`-ed or todo tests. Ever.
 *
 * A syntactic ESLint ban is not enough — it was defeated during Phase 0
 * verification by `const d = describe; d.only(...)` and by the runtime
 * `ctx.skip()`, both of which are ESLint-clean and both of which silently
 * skipped tests containing a deliberately failing assertion while the whole
 * hook chain reported success.
 *
 * This check reads the RESULT of the run rather than the shape of the source,
 * so it cannot be bypassed by aliasing, computed access, or a runtime skip.
 *
 * Exits 0 when every test actually ran, 1 on any skip/todo, 2 if the check
 * could not run (missing or unreadable results — never a silent pass).
 */

import { readFileSync } from 'node:fs';

const RESULTS = new URL('../coverage/test-results.json', import.meta.url);

function main() {
  let report;
  try {
    report = JSON.parse(readFileSync(RESULTS, 'utf8'));
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error('❌ Could not read test results — did the test run emit them?');
    console.error(`   ${detail}`);
    process.exit(2);
  }

  const suites = Array.isArray(report.testResults) ? report.testResults : [];
  const offenders = [];

  for (const suite of suites) {
    for (const assertion of suite.assertionResults ?? []) {
      if (assertion.status !== 'passed' && assertion.status !== 'failed') {
        offenders.push({
          file: suite.name ?? '(unknown file)',
          title: assertion.fullName || assertion.title || '(unnamed test)',
          status: assertion.status,
        });
      }
    }
  }

  const total = report.numTotalTests ?? 0;
  if (total === 0) {
    console.error('❌ No tests were executed at all. Refusing to report success.');
    process.exit(2);
  }

  if (offenders.length > 0) {
    console.error(`\n❌ ${String(offenders.length)} test(s) did not run:\n`);
    for (const o of offenders) {
      console.error(`  [${o.status}] ${o.title}`);
      console.error(`           ${o.file.replace(process.cwd(), '.')}`);
    }
    console.error(
      '\nSection 0.2.2: fix the test or fix the code, then record it in HONESTY_LOG.md.',
    );
    process.exit(1);
  }

  console.log(`✅ All ${String(total)} tests executed — none skipped, todo, or .only-ed.`);
}

main();

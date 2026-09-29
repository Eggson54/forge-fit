#!/usr/bin/env node
/**
 * `npm run doctor` — what is configured, what is not, and what that costs.
 *
 * Reads the .env files and prints the answer. It never contacts any of the
 * services: a key can be present and wrong, and a checker that tried to prove
 * otherwise would need every one of those services reachable from wherever it
 * runs. What this can tell you for certain is which of them you have not
 * configured at all, and which you have configured half of — and the second
 * is the one that actually fails.
 *
 * Deliberately dependency-free and deliberately not part of the build. It is
 * a thing you run when the app is not doing what you expected.
 */
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');

// The list lives in src/domain/setupCheck.ts, where it is under test, and
// is read from there rather than copied here — two copies of a checklist
// drift, and a checklist that has drifted is worse than none.
//
// Transpiled with the compiler the repo already depends on. An earlier
// version of this stripped the types with regular expressions, which fell
// over on the first return type it had not anticipated. There is a real
// TypeScript here; use it.
const { default: ts } = await import('typescript');
const source = readFileSync(join(root, 'src/domain/setupCheck.ts'), 'utf8');
const js = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const mod = await import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'));

const { REQUIREMENTS, NEEDS_NOTHING, checkSetup, summarise, parseEnvFile, placeholders } = mod;

// ---------------------------------------------------------------- reading --

// This repository's own files only. The app used to live inside another
// project and read that project's .env files too; from the repository root,
// one level up is somebody's home directory, whose .env is none of our
// business and could put unrelated secrets into this report.
const FILES = [join(root, '.env'), join(root, '.env.local')];

const found = [];
let fileEnv = {};
for (const file of FILES) {
  if (!existsSync(file)) continue;
  found.push(file.replace(root + '/', ''));
  fileEnv = { ...fileEnv, ...parseEnvFile(readFileSync(file, 'utf8')) };
}

// The process environment wins: that is how a CI or a hosting dashboard
// supplies these, and a .env file left over from local work must not make
// this report a deployed setup it cannot see.
const env = { ...fileEnv, ...process.env };

// ---------------------------------------------------------------- output ---

const useColour = process.stdout.isTTY && !process.env.NO_COLOR;
const c = (code, s) => (useColour ? `\u001b[${code}m${s}\u001b[0m` : s);
const bold = (s) => c('1', s);
const dim = (s) => c('2', s);
const green = (s) => c('32', s);
const yellow = (s) => c('33', s);
const red = (s) => c('31', s);

const MARK = { ready: green('●'), partial: red('▲'), absent: dim('○') };
const WORD = { ready: green('configured'), partial: red('HALF CONFIGURED'), absent: dim('not set up') };

const results = checkSetup(env);
const summary = summarise(results);

console.log('');
console.log(bold('  ForgeFit — what is set up'));
console.log('');
console.log(
  found.length
    ? dim(`  Read ${found.join(', ')}${process.env.EXPO_PUBLIC_SUPABASE_URL ? ' and the process environment' : ''}`)
    : dim('  No .env file found. Reading the process environment only.'),
);
console.log('');

for (const r of results) {
  const { requirement: q, status, missing, missingOptional } = r;
  console.log(`  ${MARK[status]} ${bold(q.title)}  ${WORD[status]}`);

  if (status === 'ready') {
    console.log(`     ${dim(q.unlocks)}`);
    for (const v of missingOptional) {
      console.log(`     ${dim(`optional, not set: ${v.name}${v.note ? ` — ${v.note}` : ''}`)}`);
    }
  } else {
    console.log(`     ${dim('Without it: ')}${q.without}`);
    for (const v of missing) {
      const where = v.where === 'server' ? yellow('backend') : dim('app');
      console.log(`     ${dim('needs')} ${v.name} ${dim('(')}${where}${dim(')')}`);
      if (v.note) console.log(`       ${dim(v.note)}`);
    }
    console.log(`     ${dim(`SETUP.md § ${q.section}`)}`);
  }
  console.log('');
}

const stale = placeholders(env);
if (stale.length) {
  console.log(red(`  ▲ ${stale.length} variable${stale.length === 1 ? '' : 's'} still holding a placeholder:`));
  for (const name of stale) console.log(`     ${name} = ${dim(String(env[name]))}`);
  console.log(dim('     These count as "set" everywhere else and fail on first use.'));
  console.log('');
}

console.log(bold('  ' + summary.headline));
console.log('');

if (summary.partial > 0) {
  console.log(
    `  ${red('Fix the half-configured ones first.')} Everything else on this list falls back to`,
  );
  console.log('  something usable; a half-configured integration does not — it fails when');
  console.log('  somebody uses it.');
  console.log('');
}

console.log(dim('  Works already, with none of the above:'));
for (const line of NEEDS_NOTHING) console.log(dim(`    · ${line}`));
console.log('');
console.log(dim('  Full instructions for each: SETUP.md'));
console.log('');

// A half-configured integration is a real error; an unconfigured one is a
// choice. Only the first should fail a CI step that runs this.
process.exit(summary.partial > 0 || stale.length > 0 ? 1 : 0);

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  NEEDS_NOTHING,
  REQUIREMENTS,
  checkRequirement,
  checkSetup,
  looksLikePlaceholder,
  parseEnvFile,
  placeholders,
  summarise,
} from '../domain/setupCheck';

const byId = (id: string) => REQUIREMENTS.find((r) => r.id === id)!;

describe('checkRequirement', () => {
  it('is ready when every required var is set', () => {
    const r = checkRequirement(byId('gyms'), { EXPO_PUBLIC_GYM_API_URL: 'https://example.com/gyms' });
    expect(r.status).toBe('ready');
    expect(r.missing).toHaveLength(0);
  });

  it('is absent when none of them are', () => {
    expect(checkRequirement(byId('strava'), {}).status).toBe('absent');
  });

  it('is partial when some are, which is the state worth shouting about', () => {
    // Nothing degrades gracefully into half a Strava connection; it fails at
    // the moment somebody uses it.
    const r = checkRequirement(byId('strava'), { EXPO_PUBLIC_STRAVA_CLIENT_ID: '12345' });
    expect(r.status).toBe('partial');
    expect(r.missing.map((v) => v.name)).toContain('STRAVA_CLIENT_SECRET');
  });

  it('treats whitespace as unset', () => {
    expect(checkRequirement(byId('gyms'), { EXPO_PUBLIC_GYM_API_URL: '   ' }).status).toBe('absent');
  });

  it('does not let an optional var hold a group back', () => {
    // An Android key on an iOS-only app is not a problem to report.
    const r = checkRequirement(byId('revenuecat'), { EXPO_PUBLIC_REVENUECAT_IOS_KEY: 'appl_x' });
    expect(r.status).toBe('ready');
    expect(r.missingOptional.map((v) => v.name)).toEqual(['EXPO_PUBLIC_REVENUECAT_ANDROID_KEY']);
  });

  it('separates the app’s variables from the backend’s', () => {
    // A key that belongs on the server and ends up in the app is readable by
    // anybody who downloads it, so the two are never one list.
    const strava = byId('strava');
    expect(strava.vars.find((v) => v.name === 'STRAVA_CLIENT_SECRET')!.where).toBe('server');
    expect(strava.vars.find((v) => v.name === 'EXPO_PUBLIC_STRAVA_CLIENT_ID')!.where).toBe('app');
  });

  it('never puts a secret behind an EXPO_PUBLIC name', () => {
    // EXPO_PUBLIC_* is inlined into the bundle by design. Anything under one
    // of those names is published, so no server-side var may carry the prefix.
    for (const req of REQUIREMENTS) {
      for (const v of req.vars) {
        if (v.where === 'server') expect(v.name.startsWith('EXPO_PUBLIC_')).toBe(false);
        if (v.where === 'app') expect(v.name.startsWith('EXPO_PUBLIC_')).toBe(true);
      }
    }
  });
});

describe('checkSetup and summarise', () => {
  it('reports an empty environment as usable rather than broken', () => {
    const s = summarise(checkSetup({}));
    expect(s.ready).toBe(0);
    expect(s.partial).toBe(0);
    expect(s.headline).toMatch(/still runs/i);
  });

  it('leads with the half-configured ones when there are any', () => {
    const s = summarise(checkSetup({ EXPO_PUBLIC_STRAVA_CLIENT_ID: '1' }));
    expect(s.partial).toBe(1);
    expect(s.broken[0]!.requirement.id).toBe('strava');
    expect(s.headline).toMatch(/half configured/i);
  });

  it('counts a fully configured install', () => {
    const env: Record<string, string> = {};
    for (const r of REQUIREMENTS) for (const v of r.vars) env[v.name] = 'set';
    const s = summarise(checkSetup(env));
    expect(s.ready).toBe(REQUIREMENTS.length);
    expect(s.headline).toMatch(/everything/i);
  });

  it('says how much of the app needs nothing at all', () => {
    expect(NEEDS_NOTHING.length).toBeGreaterThan(5);
  });

  it('describes what happens without each one, not only what it unlocks', () => {
    // A checklist that only says "missing" in red teaches people to ignore red.
    for (const r of REQUIREMENTS) {
      expect(r.without.length).toBeGreaterThan(20);
      expect(r.unlocks.length).toBeGreaterThan(10);
      expect(r.section).toBeTruthy();
    }
  });
});

describe('parseEnvFile', () => {
  it('reads plain assignments', () => {
    expect(parseEnvFile('A=1\nB=two')).toEqual({ A: '1', B: 'two' });
  });

  it('survives what people actually put in these files', () => {
    // A parser that choked on any of this would report a correctly
    // configured install as empty, which is the worst answer available.
    const parsed = parseEnvFile(
      ['# a comment', '', 'export FOO=bar', 'QUOTED="with spaces"', "SINGLE='x'", '  SPACED = 7 '].join('\n'),
    );
    expect(parsed).toEqual({ FOO: 'bar', QUOTED: 'with spaces', SINGLE: 'x', SPACED: '7' });
  });

  it('keeps an = inside a value', () => {
    expect(parseEnvFile('KEY=a=b=c').KEY).toBe('a=b=c');
  });

  it('keeps an empty value rather than dropping the key', () => {
    expect(parseEnvFile('EMPTY=')).toEqual({ EMPTY: '' });
  });

  it('ignores a line that is not an assignment', () => {
    expect(parseEnvFile('just some words\n=novalue\n1BAD=x')).toEqual({});
  });
});

describe('placeholders', () => {
  it('spots a copied example that was never filled in', () => {
    // This reports itself fully configured and fails on first use, which is
    // the exact failure the checker exists to catch.
    expect(looksLikePlaceholder('your-project.supabase.co')).toBe(true);
    expect(looksLikePlaceholder('<paste-it-here>')).toBe(true);
    expect(looksLikePlaceholder('CHANGEME')).toBe(true);
  });

  it('leaves a real value alone', () => {
    expect(looksLikePlaceholder('https://abcdefg.supabase.co')).toBe(false);
    expect(looksLikePlaceholder('')).toBe(false);
  });

  it('names the variables still holding a placeholder', () => {
    expect(placeholders({ EXPO_PUBLIC_SUPABASE_URL: 'your-project.supabase.co' })).toEqual([
      'EXPO_PUBLIC_SUPABASE_URL',
    ]);
  });

  it('ignores a placeholder in a variable nothing reads', () => {
    expect(placeholders({ SOMETHING_ELSE: 'your-thing' })).toEqual([]);
  });
});

describe('.env.example', () => {
  // Read from disk rather than transcribed here: an example file that has
  // fallen behind the code sends people looking for a variable that no longer
  // exists, or leaves out the one they actually needed.
  const example = readFileSync(join(__dirname, '../../.env.example'), 'utf8');

  it('mentions every variable the checker looks for', () => {
    for (const requirement of REQUIREMENTS) {
      for (const v of requirement.vars) expect(example).toContain(v.name);
    }
  });

  it('keeps every server-side variable below the server-side divider', () => {
    // Above the line is compiled into the app bundle. A secret above it is a
    // published secret.
    const dividerAt = example.indexOf('SERVER-SIDE ONLY');
    expect(dividerAt).toBeGreaterThan(0);
    for (const requirement of REQUIREMENTS) {
      for (const v of requirement.vars.filter((x) => x.where === 'server')) {
        expect(example.indexOf(`\n${v.name}=`)).toBeGreaterThan(dividerAt);
      }
    }
  });

  it('ships with every value blank', () => {
    // A committed example with a value in it is how a real key ends up in
    // version control.
    for (const line of example.split('\n')) {
      const m = /^([A-Z][A-Z0-9_]*)=(.*)$/.exec(line.trim());
      if (m) expect(m[2]).toBe('');
    }
  });
});

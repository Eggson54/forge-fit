/**
 * What goes into a model and what comes out of one.
 *
 * Inputs are capped. Every route used to put the request body straight into
 * the prompt, behind an 8 MB body limit — so one request could be a
 * multi-megabyte prompt, billed per token, on the operator's key. Each route
 * now takes only the fields it uses, each with a size.
 *
 * Outputs are checked. Three routes returned the model's JSON to the app
 * exactly as parsed. Structured outputs now enforce the shape, and these
 * functions enforce the *sense*: a set count of 400, a rest of -30 seconds,
 * a 5,000-character "short message" are all schema-valid.
 *
 * And numbers that can be computed are computed. The progress route asked
 * the model for the athlete's weekly rate of change — a plausible-sounding
 * number, which is the worst kind of wrong answer this app can give. It is
 * now arithmetic, done the same way the on-device coach does it, so the
 * figure does not change depending on whether AI happens to be switched on.
 */

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, Number.isFinite(Number(n)) ? Number(n) : lo));
const str = (v, max) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

// ---------------------------------------------------------------- inputs --

export const LIMITS = {
  description: 500,
  /** Decoded bytes. Matches MAX_IMAGE_BYTES in the app's photoEstimate. */
  imageBytes: 1_500_000,
  contextJson: 8_000,
  series: 400,
};

export class BadInput extends Error {}

/** Decoded size of a base64 string, without decoding it. */
export function base64Bytes(b64) {
  const s = String(b64).replace(/\s/g, '');
  const pad = s.endsWith('==') ? 2 : s.endsWith('=') ? 1 : 0;
  return Math.floor((s.length * 3) / 4) - pad;
}

/**
 * What an image actually is, from its first bytes rather than from a claim.
 *
 * The media type sent to the model has to match the bytes, and a caller's
 * label is just a string. Null for anything that is not one of the three
 * formats a phone produces.
 */
export function sniffImage(b64) {
  let head;
  try {
    head = Buffer.from(String(b64).slice(0, 24), 'base64');
  } catch {
    return null;
  }
  if (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return 'image/jpeg';
  if (head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47) return 'image/png';
  if (head.subarray(0, 4).toString('latin1') === 'RIFF' && head.subarray(8, 12).toString('latin1') === 'WEBP') {
    return 'image/webp';
  }
  return null;
}

export function foodInput(body) {
  const description = str(body?.description, LIMITS.description);
  let image = null;
  if (body?.imageBase64 != null) {
    const data = String(body.imageBase64).replace(/^data:[^,]*,/, '').replace(/\s/g, '');
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(data)) throw new BadInput('The image is not base64.');
    if (base64Bytes(data) > LIMITS.imageBytes) throw new BadInput('The image is too large.');
    const mediaType = sniffImage(data);
    if (!mediaType) throw new BadInput('The image is not a JPEG, PNG or WebP.');
    image = { data, mediaType };
  }
  if (!description && !image) throw new BadInput('Describe the meal or send a photo of it.');
  return { description, image };
}

/** Serialise a context object, refusing one too large to send. */
export function boundedJson(value, max = LIMITS.contextJson) {
  const json = JSON.stringify(value ?? {});
  if (json.length > max) throw new BadInput('That request is too large.');
  return json;
}

const INTENTS = new Set(['daily', 'weakest', 'push', 'next_win', 'on_track']);

export function coachInput(body) {
  // The app routes questions on the device and sends an intent, never the
  // question. An unknown intent is the daily message, not an error.
  const intent = INTENTS.has(body?.intent) ? body.intent : 'daily';
  return {
    intent,
    context: boundedJson(body?.context),
    settings: boundedJson(body?.settings, 2_000),
    aggressive: body?.settings?.allowAggressiveLanguage === true,
    personality: str(body?.settings?.personality, 30) || 'friendly',
  };
}

// --------------------------------------------------------------- outputs --

export function sanitizeMacros(m = {}) {
  const proteinG = Math.round(clamp(m.proteinG, 0, 400));
  const carbsG = Math.round(clamp(m.carbsG, 0, 800));
  const fatG = Math.round(clamp(m.fatG, 0, 400));
  const derived = Math.round(proteinG * 4 + carbsG * 4 + fatG * 9);
  const given = clamp(m.calories, 0, 5000);
  // Stated calories are kept only when they agree with the macros. Otherwise
  // the macros win: calories are arithmetic on them, not a separate guess.
  const calories = given > 0 && Math.abs(given - derived) <= Math.max(40, derived * 0.25) ? Math.round(given) : derived;
  return { calories, proteinG, carbsG, fatG, fiberG: Math.round(clamp(m.fiberG, 0, 100)) };
}

const CONFIDENCE = new Set(['low', 'medium', 'high']);

export function checkFood(parsed, { hadPhoto, description }) {
  return {
    name: str(parsed?.name, 80) || description || 'Estimated meal',
    servingLabel: str(parsed?.servingLabel, 40) || '1 serving',
    macros: sanitizeMacros(parsed?.macros),
    confidence: CONFIDENCE.has(parsed?.confidence) ? parsed.confidence : 'low',
    isEstimate: true,
    note:
      str(parsed?.note, 200) ||
      (hadPhoto ? 'Estimated from the photo. Edit any value before saving.' : 'This is an estimate. Edit any value before saving.'),
  };
}

const TONES = new Set(['praise', 'nudge', 'push', 'reflect']);

export function checkCoach(parsed) {
  const text = str(parsed?.text, 400);
  if (!text) return null;
  return { text, tone: TONES.has(parsed?.tone) ? parsed.tone : 'nudge' };
}

const GOALS = new Set(['build_muscle', 'lose_fat', 'recomposition', 'gain_weight', 'maintain', 'athletic_performance']);
const EXPERIENCE = new Set(['beginner', 'intermediate', 'advanced']);

export function workoutInput(body) {
  const candidates = (Array.isArray(body?.candidates) ? body.candidates : [])
    .slice(0, 200)
    .filter((c) => typeof c?.id === 'string' && /^[a-z0-9_]{1,60}$/.test(c.id))
    .map((c) => ({ id: c.id, name: str(c.name, 80), primaryMuscle: str(c.primaryMuscle, 30) }));
  // Without the library there is nothing valid to choose from, and a model
  // left to invent ids produces a workout the app cannot track.
  if (candidates.length === 0) throw new BadInput('No exercises to choose from.');
  return {
    goal: GOALS.has(body?.goal) ? body.goal : 'maintain',
    experience: EXPERIENCE.has(body?.experience) ? body.experience : 'beginner',
    durationMinutes: Math.round(clamp(body?.durationMinutes, 15, 150)),
    daysPerWeek: Math.round(clamp(body?.daysPerWeek, 1, 7)),
    focus: (Array.isArray(body?.focus) ? body.focus : []).slice(0, 6).map((f) => str(f, 30)).filter(Boolean),
    candidates,
  };
}

export function checkWorkout(parsed, allowedIds = null) {
  const exercises = (Array.isArray(parsed?.exercises) ? parsed.exercises : [])
    .slice(0, 12)
    .map((e) => {
      const low = Math.round(clamp(e?.repsLow, 1, 50));
      const high = Math.round(clamp(e?.repsHigh, low, 50));
      return {
        exerciseId: str(e?.exerciseId, 60),
        name: str(e?.name, 80),
        primaryMuscle: str(e?.primaryMuscle, 30),
        sets: Math.round(clamp(e?.sets, 1, 10)),
        reps: [low, high],
        restSeconds: Math.round(clamp(e?.restSeconds, 15, 600)),
      };
    })
    // The schema already restricts ids to the library; this holds even if a
    // provider without structured outputs is the one answering.
    .filter((e) => e.exerciseId && e.name && (!allowedIds || allowedIds.has(e.exerciseId)));
  // A workout with nothing in it is a failure to say so, not a workout.
  if (exercises.length === 0) return null;
  return {
    name: str(parsed?.name, 80) || 'Workout',
    focus: (Array.isArray(parsed?.focus) ? parsed.focus : []).slice(0, 6).map((f) => str(f, 30)).filter(Boolean),
    estimatedMinutes: Math.round(clamp(parsed?.estimatedMinutes, 10, 180)),
    exercises,
    note: str(parsed?.note, 300),
  };
}

export function checkWeekly(parsed) {
  const summary = str(parsed?.summary, 600);
  if (!summary) return null;
  return {
    summary,
    highlights: (Array.isArray(parsed?.highlights) ? parsed.highlights : [])
      .slice(0, 5)
      .map((h) => str(h, 160))
      .filter(Boolean),
    focusNextWeek: str(parsed?.focusNextWeek, 300),
  };
}

// -------------------------------------------------------------- progress --

/**
 * Trend, weekly rate and whether it matches the goal — computed.
 *
 * The same rules as the on-device coach (analyzeProgress in the app's mock
 * service): first and last weigh-in, a 0.1 kg/week threshold for "flat", and
 * the same goal logic. Deliberately the same rather than better, so the
 * number an athlete sees does not change when AI is switched on or off.
 */
export function computeProgress({ weightSeriesKg, goal }) {
  const series = (Array.isArray(weightSeriesKg) ? weightSeriesKg : [])
    .slice(-LIMITS.series)
    .filter((p) => p && Number.isFinite(Number(p.value)) && !Number.isNaN(Date.parse(p.date)))
    .sort((a, b) => Date.parse(a.date) - Date.parse(b.date));

  if (series.length < 2) return { enough: false, trend: 'flat', weeklyRateKg: 0, onTrack: true };

  const first = series[0];
  const last = series[series.length - 1];
  const days = Math.max(1, (Date.parse(last.date) - Date.parse(first.date)) / 86_400_000);
  const weeklyRateKg = ((Number(last.value) - Number(first.value)) / days) * 7;
  const trend = weeklyRateKg > 0.1 ? 'up' : weeklyRateKg < -0.1 ? 'down' : 'flat';
  const losing = goal === 'lose_fat';
  const gaining = goal === 'build_muscle' || goal === 'gain_weight';
  const onTrack = losing ? weeklyRateKg < 0 : gaining ? weeklyRateKg > 0 : Math.abs(weeklyRateKg) < 0.3;
  return { enough: true, trend, weeklyRateKg: Math.round(weeklyRateKg * 100) / 100, onTrack };
}

/** The sentence, when the model is not there to write one. */
export function progressSentence({ enough, trend, weeklyRateKg, onTrack }, units) {
  if (!enough) return 'Log a few more weigh-ins to see your trend.';
  const imperial = units === 'imperial';
  const rate = Math.round(Math.abs(weeklyRateKg) * (imperial ? 2.20462 : 1) * 10) / 10;
  const dir = trend === 'flat' ? 'holding steady' : trend === 'down' ? 'trending down' : 'trending up';
  return `You're ${dir} at about ${rate} ${imperial ? 'lb' : 'kg'}/week. ${
    onTrack ? "That's aligned with your goal." : 'Consider adjusting intake or activity to match your goal.'
  }`;
}

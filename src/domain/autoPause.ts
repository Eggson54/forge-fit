/**
 * Deciding when a recording should stop and start its own clock.
 *
 * Pulled out of the recorder store so it can be tested without a GPS: this is
 * a small state machine whose failure modes are invisible on screen and
 * expensive in the moment — one direction wastes a red light, the other
 * silently drops the rest of a run.
 */

/**
 * The speed below which somebody is not moving, in metres per second.
 *
 * 0.6 m/s is slower than a stroll. Set any higher and a deliberate walk
 * break in the middle of a long run stops being recorded as part of the run,
 * which is what people complain about in every app that does this.
 */
export const AUTO_PAUSE_MS = 0.6;

/** Seconds below that speed before it takes effect. */
export const AUTO_PAUSE_AFTER_S = 8;

export interface PauseState {
  recording: boolean;
  autoPaused: boolean;
  /** Fix time at which the receiver first reported standing still. */
  stillSince: number | null;
}

export interface PauseFix {
  /** Metres per second, or null when the receiver did not report one. */
  speedMs: number | null;
  /** Milliseconds since epoch. */
  t: number;
}

export type PauseAction = 'none' | 'pause' | 'resume';

export interface PauseDecision {
  action: PauseAction;
  stillSince: number | null;
}

/**
 * What to do with one fix.
 *
 * Deliberately asymmetric about an unknown speed: it will **resume** on one
 * but never **pause** on one. Some receivers report speed intermittently, and
 * treating "don't know" as "stopped" strands somebody auto-paused for the
 * rest of a run with no way back but a manual resume. The clock running
 * through a red light is a far smaller error than losing five miles.
 */
export function decide(state: PauseState, fix: PauseFix): PauseDecision {
  const moving = fix.speedMs == null || !Number.isFinite(fix.speedMs) ? null : fix.speedMs >= AUTO_PAUSE_MS;

  if (state.autoPaused) {
    return moving === false
      ? { action: 'none', stillSince: state.stillSince }
      : { action: 'resume', stillSince: null };
  }

  if (!state.recording) return { action: 'none', stillSince: null };

  if (moving === false) {
    // Time the stillness from the first fix that reported it, not from the
    // moment the threshold is crossed — otherwise a one-second sample rate
    // and a nine-second stop never quite add up to a pause.
    const since = state.stillSince ?? fix.t;
    const stillFor = (fix.t - since) / 1000;
    return stillFor >= AUTO_PAUSE_AFTER_S
      ? { action: 'pause', stillSince: null }
      : { action: 'none', stillSince: since };
  }

  return { action: 'none', stillSince: null };
}

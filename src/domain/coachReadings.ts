import type { CoachReading } from './coachQuestions';
import type { EnergyConfidence } from './energyBalance';
import { CONFIDENCE_LABEL } from './energyBalance';
import { groupThousands } from './units';

/**
 * The coach answering from arithmetic instead of from generation.
 *
 * "What is my maintenance", "am I recovered", "where is my body fat" all have
 * answers sitting in the logs already. Routing them through a language model
 * would mean a number that sounds right, and a number that sounds right is the
 * worst kind on a screen people eat to. So these three come back computed,
 * with the same refusal to guess that the screens behind them use: when the
 * logging is not there, the coach says so and says what would fix it.
 */

export interface CoachReadingData {
  /** Observed maintenance, or null when there is not enough logged. */
  maintenanceKcal: number | null;
  meanIntakeKcal: number | null;
  /** Weight trend, kilograms per week. Negative is down. */
  kgPerWeek: number | null;
  confidence: EnergyConfidence | null;
  /** What the app still needs before it can measure maintenance. */
  needsMoreDays: number;
  needsMoreWeighIns: number;

  targetCalories: number;
  formulaKcal: number;

  /** One line summarising where recovery stands, from `readRecovery`. */
  recoveryLine: string | null;
  readyMuscles: string[];
  overdueMuscles: string[];

  bodyFatPct: number | null;
  bodyFatBandLabel: string | null;
  /** Percentage points moved since the first reading. Negative is down. */
  bodyFatDeltaPct: number | null;

  units: 'metric' | 'imperial';
}

export function readingAnswer(reading: CoachReading, d: CoachReadingData): string {
  switch (reading) {
    case 'energy':
      return energyAnswer(d);
    case 'recovery':
      return recoveryAnswer(d);
    case 'composition':
      return compositionAnswer(d);
  }
}

function energyAnswer(d: CoachReadingData): string {
  if (d.maintenanceKcal == null) {
    const wants: string[] = [];
    if (d.needsMoreDays > 0) wants.push(`${d.needsMoreDays} more ${d.needsMoreDays === 1 ? 'day' : 'days'} of food logged`);
    if (d.needsMoreWeighIns > 0) wants.push(`${d.needsMoreWeighIns} more ${d.needsMoreWeighIns === 1 ? 'weigh-in' : 'weigh-ins'}`);
    const need = wants.length ? wants.join(' and ') : 'a couple more weeks of both';
    return [
      `I can't measure your maintenance yet — that takes ${need}, spread over a few weeks rather than crammed into one.`,
      `Until then your target is ${kcal(d.targetCalories)} a day, built from the formula, which puts your maintenance near ${kcal(d.formulaKcal)}. It is a starting guess, not a reading. Log your food and step on the scale a few times a week and I'll replace it with the real number.`,
    ].join('\n\n');
  }

  const direction = describeRate(d.kgPerWeek, d.units);
  const confidence = d.confidence ? CONFIDENCE_LABEL[d.confidence].toLowerCase() : 'rough';
  const lines = [
    `Your maintenance reads ${kcal(d.maintenanceKcal)} a day. That is measured, not predicted — your average intake of ${kcal(d.meanIntakeKcal ?? 0)} against ${direction}.`,
    `Confidence is ${confidence}. It beats the formula, which had you at ${kcal(d.formulaKcal)}.`,
  ];
  if (d.targetCalories !== d.maintenanceKcal) {
    const delta = d.targetCalories - d.maintenanceKcal;
    lines.push(
      `Your target is set to ${kcal(d.targetCalories)}, which is ${kcal(Math.abs(delta))} ${delta < 0 ? 'under' : 'over'} that. Energy balance on the nutrition tab will show you what any rate costs.`,
    );
  }
  lines.push('None of this is a prescription — it is a description of what your own logs did.');
  return lines.join('\n\n');
}

function recoveryAnswer(d: CoachReadingData): string {
  if (!d.recoveryLine) {
    return "You haven't logged a session yet, so there's nothing for me to read. Finish one and I'll be able to tell you what's had rest and what hasn't.";
  }

  const lines = [d.recoveryLine];
  // The summary line already names whatever has been waiting longest, so
  // repeating it a sentence later reads as a stutter rather than as emphasis.
  const alreadyNamed = d.overdueMuscles.every((m) => d.recoveryLine!.includes(m));
  if (d.overdueMuscles.length > 0 && !alreadyNamed) {
    lines.push(`Longest wait: ${list(d.overdueMuscles)}. If your split covers ${d.overdueMuscles.length === 1 ? 'it' : 'them'}, ${d.overdueMuscles.length === 1 ? 'it is' : 'they are'} overdue.`);
  } else if (d.overdueMuscles.length === 0 && d.readyMuscles.length > 0) {
    lines.push(`Recovered and available: ${list(d.readyMuscles)}.`);
  }
  lines.push("That's time since each muscle last worked, nothing more — it can't feel how sore you are, and a split leaves half the list waiting on purpose.");
  return lines.join('\n\n');
}

function compositionAnswer(d: CoachReadingData): string {
  if (d.bodyFatPct == null) {
    return 'I need a height and a couple of tape measurements — neck and waist — before I can estimate that. Add them on the measurements screen and body composition fills in.';
  }
  const lines = [
    `Your last estimate is ${d.bodyFatPct.toFixed(1)}%${d.bodyFatBandLabel ? `, which sits in the ${d.bodyFatBandLabel.toLowerCase()} band` : ''}.`,
  ];
  if (d.bodyFatDeltaPct != null && d.bodyFatDeltaPct !== 0) {
    lines.push(
      `That is ${Math.abs(d.bodyFatDeltaPct)} points ${d.bodyFatDeltaPct < 0 ? 'down' : 'up'} since your first measurement.`,
    );
  } else {
    lines.push('One reading so far, so there is no direction yet. Measure again in a fortnight.');
  }
  lines.push('It comes off a tape, not a scanner, so it runs a few points either way. The direction over weeks is the part worth reading.');
  return lines.join('\n\n');
}

function describeRate(kgPerWeek: number | null, units: 'metric' | 'imperial'): string {
  if (kgPerWeek == null || Math.abs(kgPerWeek) < 0.05) return 'a bodyweight that has held flat';
  const amount = units === 'imperial' ? Math.abs(kgPerWeek) * 2.20462 : Math.abs(kgPerWeek);
  const unit = units === 'imperial' ? 'lb' : 'kg';
  return `a bodyweight moving ${kgPerWeek < 0 ? 'down' : 'up'} about ${amount.toFixed(1)} ${unit} a week`;
}

// Hand-rolled rather than toLocaleString: Hermes ships Intl only partially,
// and a grouped number is not worth a platform difference.
function kcal(n: number): string {
  return `${groupThousands(Math.round(n))} kcal`;
}

function list(labels: string[]): string {
  if (labels.length === 0) return '';
  if (labels.length === 1) return labels[0]!;
  return `${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]}`;
}

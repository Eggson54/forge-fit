/**
 * What the home screen shows, and in what order.
 *
 * Two rules keep this from becoming a way to break the app:
 *
 *  - A section can be hidden, but the thing behind it never disappears. Every
 *    hidden section is still reachable from its tab or from search, so
 *    tidying the home screen cannot lose a feature.
 *  - An unknown key in stored settings is dropped, and a section added in a
 *    later version appears for someone who customised before it existed. A
 *    layout saved in March should not permanently hide April's work.
 */

export type HomeSectionKey =
  | 'coach'
  | 'discipline'
  | 'week'
  | 'readiness'
  | 'today'
  | 'quickAdd'
  | 'streak';

export interface HomeSectionDef {
  key: HomeSectionKey;
  label: string;
  description: string;
  /** Sections that carry the day's actual numbers cannot be hidden. */
  required?: boolean;
}

export const HOME_SECTIONS: HomeSectionDef[] = [
  { key: 'coach', label: 'Coach', description: "Today's line from your coach." },
  { key: 'discipline', label: 'Discipline & suggested', description: 'The score ring and what to train.' },
  { key: 'week', label: 'This week', description: 'The training week as a strip.' },
  { key: 'readiness', label: 'Readiness', description: 'Recovery, and what is dragging it.' },
  { key: 'today', label: "Today's numbers", description: 'Calories, protein, water, steps, sleep.', required: true },
  { key: 'quickAdd', label: 'Quick add', description: 'The shortcut row.' },
  { key: 'streak', label: 'Streak & rank', description: 'Where you sit and how long you have held it.' },
];

export const DEFAULT_ORDER: HomeSectionKey[] = HOME_SECTIONS.map((s) => s.key);

export interface HomeLayout {
  order: HomeSectionKey[];
  hidden: HomeSectionKey[];
}

export const DEFAULT_LAYOUT: HomeLayout = { order: DEFAULT_ORDER, hidden: [] };

function known(key: string): key is HomeSectionKey {
  return HOME_SECTIONS.some((s) => s.key === key);
}

export function sectionByKey(key: HomeSectionKey): HomeSectionDef | null {
  return HOME_SECTIONS.find((s) => s.key === key) ?? null;
}

/**
 * The order to render in, given whatever was stored.
 *
 * Unknown keys are dropped and missing ones appended in their catalog
 * position, so a layout saved before a section existed still shows it.
 */
export function resolveOrder(stored: string[] | undefined): HomeSectionKey[] {
  const kept = (stored ?? []).filter(known);
  const seen = new Set(kept);
  const missing = DEFAULT_ORDER.filter((k) => !seen.has(k));
  return [...kept, ...missing];
}

/** Hidden sections, minus anything that is not allowed to be hidden. */
export function resolveHidden(stored: string[] | undefined): HomeSectionKey[] {
  return (stored ?? []).filter(known).filter((k) => !sectionByKey(k)?.required);
}

export function visibleSections(layout: HomeLayout): HomeSectionKey[] {
  const hidden = new Set(resolveHidden(layout.hidden));
  return resolveOrder(layout.order).filter((k) => !hidden.has(k));
}

/** Move a section one place up or down, without falling off either end. */
export function move(order: HomeSectionKey[], key: HomeSectionKey, delta: number): HomeSectionKey[] {
  const from = order.indexOf(key);
  if (from === -1) return order;
  const to = Math.max(0, Math.min(order.length - 1, from + delta));
  if (to === from) return order;
  const next = [...order];
  next.splice(from, 1);
  next.splice(to, 0, key);
  return next;
}

export function toggleHidden(hidden: HomeSectionKey[], key: HomeSectionKey): HomeSectionKey[] {
  if (sectionByKey(key)?.required) return hidden;
  return hidden.includes(key) ? hidden.filter((k) => k !== key) : [...hidden, key];
}

// ------------------------------------------------------------- action ----

/**
 * The big button. One tap from anywhere, so it should be the thing this
 * person actually does most, not the thing the app would like them to.
 */
export type ActionKey =
  | 'start_workout'
  | 'log_food'
  | 'log_weight'
  | 'journal'
  | 'coach'
  | 'water'
  | 'cardio';

export interface ActionDef {
  key: ActionKey;
  label: string;
  href: string;
  icon: string;
}

export const ACTIONS: ActionDef[] = [
  { key: 'start_workout', label: 'Start a workout', href: '/(tabs)/workout', icon: 'dumbbell' },
  { key: 'log_food', label: 'Log food', href: '/nutrition/add', icon: 'nutrition' },
  { key: 'log_weight', label: 'Log weight', href: '/log?focus=weight', icon: 'scale' },
  { key: 'journal', label: 'Journal', href: '/journal', icon: 'document' },
  { key: 'coach', label: 'Ask your coach', href: '/coach', icon: 'flame' },
  { key: 'water', label: 'Add water', href: '/log?focus=water', icon: 'water' },
  { key: 'cardio', label: 'Log cardio', href: '/progress/cardio', icon: 'steps' },
];

export const DEFAULT_ACTION: ActionKey = 'start_workout';

export function actionByKey(key: string | undefined): ActionDef {
  return ACTIONS.find((a) => a.key === key) ?? ACTIONS.find((a) => a.key === DEFAULT_ACTION)!;
}

// --------------------------------------------------------------- tabs ----

export type TabKey = 'home' | 'workout' | 'nutrition' | 'progress' | 'profile';

export const TAB_LABEL: Record<TabKey, string> = {
  home: 'Home',
  workout: 'Workout',
  nutrition: 'Nutrition',
  progress: 'Progress',
  profile: 'Profile',
};

/** Tabs that cannot be hidden, because hiding them strands the app. */
export const REQUIRED_TABS: TabKey[] = ['home', 'profile'];

/**
 * Which tabs to show.
 *
 * Home and Profile always stay: Home is where the app opens and Profile is
 * the only route to settings, so hiding either would leave someone with no
 * way back. Everything else is theirs to remove, and remains reachable from
 * search.
 */
export function visibleTabs(hidden: string[] | undefined): TabKey[] {
  const all: TabKey[] = ['home', 'workout', 'nutrition', 'progress', 'profile'];
  const off = new Set((hidden ?? []).filter((k): k is TabKey => all.includes(k as TabKey)));
  return all.filter((t) => REQUIRED_TABS.includes(t) || !off.has(t));
}

export function toggleTab(hidden: string[], key: TabKey): string[] {
  if (REQUIRED_TABS.includes(key)) return hidden;
  return hidden.includes(key) ? hidden.filter((k) => k !== key) : [...hidden, key];
}

export const LAYOUT_NOTE =
  'Hiding a section only takes it off this screen. Everything stays reachable from its tab and from search, so tidying the home screen can never lose you a feature.';

import {
  ACTIONS,
  DEFAULT_ACTION,
  DEFAULT_ORDER,
  HOME_SECTIONS,
  LAYOUT_NOTE,
  REQUIRED_TABS,
  actionByKey,
  move,
  resolveHidden,
  resolveOrder,
  sectionByKey,
  toggleHidden,
  toggleTab,
  visibleSections,
  visibleTabs,
  type HomeSectionKey,
} from '../domain/layout';

describe('resolveOrder', () => {
  it('uses the stored order when it is complete', () => {
    const custom: HomeSectionKey[] = ['today', 'coach', 'week', 'readiness', 'discipline', 'quickAdd', 'streak'];
    expect(resolveOrder(custom)).toEqual(custom);
  });

  it('appends a section that did not exist when the layout was saved', () => {
    // A layout saved in March must not permanently hide April's work.
    const old = ['coach', 'today'];
    const resolved = resolveOrder(old);
    expect(resolved.slice(0, 2)).toEqual(['coach', 'today']);
    expect(resolved).toHaveLength(DEFAULT_ORDER.length);
    expect(new Set(resolved).size).toBe(DEFAULT_ORDER.length);
  });

  it('drops a key this build does not know', () => {
    expect(resolveOrder(['coach', 'a_section_that_was_removed', 'today'])).not.toContain('a_section_that_was_removed');
  });

  it('falls back to the default when nothing was stored', () => {
    expect(resolveOrder(undefined)).toEqual(DEFAULT_ORDER);
    expect(resolveOrder([])).toEqual(DEFAULT_ORDER);
  });
});

describe('hiding', () => {
  it('refuses to hide a section the day depends on', () => {
    expect(sectionByKey('today')!.required).toBe(true);
    expect(resolveHidden(['today'])).toEqual([]);
    expect(toggleHidden([], 'today')).toEqual([]);
  });

  it('hides and unhides everything else', () => {
    const once = toggleHidden([], 'streak');
    expect(once).toEqual(['streak']);
    expect(toggleHidden(once, 'streak')).toEqual([]);
  });

  it('leaves a required section visible however the settings were stored', () => {
    expect(visibleSections({ order: DEFAULT_ORDER, hidden: ['today', 'streak'] })).toContain('today');
  });

  it('renders in the stored order, minus the hidden', () => {
    const visible = visibleSections({ order: ['today', 'coach', 'week'], hidden: ['coach'] });
    expect(visible[0]).toBe('today');
    expect(visible).not.toContain('coach');
    expect(visible).toContain('week');
  });
});

describe('move', () => {
  it('moves a section one place and no further', () => {
    const order = [...DEFAULT_ORDER];
    const moved = move(order, order[2]!, -1);
    expect(moved[1]).toBe(order[2]);
    expect(moved[2]).toBe(order[1]);
  });

  it('will not push a section off either end', () => {
    const order = [...DEFAULT_ORDER];
    expect(move(order, order[0]!, -1)).toEqual(order);
    expect(move(order, order[order.length - 1]!, 1)).toEqual(order);
  });

  it('never loses or duplicates a section', () => {
    let order = [...DEFAULT_ORDER];
    for (const delta of [1, 1, -1, 1, -1, -1]) order = move(order, 'week', delta);
    expect(new Set(order).size).toBe(DEFAULT_ORDER.length);
    expect(order).toHaveLength(DEFAULT_ORDER.length);
  });

  it('ignores a key that is not in the order', () => {
    const order = [...DEFAULT_ORDER];
    expect(move(order, 'coach' as HomeSectionKey, 0)).toEqual(order);
  });
});

describe('tabs', () => {
  it('always keeps the way in and the way to settings', () => {
    // Hiding either would leave somebody with no route back.
    const visible = visibleTabs(['home', 'profile', 'workout', 'nutrition', 'progress', 'social']);
    expect(visible).toEqual(['home', 'profile']);
    expect(REQUIRED_TABS).toEqual(['home', 'profile']);
  });

  it('hides the ones it is allowed to', () => {
    expect(visibleTabs(['nutrition'])).toEqual(['home', 'workout', 'progress', 'social', 'profile']);
  });

  it('lets the social tab be hidden, which matters on a six-tab bar', () => {
    expect(visibleTabs(['social'])).toEqual(['home', 'workout', 'nutrition', 'progress', 'profile']);
  });

  it('toggles, except for the required ones', () => {
    expect(toggleTab([], 'nutrition')).toEqual(['nutrition']);
    expect(toggleTab(['nutrition'], 'nutrition')).toEqual([]);
    expect(toggleTab([], 'home')).toEqual([]);
  });

  it('ignores a stored tab key it does not recognise', () => {
    expect(visibleTabs(['gyms'])).toHaveLength(6);
  });
});

describe('the action button', () => {
  it('falls back to the default for a missing or unknown key', () => {
    expect(actionByKey(undefined).key).toBe(DEFAULT_ACTION);
    expect(actionByKey('something_else').key).toBe(DEFAULT_ACTION);
  });

  it('finds a real one', () => {
    expect(actionByKey('log_food').href).toBe('/nutrition/add');
  });

  it('gives every action a label, a route and an icon', () => {
    for (const a of ACTIONS) {
      expect(a.label).toBeTruthy();
      expect(a.href.startsWith('/')).toBe(true);
      expect(a.icon).toBeTruthy();
    }
  });
});

describe('the catalog', () => {
  it('has a label and a description for every section', () => {
    for (const s of HOME_SECTIONS) {
      expect(s.label).toBeTruthy();
      expect(s.description.length).toBeGreaterThan(10);
    }
  });

  it('promises hiding never loses a feature', () => {
    expect(LAYOUT_NOTE).toMatch(/reachable from its tab and from search/);
  });
});

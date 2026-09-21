import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Button, Card, Pill, Screen, SectionHeader, Text, Toggle } from '../../src/components/ui';
import { ScreenHeader } from '../../src/components/ScreenHeader';
import { Icon } from '../../src/components/Icon';
import { colors, radius, spacing } from '../../src/theme';
import {
  ACTIONS,
  LAYOUT_NOTE,
  REQUIRED_TABS,
  TAB_LABEL,
  resolveHidden,
  resolveOrder,
  sectionByKey,
  type TabKey,
} from '../../src/domain/layout';
import { useLayoutStore } from '../../src/stores/useLayoutStore';

const ALL_TABS: TabKey[] = ['home', 'workout', 'nutrition', 'progress', 'profile'];

/**
 * Rearranging the app.
 *
 * Reorder is two arrows rather than drag-and-drop on purpose: dragging inside
 * a scroll view is a fight on every platform, and this screen is opened once
 * and then never again. Arrows work the first time, with one hand, and read
 * correctly to a screen reader.
 */
export default function Customize() {
  const order = useLayoutStore((s) => resolveOrder(s.order));
  const hidden = useLayoutStore((s) => resolveHidden(s.hidden));
  const hiddenTabs = useLayoutStore((s) => s.hiddenTabs);
  const action = useLayoutStore((s) => s.action);
  const moveSection = useLayoutStore((s) => s.moveSection);
  const toggleSection = useLayoutStore((s) => s.toggleSection);
  const toggleTabKey = useLayoutStore((s) => s.toggleTabKey);
  const setAction = useLayoutStore((s) => s.setAction);
  const reset = useLayoutStore((s) => s.reset);

  return (
    <Screen gradient>
      <ScreenHeader title="Customise" subtitle="What you see, and in what order" />

      <SectionHeader title="Home screen" />
      <Card style={{ gap: spacing.sm }}>
        {order.map((key, i) => {
          const def = sectionByKey(key);
          if (!def) return null;
          const off = hidden.includes(key);
          return (
            <View key={key} style={styles.row}>
              <View style={styles.arrows}>
                <Arrow
                  glyph="chevron_up"
                  disabled={i === 0}
                  onPress={() => moveSection(key, -1)}
                  label={`Move ${def.label} up`}
                />
                <Arrow
                  glyph="chevron_down"
                  disabled={i === order.length - 1}
                  onPress={() => moveSection(key, 1)}
                  label={`Move ${def.label} down`}
                />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text variant="bodyStrong" color={off ? colors.textDim : colors.text}>
                  {def.label}
                </Text>
                <Text variant="caption" color={colors.textFaint}>
                  {def.required ? 'Always shown' : def.description}
                </Text>
              </View>
              {/* A required row gets a label rather than a dead switch. A
                  greyed-out toggle still reads as something you failed to
                  operate; "Always on" reads as a decision already made. */}
              {def.required ? (
                <Pill label="Always on" color={colors.textDim} />
              ) : (
                <Toggle
                  value={!off}
                  onValueChange={() => toggleSection(key)}
                  accessibilityLabel={`Show ${def.label} on the home screen`}
                />
              )}
            </View>
          );
        })}
      </Card>
      <Text variant="caption" color={colors.textFaint} style={{ marginTop: spacing.sm }}>
        {LAYOUT_NOTE}
      </Text>

      <SectionHeader title="Tabs" />
      <Card style={{ gap: spacing.sm }}>
        {ALL_TABS.map((tab) => {
          const required = REQUIRED_TABS.includes(tab);
          const on = required || !hiddenTabs.includes(tab);
          return (
            <View key={tab} style={styles.row}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text variant="bodyStrong" color={on ? colors.text : colors.textDim}>
                  {TAB_LABEL[tab]}
                </Text>
                {required && (
                  <Text variant="caption" color={colors.textFaint}>
                    Kept — hiding it would leave you no way back.
                  </Text>
                )}
              </View>
              {required ? (
                <Pill label="Always on" color={colors.textDim} />
              ) : (
                <Toggle
                  value={on}
                  onValueChange={() => toggleTabKey(tab)}
                  accessibilityLabel={`Show the ${TAB_LABEL[tab]} tab`}
                />
              )}
            </View>
          );
        })}
      </Card>

      <SectionHeader title="The big button" />
      <Card style={{ gap: spacing.xs }}>
        {ACTIONS.map((a) => {
          const active = a.key === action;
          return (
            <View
              key={a.key}
              style={[styles.choice, active && { borderColor: colors.primary, backgroundColor: colors.surface }]}
            >
              <Text
                variant="body"
                color={active ? colors.text : colors.textDim}
                onPress={() => setAction(a.key)}
                style={{ flex: 1 }}
              >
                {a.label}
              </Text>
              {active && <Icon name="check" size={18} color={colors.primary} />}
            </View>
          );
        })}
      </Card>

      <View style={{ marginTop: spacing.xl }}>
        <Button title="Reset to defaults" variant="ghost" onPress={reset} />
      </View>
    </Screen>
  );
}

function Arrow({
  glyph,
  disabled,
  onPress,
  label,
}: {
  glyph: 'chevron_up' | 'chevron_down';
  disabled?: boolean;
  onPress: () => void;
  label: string;
}) {
  return (
    <Text
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={disabled ? undefined : onPress}
      style={[styles.arrow, disabled && styles.arrowOff]}
    >
      <Icon name={glyph} size={15} color={disabled ? colors.textFaint : colors.text} />
    </Text>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.xs },
  arrows: { gap: spacing.xs },
  arrow: {
    width: 34,
    height: 26,
    lineHeight: 26,
    textAlign: 'center',
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  arrowOff: { opacity: 0.35, backgroundColor: 'transparent' },
  choice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'transparent',
  },
});

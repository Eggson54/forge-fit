import React from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { colors, noOutline, radius, spacing } from '../theme';
import { Text, Well } from './ui';
import { Icon, type IconName } from './Icon';

/**
 * A number you log, shown against what it is meant to be.
 *
 * The logging screen used to be four identical text boxes. A box accepts a
 * number; it does not say whether 6,420 steps is most of the way there or
 * barely started, which is the only reason anyone opens that screen twice.
 *
 * The bar is the whole point: entering a value moves it immediately, so the
 * field answers "am I there yet" before you have hit save.
 */
export function MetricField({
  icon,
  tint,
  label,
  value,
  onChangeValue,
  unit,
  target,
  /**
   * The value the bar should use, when the text in the box is not itself a
   * number — "7:30" is a duration, not 7.30 of anything.
   */
  current: currentOverride,
  /** Shown under the bar in place of the target line, when there is more to say. */
  footnote,
  placeholder,
  autoFocus,
  keyboardType = 'number-pad',
  quickAdds,
  onQuickAdd,
  /**
   * For a value that is already logged rather than drafted — water is written
   * on every tap. A box you can type into that throws the text away is worse
   * than no box.
   */
  readOnly,
  children,
}: {
  icon: IconName;
  tint: string;
  label: string;
  value: string;
  onChangeValue: (v: string) => void;
  unit: string;
  target?: number | null;
  current?: number;
  footnote?: string;
  placeholder?: string;
  autoFocus?: boolean;
  keyboardType?: 'number-pad' | 'decimal-pad' | 'numbers-and-punctuation';
  quickAdds?: number[];
  onQuickAdd?: (amount: number) => void;
  readOnly?: boolean;
  children?: React.ReactNode;
}) {
  const n = Number(value.replace(/,/g, ''));
  const current = currentOverride ?? (Number.isFinite(n) ? n : 0);
  const ratio = target && target > 0 ? Math.min(1, Math.max(0, current / target)) : 0;
  const remaining = target ? Math.max(0, target - current) : 0;

  return (
    <Well style={{ gap: spacing.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
        <View style={[styles.glyph, { backgroundColor: `${tint}1F` }]}>
          <Icon name={icon} size={17} color={tint} strokeWidth={1.9} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text variant="caption" color={colors.textDim}>{label}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
            {readOnly ? (
              <Text variant="metric" accessibilityLabel={`${label}: ${value} ${unit}`}>
                {value}
              </Text>
            ) : (
              <TextInput
                value={value}
                onChangeText={onChangeValue}
                keyboardType={keyboardType}
                placeholder={placeholder ?? '0'}
                placeholderTextColor={colors.textFaint}
                autoFocus={autoFocus}
                accessibilityLabel={`${label}, in ${unit}`}
                selectionColor={tint}
                style={[styles.input, noOutline]}
              />
            )}
            <Text variant="caption" color={colors.textFaint}>{unit}</Text>
          </View>
        </View>
        {quickAdds && onQuickAdd && (
          <View style={{ flexDirection: 'row', gap: spacing.xs }}>
            {quickAdds.map((a) => (
              <Pressable
                key={a}
                onPress={() => onQuickAdd(a)}
                accessibilityRole="button"
                accessibilityLabel={`Add ${a} ${unit}`}
                style={[styles.quick, { borderColor: `${tint}55` }]}
              >
                <Text variant="caption" color={tint}>+{a}</Text>
              </Pressable>
            ))}
          </View>
        )}
      </View>

      {target != null && target > 0 && (
        <View style={{ gap: 6 }}>
          <View style={styles.track}>
            <View style={{ width: `${Math.round(ratio * 100)}%`, height: '100%', backgroundColor: tint, borderRadius: 3 }} />
          </View>
          <Text variant="caption" color={colors.textFaint}>
            {footnote ??
              (remaining > 0
                ? `${formatNumber(remaining)} ${unit} to your target of ${formatNumber(target)}`
                : `Target of ${formatNumber(target)} ${unit} met`)}
          </Text>
        </View>
      )}
      {target == null && footnote && (
        <Text variant="caption" color={colors.textFaint}>{footnote}</Text>
      )}

      {children}
    </Well>
  );
}

/** Thousands separators without Intl, which Hermes only partly ships. */
function formatNumber(n: number): string {
  const rounded = Math.round(n * 10) / 10;
  const [whole, frac] = String(rounded).split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return frac ? `${grouped}.${frac}` : grouped;
}

const styles = StyleSheet.create({
  glyph: { width: 38, height: 38, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  // minWidth 0 because a web TextInput carries an intrinsic min-content width
  // from its size attribute, so flex alone cannot shrink it.
  input: { color: colors.text, fontSize: 26, fontWeight: '700', minWidth: 0, paddingVertical: 2 },
  quick: {
    paddingHorizontal: spacing.md,
    paddingVertical: 7,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  track: { height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.07)', overflow: 'hidden' },
});

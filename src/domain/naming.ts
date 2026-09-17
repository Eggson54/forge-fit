/**
 * "Push Day" → "Push Day copy" → "Push Day copy 2". Numbering only starts at
 * the second copy, because "copy 1" reads like a filing error.
 */
export function nextCopyName(name: string, existing: string[]): string {
  const base = name.replace(/ copy( \d+)?$/i, '').trim() || name;
  const taken = new Set(existing);
  const first = `${base} copy`;
  if (!taken.has(first)) return first;
  for (let n = 2; n < 200; n += 1) {
    const candidate = `${first} ${n}`;
    if (!taken.has(candidate)) return candidate;
  }
  return `${first} ${Date.now()}`;
}

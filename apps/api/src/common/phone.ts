export const pakistanPhonePattern = /^\+923\d{9}$/;

export function normalizePakistanPhone(value: unknown) {
  if (typeof value !== 'string') return value;
  const compact = value.trim().replace(/[\s()-]/g, '');
  if (compact.startsWith('+92')) return compact;
  if (compact.startsWith('92')) return `+${compact}`;
  if (compact.startsWith('0')) return `+92${compact.slice(1)}`;
  if (compact.startsWith('3')) return `+92${compact}`;
  return compact;
}

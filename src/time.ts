const pad = (n: number) => String(n).padStart(2, '0');

/** `YYYY-MM-DD` in the system timezone. */
export function localDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

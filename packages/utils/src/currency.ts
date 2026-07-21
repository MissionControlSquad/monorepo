/**
 * Format an integer cent amount as a USD string, e.g. 12345 → "$123.45", -500 → "-$5.00".
 * Single source of truth for the finance/ledger/salary surfaces (previously copy-pasted per page).
 */
export function formatCents(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  return `${sign}$${(Math.abs(cents) / 100).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

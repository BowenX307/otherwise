const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

/** "2026-10-03" -> "03 OCT 2026" */
export function formatDate(iso: string): string {
  // 直接拆字符串，不经过 Date，避免时区把日期往前推一天
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return `${String(d).padStart(2, '0')} ${MONTHS[m - 1]} ${y}`;
}

/** 3 -> "03" */
export const pad2 = (n: number) => String(n).padStart(2, '0');

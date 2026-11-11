/**
 * 數量顯示：displayByPack 的原料（例如芒果）用「5 籃 3 顆」顯示，其他照基本單位顯示（例如 120 個）。
 * 資料庫一律存基本單位數量；這裡只負責換算顯示，不改數值。
 */
export interface PackInfo {
  baseUnit: string;
  packUnit?: string | null;
  perPack?: number | null;
  displayByPack?: boolean;
}

const cents = (n: number) => Math.round(n * 100);
/** 最多兩位小數，去掉多餘的 0，加千分位。 */
export const plainQty = (n: number) => Number(n.toFixed(2)).toLocaleString('zh-TW', { maximumFractionDigits: 2 });
const signed = (n: number) => (n > 0 ? '+' : n < 0 ? '−' : '') + plainQty(Math.abs(n));

/** 這項原料要不要用「大單位＋小單位」顯示。 */
export function byPack(item: PackInfo | undefined | null): boolean {
  return !!item && !!item.displayByPack && !!item.packUnit && !!item.perPack && item.perPack > 0;
}

/** 拆成幾個大單位＋剩下的小單位（數量 ≥ 0）。 */
export function splitPack(qty: number, item: PackInfo): { packs: number; loose: number } {
  const per = cents(item.perPack!);
  const total = cents(Math.max(0, qty));
  const packs = Math.floor(total / per);
  return { packs, loose: (total - packs * per) / 100 };
}

/** 例如 153 → 「5 籃 3 顆」；150 → 「5 籃」；3 → 「3 顆」；一般原料 → 「120 個」。 */
export function formatQty(qty: number, item: PackInfo): string {
  if (!byPack(item)) return `${plainQty(qty)} ${item.baseUnit}`;
  const { packs, loose } = splitPack(qty, item);
  const parts: string[] = [];
  if (packs) parts.push(`${packs} ${item.packUnit}`);
  if (loose || !packs) parts.push(`${plainQty(loose)} ${item.baseUnit}`);
  return parts.join(' ');
}

/**
 * 實點和帳面的差異。大單位＋小單位的原料分開顯示，例如帳面 5 籃 3 顆、實點 4 籃 20 顆 →「−1 籃、+17 顆」，
 * 不顯示成看不懂的「−13 顆」。一般原料顯示「−5 個」。沒有差異回傳空字串。
 */
export function formatDiff(counted: number, book: number, item: PackInfo): string {
  if (!byPack(item)) {
    const d = (cents(counted) - cents(book)) / 100;
    return d === 0 ? '' : `${signed(d)} ${item.baseUnit}`;
  }
  const a = splitPack(counted, item), b = splitPack(book, item);
  const dp = a.packs - b.packs, dl = (cents(a.loose) - cents(b.loose)) / 100;
  const parts: string[] = [];
  if (dp) parts.push(`${signed(dp)} ${item.packUnit}`);
  if (dl) parts.push(`${signed(dl)} ${item.baseUnit}`);
  return parts.join('、');
}

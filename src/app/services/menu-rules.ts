import { Product, Rule, Selection, Topping, cents, sizePrice, sizesOf } from '../models/pos';

// 客製彈窗的預設值；容量選這杯有賣的最小容量。套規則後可能變成飲料限定的冰甜，例如冰沙。
export function initialSelection(product?: Product): Selection {
  return { size: (product && sizesOf(product)[0]) ?? 'M', temperature: 'COLD', sugar: 'HALF', ice: 'LESS', qty: 1, toppingIds: [], note: '' };
}
export function matches(rule: Rule, product: Product, selection: Selection): boolean {
  const c = rule.condition_json;
  return c.always !== false && (c.category === undefined || c.category === product.category)
    && (c.temperatureIn === undefined || c.temperatureIn.includes(selection.temperature));
}
/** 前端先幫店員調整選項、提示衝突；真正送單時後端 RuleService 仍會重新驗證。 */
export function applyRules(product: Product, original: Selection, rules: Rule[]): {
  selection: Selection; blocked: Record<number, string>; locked: Record<string, string>; notices: string[];
} {
  // 複製一份選項與加料陣列，避免套規則時直接改到原本購物車的資料。
  const selection = { ...original, toppingIds: [...original.toppingIds] };
  const blocked: Record<number, string> = {};
  const locked: Record<string, string> = {};
  const notices: string[] = [];
  // 先套固定規格與鎖定欄位，再以調整後的溫度等條件判斷加料禁用／互斥。
  for (const rule of rules) {
    if (rule.rule_type !== 'AUTO_ADJUST' || !matches(rule, product, selection)) continue;
    Object.assign(selection, rule.action_json.set ?? {});
    for (const field of rule.action_json.lockFields ?? []) locked[field] = rule.message;
  }
  for (const rule of rules) {
    if (!matches(rule, product, selection)) continue;
    if (rule.rule_type === 'FORBID') {
      for (const id of rule.action_json.forbidToppingIds ?? []) {
        blocked[id] = rule.message;
        if (selection.toppingIds.includes(id)) {
          selection.toppingIds = selection.toppingIds.filter(selected => selected !== id);
          notices.push(rule.message + '，已移除衝突加料。');
        }
      }
    }
    if (rule.rule_type === 'MUTEX') {
      const group = rule.action_json.toppingIds ?? [];
      const chosen = selection.toppingIds.filter(id => group.includes(id));
      if (chosen.length) for (const id of group) if (!chosen.includes(id)) blocked[id] = rule.message;
    }
  }
  return { selection, blocked, locked, notices };
}
// 多條上限同時成立時取最小值；這裡限制的是加料種類數，不是杯數。
export function toppingLimit(product: Product, selection: Selection, rules: Rule[]): number {
  return rules.filter(rule => rule.rule_type === 'MAX_COUNT' && matches(rule, product, selection))
    .reduce((limit, rule) => Math.min(limit, rule.action_json.maxDistinct ?? limit), 20);
}
// 顯示用單杯價格 = 這個容量的價格＋額外加料；不是整列總價，尚未乘 qty。
export function unitCents(product: Product, selection: Selection, toppings: Topping[]): number {
  return cents(sizePrice(product, selection.size) ?? 0)
    + toppings.filter(t => selection.toppingIds.includes(t.topping_id)).reduce((sum, t) => sum + cents(t.price), 0);
}

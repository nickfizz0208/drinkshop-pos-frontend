import { Product, Rule, Selection, Topping, cents } from '../models/pos';

export function initialSelection(): Selection {
  return { size: 'M', temperature: 'COLD', sugar: 'HALF', ice: 'LESS', qty: 1, toppingIds: [], note: '' };
}
export function matches(rule: Rule, product: Product, selection: Selection): boolean {
  const c = rule.condition_json;
  return c.always !== false && (c.category === undefined || c.category === product.category)
    && (c.temperatureIn === undefined || c.temperatureIn.includes(selection.temperature));
}
export function applyRules(product: Product, original: Selection, rules: Rule[]): {
  selection: Selection; blocked: Record<number, string>; locked: Record<string, string>; notices: string[];
} {
  const selection = { ...original, toppingIds: [...original.toppingIds] };
  const blocked: Record<number, string> = {};
  const locked: Record<string, string> = {};
  const notices: string[] = [];
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
export function toppingLimit(product: Product, selection: Selection, rules: Rule[]): number {
  return rules.filter(rule => rule.rule_type === 'MAX_COUNT' && matches(rule, product, selection))
    .reduce((limit, rule) => Math.min(limit, rule.action_json.maxDistinct ?? limit), 20);
}
export function unitCents(product: Product, selection: Selection, toppings: Topping[]): number {
  return cents(product.base_price) + (selection.size === 'L' ? cents(product.large_extra) : 0)
    + toppings.filter(t => selection.toppingIds.includes(t.topping_id)).reduce((sum, t) => sum + cents(t.price), 0);
}

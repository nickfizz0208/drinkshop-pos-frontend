import { LegacyTemperature, Product, Rule, Selection, Sugar, TEMP_ICE_LABELS, SUGAR_LABELS, TempIce, Topping, cents, freeToppingId, isHotOrWarm, sizePrice, sizesOf } from '../models/pos';

// 客製彈窗的預設值；容量選這杯有賣的最小容量。套規則後可能變成飲料限定的冰甜，例如冰沙。
export function initialSelection(product?: Product): Selection {
  return { size: (product && sizesOf(product)[0]) ?? 'M', tempIce: 'LESS', sugar: 'S5', qty: 1, toppingIds: [], optionIds: [], note: '' };
}

// ---- 舊規則換算（038）：資料庫 conflict_rule 還是用溫度 COLD/WARM/HOT、冰量、舊甜度寫的；後端 RuleService 用同樣的換算 ----
/** 舊的溫度：熱、溫照舊，其他（含常溫）都算冷飲。 */
export function legacyTemperature(value: TempIce): LegacyTemperature { return isHotOrWarm(value) ? value as LegacyTemperature : 'COLD'; }
const LEGACY_ICE: Record<string, TempIce> = { NONE: 'NO_ICE', LIGHT: 'LIGHT', LESS: 'LESS', NORMAL: 'NORMAL' };
const LEGACY_SUGAR: Record<string, Sugar> = { NORMAL: 'S10', LESS: 'S7', HALF: 'S5', LIGHT: 'S3' };
/** 規則裡的甜度：新值直接用，舊值換算（正常→10 分、少→7 分、半→5 分、微→3 分）。 */
export function ruleSugar(value: string): Sugar | undefined {
  return LEGACY_SUGAR[value] ?? (value in SUGAR_LABELS ? value as Sugar : undefined);
}
/** 把規則的固定值套到這杯：新寫法 tempIce、sugar；舊寫法 temperature、ice 換成溫度冰量。 */
function applySet(selection: Selection, set: NonNullable<Rule['action_json']['set']>): void {
  if (set.tempIce && set.tempIce in TEMP_ICE_LABELS) selection.tempIce = set.tempIce as TempIce;
  else {
    if (set.temperature === 'HOT' || set.temperature === 'WARM') selection.tempIce = set.temperature;
    else if (set.temperature === 'COLD' && isHotOrWarm(selection.tempIce)) selection.tempIce = LEGACY_ICE[set.ice ?? ''] ?? 'NORMAL';
    // 舊的固定冰量只對冷飲有意義；溫熱飲本來就不加冰（例如舊規則「溫熱飲不加冰塊」）
    if (set.ice && !isHotOrWarm(selection.tempIce) && LEGACY_ICE[set.ice]) selection.tempIce = LEGACY_ICE[set.ice];
  }
  const sugar = set.sugar ? ruleSugar(set.sugar) : undefined;
  if (sugar) selection.sugar = sugar;
}
/** 規則鎖住的欄位：temperature、ice（舊）都鎖溫度冰量；舊的冰量鎖定只對冷飲有意義。 */
function lockedField(field: string, selection: Selection): 'tempIce' | 'sugar' | null {
  if (field === 'sugar') return 'sugar';
  if (field === 'tempIce' || field === 'temperature') return 'tempIce';
  if (field === 'ice') return isHotOrWarm(selection.tempIce) ? null : 'tempIce';
  return null;
}

export function matches(rule: Rule, product: Product, selection: Selection): boolean {
  const c = rule.condition_json;
  return c.always !== false && (c.category === undefined || c.category === product.category)
    && (c.temperatureIn === undefined || c.temperatureIn.includes(legacyTemperature(selection.tempIce)))
    && (c.tempIceIn === undefined || c.tempIceIn.includes(selection.tempIce));
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
    applySet(selection, rule.action_json.set ?? {});
    for (const field of rule.action_json.lockFields ?? []) {
      const key = lockedField(field, selection);
      if (key) locked[key] = rule.message;
    }
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
  // 上限算加料「種類」：同一種加兩份只算一種（比較時用 new Set(toppingIds).size）
  return rules.filter(rule => rule.rule_type === 'MAX_COUNT' && matches(rule, product, selection))
    .reduce((limit, rule) => Math.min(limit, rule.action_json.maxDistinct ?? limit), 20);
}
// 顯示用單杯價格 = 這個容量的價格＋額外加料；不是整列總價，尚未乘 qty。
export function unitCents(product: Product, selection: Selection, toppings: Topping[]): number {
  const free = freeToppingId(product, selection.toppingIds, toppings);
  return cents(sizePrice(product, selection.size) ?? 0)
    // 同一種加料加兩份就算兩次錢（039）
    + selection.toppingIds.reduce((sum, id) => sum + cents(toppings.find(t => t.topping_id === id)?.price ?? 0), 0)
    // 奶茶、鮮奶的第一份 free 加料不用錢（046）
    - (free === null ? 0 : cents(toppings.find(t => t.topping_id === free)?.price ?? 0));
}

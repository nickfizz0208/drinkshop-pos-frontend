import { Menu, Rule } from '../models/pos';

// Explicit read-only preview, matching the five fictional seeded products.
export const PREVIEW_MENU: Menu = {
  products: [
    { product_id: 1, name: '經典紅茶', category: '茶類', base_price: 25, large_extra: 5, hot_allowed: true },
    { product_id: 2, name: '茉香綠茶', category: '茶類', base_price: 25, large_extra: 5, hot_allowed: true },
    { product_id: 3, name: '經典奶茶', category: '奶茶', base_price: 40, large_extra: 10, hot_allowed: true },
    { product_id: 4, name: '珍珠奶茶', category: '奶茶', base_price: 50, large_extra: 10, hot_allowed: true },
    { product_id: 5, name: '芒果冰沙', category: '冰沙', base_price: 55, large_extra: 10, hot_allowed: false }
  ],
  toppings: [{ topping_id: 1, name: '珍珠', price: 10 }, { topping_id: 2, name: '茶凍', price: 10 }]
};
export const PREVIEW_RULES: Rule[] = [
  { rule_id: 1, rule_type: 'FORBID', condition_json: { temperatureIn: ['WARM', 'HOT'] }, action_json: { forbidToppingIds: [2] }, message: '溫熱飲不可加茶凍' },
  { rule_id: 2, rule_type: 'AUTO_ADJUST', condition_json: { category: '冰沙' }, action_json: { set: { temperature: 'COLD', sugar: 'NORMAL', ice: 'NORMAL' }, lockFields: ['temperature', 'sugar', 'ice'] }, message: '冰沙固定冰量與甜度' },
  { rule_id: 3, rule_type: 'AUTO_ADJUST', condition_json: { temperatureIn: ['WARM', 'HOT'] }, action_json: { set: { ice: 'NONE' }, lockFields: ['ice'] }, message: '溫熱飲不加冰塊' },
  { rule_id: 4, rule_type: 'MAX_COUNT', condition_json: { always: true }, action_json: { field: 'toppingIds', maxDistinct: 3 }, message: '額外加料最多三種' }
];

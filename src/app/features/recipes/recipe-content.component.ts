import { Component, Input } from '@angular/core';
import { RecipeDetail } from '../../models/recipe';

@Component({
  selector: 'app-recipe-content',
  template: `
    <section>
      <h3>材料</h3>
      @if (recipe.materials.length) {
        <ul>
          @for (material of recipe.materials; track material.kind + ':' + material.id) {
            <li>
              <div class="material-line">
                <span>
                  <strong>{{ material.name }}</strong>
                  @if (material.kind === 'PREP') { <small class="muted">半成品</small> }
                </span>
                <span class="material-portions muted">{{ material.portions == null ? '份數未設定' : material.portions + ' 份' }}</span>
              </div>
              @if (material.kind === 'PREP' && material.madeFrom.length) {
                <p class="muted">原料：{{ material.madeFrom.join('、') }}</p>
              }
            </li>
          }
        </ul>
      } @else {
        <p class="muted">尚未建立材料清單。</p>
      }
    </section>
    <section>
      <h3>製作步驟</h3>
      @if (recipe.steps) {
        <p class="recipe-steps">{{ recipe.steps }}</p>
      } @else {
        <p class="muted">尚未記錄製作步驟。</p>
      }
    </section>
  `,
  styles: `
    :host { display: grid; gap: 20px; overflow-wrap: anywhere; }
    h3 { margin: 0 0 10px; font-size: 17px; }
    p, ul { margin: 0; }
    ul { list-style: none; padding: 0; }
    li { padding: 10px 0; border-bottom: 1px solid var(--border-color); }
    li p { margin-top: 4px; }
    small { margin-inline-start: 8px; }
    .material-line { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; }
    .material-portions { flex: none; font-size: 14px; }
    .recipe-steps { white-space: pre-wrap; line-height: 1.65; }
  `
})
export class RecipeContentComponent {
  @Input({ required: true }) recipe!: RecipeDetail;
}

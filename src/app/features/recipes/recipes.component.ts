import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RecipeDetail, RecipeMaterial, RecipeSummary } from '../../models/recipe';
import { PosApiService, errorMessage } from '../../services/pos-api.service';
import { IconComponent } from '../../shared/icon.component';
import { ModalComponent } from '../../shared/modal.component';
import { RecipeContentComponent } from './recipe-content.component';

@Component({
  selector: 'app-recipes',
  imports: [FormsModule, IconComponent, ModalComponent, RecipeContentComponent],
  templateUrl: './recipes.component.html',
  styleUrl: './recipes.component.scss'
})
export class RecipesComponent implements OnInit {
  private readonly api = inject(PosApiService);
  private detailRequest = 0;

  recipes: RecipeSummary[] = [];
  keyword = '';
  category = '';
  loading = true;
  listError = '';
  selected: RecipeSummary | null = null;
  detail: RecipeDetail | null = null;
  detailError = '';
  draft: { steps: string; materials: RecipeMaterial[] } | null = null;
  saving = false;
  saveError = '';
  saved = false;

  get canEdit(): boolean {
    const level = this.api.staff()?.level;
    return level === 'MANAGER' || level === 'HQ';
  }

  ngOnInit(): void { void this.load(); }

  get categories(): string[] {
    return [...new Set(this.recipes.map(recipe => recipe.category))];
  }

  get visibleRecipes(): RecipeSummary[] {
    const keyword = this.keyword.trim().toLocaleLowerCase('zh-TW');
    return this.recipes.filter(recipe =>
      (!this.category || recipe.category === this.category)
      && recipe.name.toLocaleLowerCase('zh-TW').includes(keyword));
  }

  async load(): Promise<void> {
    this.loading = true;
    this.listError = '';
    try {
      this.recipes = await this.api.recipes();
    } catch (error) {
      this.listError = errorMessage(error);
    } finally {
      this.loading = false;
    }
  }

  async open(recipe: RecipeSummary): Promise<void> {
    const request = ++this.detailRequest;
    this.selected = recipe;
    this.detail = null;
    this.detailError = '';
    this.saved = false;
    try {
      const detail = await this.api.recipe(recipe.productId);
      if (request === this.detailRequest) this.detail = detail;
    } catch (error) {
      if (request === this.detailRequest) this.detailError = errorMessage(error);
    }
  }

  close(): void {
    this.detailRequest++;
    this.selected = null;
    this.detail = null;
    this.detailError = '';
    this.cancelEdit();
  }

  edit(detail: RecipeDetail): void {
    if (!this.canEdit) return;
    this.saved = false;
    this.draft = {
      steps: detail.steps ?? '',
      materials: detail.materials.map(material => ({ ...material }))
    };
  }

  cancelEdit(): void {
    this.draft = null;
    this.saveError = '';
  }

  async save(detail: RecipeDetail): Promise<void> {
    if (!this.canEdit || this.saving || !this.draft) return;
    const { steps, materials } = this.draft;
    const invalid = materials.find(({ portions }) => portions !== null &&
      (!Number.isFinite(portions) || portions < 0.01 || portions > 999999.99
        || Math.round(portions * 100) / 100 !== portions));
    if (invalid) {
      this.saveError = `${invalid.name}的份數須為 0.01 到 999999.99，最多兩位小數。`;
      return;
    }
    this.saving = true;
    this.saveError = '';
    try {
      this.detail = await this.api.updateRecipe(detail.productId, {
        version: detail.version,
        steps,
        materials: materials.map(({ kind, id, portions }) => ({ kind, id, portions }))
      });
      this.cancelEdit();
      this.saved = true;
    } catch (error) {
      this.saveError = errorMessage(error);
    } finally {
      this.saving = false;
    }
  }
}

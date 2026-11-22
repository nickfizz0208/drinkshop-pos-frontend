import { NumpadButtonComponent } from '../../shared/numpad-button.component';
import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RecipeDetail, RecipeMaterial, RecipeMaterialOption, RecipeSummary } from '../../models/recipe';
import { PosApiService, errorMessage } from '../../services/pos-api.service';
import { IconComponent } from '../../shared/icon.component';
import { ModalComponent } from '../../shared/modal.component';
import { RecipeContentComponent } from './recipe-content.component';

@Component({
  selector: 'app-recipes',
  imports: [NumpadButtonComponent, FormsModule, IconComponent, ModalComponent, RecipeContentComponent],
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
  materialOptions: RecipeMaterialOption[] = [];
  materialOptionsError = '';
  selectedNewMaterialKey = '';
  saving = false;
  saveError = '';
  saved = false;

  get isHq(): boolean {
    return this.api.staff()?.level === 'HQ';
  }

  get canEdit(): boolean {
    const level = this.api.staff()?.level;
    return level === 'MANAGER' || level === 'HQ';
  }

  get availableMaterialOptions(): RecipeMaterialOption[] {
    if (!this.draft) return [];
    const used = new Set(this.draft.materials.map(m => `${m.kind}:${m.id}`));
    return this.materialOptions.filter(opt => !used.has(`${opt.kind}:${opt.id}`));
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

  async open(recipe: RecipeSummary, startEditing = false): Promise < void> {
      const request = ++this.detailRequest;
      this.selected = recipe;
      this.detail = null;
      this.detailError = '';
      this.saved = false;
      this.cancelEdit();
      try {
        const detail = await this.api.recipe(recipe.productId);
      if(request === this.detailRequest) {
      this.detail = detail;
      if (startEditing && this.canEdit) {
        void this.edit(detail);
      }
    }
  } catch(error) {
    if (request === this.detailRequest) this.detailError = errorMessage(error);
  }
}

openForEdit(recipe: RecipeSummary, event: Event): void {
  event.stopPropagation();
  void this.open(recipe, true);
}

close(): void {
  this.detailRequest++;
  this.selected = null;
  this.detail = null;
  this.detailError = '';
  this.cancelEdit();
}

  async edit(detail: RecipeDetail): Promise<void> {
    if (!this.canEdit) return;
    this.saved = false;
    this.selectedNewMaterialKey = '';
    this.materialOptionsError = '';
    this.draft = {
      steps: detail.steps ?? '',
      materials: detail.materials.map(material => ({ ...material }))
    };
    if (this.isHq && this.materialOptions.length === 0) {
      try {
        this.materialOptions = await this.api.recipeMaterialOptions();
      } catch (error) {
        this.materialOptionsError = errorMessage(error);
      }
    }
  }

  addMaterial(): void {
    if (!this.isHq || !this.draft || !this.selectedNewMaterialKey) return;
    const [kind, idStr] = this.selectedNewMaterialKey.split(':');
    const id = Number(idStr);
    const opt = this.materialOptions.find(o => o.kind === kind && o.id === id);
    if (!opt) return;
    this.draft.materials.push({
      kind: opt.kind,
      id: opt.id,
      name: opt.name,
      madeFrom: opt.madeFrom,
      portions: 1
    });
    this.selectedNewMaterialKey = '';
  }

  removeMaterial(kind: 'INVENTORY' | 'PREP', id: number): void {
    if (!this.isHq || !this.draft) return;
    this.draft.materials = this.draft.materials.filter(m => !(m.kind === kind && m.id === id));
  }

  cancelEdit(): void {
    this.draft = null;
    this.selectedNewMaterialKey = '';
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
        const updated = await this.api.updateRecipe(detail.productId, {
          version: detail.version,
          steps,
          materials: materials.map(({ kind, id, portions }) => ({ kind, id, portions }))
        });
        this.detail = updated;
        this.recipes = this.recipes.map(item =>
          item.productId === updated.productId ? { ...item, recipeStatus: updated.recipeStatus } : item
        );
        this.cancelEdit();
        this.saved = true;
      } catch (error) {
        this.saveError = errorMessage(error);
      } finally {
        this.saving = false;
      }
    }
}

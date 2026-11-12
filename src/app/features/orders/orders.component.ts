import { IconComponent } from '../../shared/icon.component';
import { Component, OnDestroy, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ModalComponent } from '../../shared/modal.component';
import { UiStateService } from '../../shared/ui-state.service';
import { OrdersStateService } from './orders-state.service';
import { OrderItem } from '../../models/pos';
import { RecipeDetail } from '../../models/recipe';
import { PosApiService, errorMessage } from '../../services/pos-api.service';
import { RecipeContentComponent } from '../recipes/recipe-content.component';

@Component({
  selector: 'app-orders',
  imports: [IconComponent, FormsModule, ModalComponent, RecipeContentComponent],
  templateUrl: './orders.component.html',
  styleUrl: './orders.component.scss'
})
export class OrdersComponent implements OnDestroy {
  readonly state = inject(OrdersStateService);
  readonly ui = inject(UiStateService);
  private readonly api = inject(PosApiService);
  private recipeRequest = 0;
  recipeItem: OrderItem | null = null;
  recipe: RecipeDetail | null = null;
  recipeError = '';

  async openRecipe(item: OrderItem): Promise<void> {
    if (!item.product_id || this.ui.busy) return;
    const request = ++this.recipeRequest;
    this.recipeItem = item;
    this.recipe = null;
    this.recipeError = '';
    try {
      const recipe = await this.api.recipe(item.product_id);
      if (request === this.recipeRequest) this.recipe = recipe;
    } catch (error) {
      if (request === this.recipeRequest) this.recipeError = errorMessage(error);
    }
  }

  closeRecipe(): void {
    this.recipeRequest++;
    this.recipeItem = null;
    this.recipe = null;
    this.recipeError = '';
  }

  ngOnDestroy(): void {
    this.closeRecipe();
    this.state.closeTransient();
  }
}

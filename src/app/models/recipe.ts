export interface RecipeSummary {
  productId: number;
  name: string;
  category: string;
  recipeStatus: 'OK' | 'MISSING';
}

export interface RecipeMaterial {
  id: number;
  kind: 'INVENTORY' | 'PREP';
  name: string;
  madeFrom: string[];
  portions: number | null;
}

export interface RecipeDetail extends RecipeSummary {
  materials: RecipeMaterial[];
  steps: string | null;
  watermark: string;
  version: string;
}

export interface RecipeUpdate {
  version: string;
  steps: string;
  materials: Pick<RecipeMaterial, 'kind' | 'id' | 'portions'>[];
}

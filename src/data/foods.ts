import type { SavedFood } from '../domain/types';

/** A small starter food database for search (per serving). Extendable/replaceable by a real API. */
export const FOOD_DB: SavedFood[] = [
  { id: 'chicken_breast', name: 'Grilled Chicken Breast', servingLabel: '100 g', calories: 165, proteinG: 31, carbsG: 0, fatG: 3.6 },
  { id: 'white_rice', name: 'White Rice, cooked', servingLabel: '1 cup', calories: 205, proteinG: 4.3, carbsG: 45, fatG: 0.4 },
  { id: 'brown_rice', name: 'Brown Rice, cooked', servingLabel: '1 cup', calories: 216, proteinG: 5, carbsG: 45, fatG: 1.8, fiberG: 3.5 },
  { id: 'whole_eggs', name: 'Whole Egg', servingLabel: '1 large', calories: 72, proteinG: 6.3, carbsG: 0.4, fatG: 4.8 },
  { id: 'egg_whites', name: 'Egg Whites', servingLabel: '1 cup', calories: 126, proteinG: 26, carbsG: 1.8, fatG: 0.4 },
  { id: 'oats', name: 'Rolled Oats, dry', servingLabel: '1/2 cup', calories: 150, proteinG: 5, carbsG: 27, fatG: 3, fiberG: 4 },
  { id: 'greek_yogurt', name: 'Nonfat Greek Yogurt', servingLabel: '170 g', calories: 100, proteinG: 17, carbsG: 6, fatG: 0.7 },
  { id: 'whey', name: 'Whey Protein', servingLabel: '1 scoop', calories: 120, proteinG: 25, carbsG: 3, fatG: 1.5 },
  { id: 'banana', name: 'Banana', servingLabel: '1 medium', calories: 105, proteinG: 1.3, carbsG: 27, fatG: 0.4, fiberG: 3.1 },
  { id: 'apple', name: 'Apple', servingLabel: '1 medium', calories: 95, proteinG: 0.5, carbsG: 25, fatG: 0.3, fiberG: 4.4 },
  { id: 'peanut_butter', name: 'Peanut Butter', servingLabel: '2 tbsp', calories: 190, proteinG: 8, carbsG: 7, fatG: 16, fiberG: 2 },
  { id: 'almonds', name: 'Almonds', servingLabel: '28 g', calories: 164, proteinG: 6, carbsG: 6, fatG: 14, fiberG: 3.5 },
  { id: 'olive_oil', name: 'Olive Oil', servingLabel: '1 tbsp', calories: 119, proteinG: 0, carbsG: 0, fatG: 13.5 },
  { id: 'salmon', name: 'Salmon, cooked', servingLabel: '100 g', calories: 208, proteinG: 20, carbsG: 0, fatG: 13 },
  { id: 'ground_beef_90', name: 'Ground Beef 90/10, cooked', servingLabel: '100 g', calories: 176, proteinG: 20, carbsG: 0, fatG: 10 },
  { id: 'sweet_potato', name: 'Sweet Potato, baked', servingLabel: '1 medium', calories: 112, proteinG: 2, carbsG: 26, fatG: 0.1, fiberG: 3.9 },
  { id: 'broccoli', name: 'Broccoli, cooked', servingLabel: '1 cup', calories: 55, proteinG: 3.7, carbsG: 11, fatG: 0.6, fiberG: 5 },
  { id: 'avocado', name: 'Avocado', servingLabel: '1/2 fruit', calories: 160, proteinG: 2, carbsG: 9, fatG: 15, fiberG: 7 },
  { id: 'protein_bar', name: 'Protein Bar', servingLabel: '1 bar', calories: 210, proteinG: 20, carbsG: 22, fatG: 7, fiberG: 8 },
  { id: 'burrito_bowl', name: 'Chicken Burrito Bowl', servingLabel: '1 bowl', calories: 780, proteinG: 52, carbsG: 74, fatG: 24, fiberG: 9 },
];

export function searchFoods(query: string, limit = 20): SavedFood[] {
  const q = query.trim().toLowerCase();
  if (!q) return FOOD_DB.slice(0, limit);
  return FOOD_DB.filter((f) => f.name.toLowerCase().includes(q)).slice(0, limit);
}

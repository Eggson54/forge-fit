import type { SavedFood } from '../domain/types';

/**
 * Staple foods that ship with the app.
 *
 * Generic whole foods and the handful of prepared things everybody eats — no
 * brands, because a brand's recipe changes and a stale figure with a familiar
 * name on it is worse than no entry at all. Values are per the serving shown
 * and come from the standard published composition tables; they are close
 * enough to log against and are not a substitute for reading a label.
 *
 * This list exists so that food logging works on a plane, in a basement, and
 * on the day somebody's API key expires. Anything else the athlete eats they
 * add themselves or scan once, and those outrank these in search.
 */
export const FOOD_DB: SavedFood[] = [
  // ---------------------------------------------------------- protein ----
  { id: 'chicken_breast', name: 'Chicken Breast, grilled', servingLabel: '100 g', calories: 165, proteinG: 31, carbsG: 0, fatG: 3.6 },
  { id: 'chicken_thigh', name: 'Chicken Thigh, skinless', servingLabel: '100 g', calories: 179, proteinG: 24.8, carbsG: 0, fatG: 8.2 },
  { id: 'chicken_whole_roast', name: 'Roast Chicken, meat only', servingLabel: '100 g', calories: 190, proteinG: 29, carbsG: 0, fatG: 7.4 },
  { id: 'turkey_breast', name: 'Turkey Breast, roasted', servingLabel: '100 g', calories: 135, proteinG: 30, carbsG: 0, fatG: 1 },
  { id: 'turkey_mince_93', name: 'Turkey Mince 93/7, cooked', servingLabel: '100 g', calories: 176, proteinG: 27, carbsG: 0, fatG: 7.5 },
  { id: 'ground_beef_90', name: 'Beef Mince 90/10, cooked', servingLabel: '100 g', calories: 176, proteinG: 20, carbsG: 0, fatG: 10 },
  { id: 'ground_beef_80', name: 'Beef Mince 80/20, cooked', servingLabel: '100 g', calories: 254, proteinG: 25, carbsG: 0, fatG: 17 },
  { id: 'steak_sirloin', name: 'Sirloin Steak, grilled', servingLabel: '100 g', calories: 207, proteinG: 29, carbsG: 0, fatG: 9.2 },
  { id: 'steak_ribeye', name: 'Ribeye Steak, grilled', servingLabel: '100 g', calories: 291, proteinG: 24, carbsG: 0, fatG: 21 },
  { id: 'pork_loin', name: 'Pork Loin, roasted', servingLabel: '100 g', calories: 201, proteinG: 27, carbsG: 0, fatG: 9.7 },
  { id: 'bacon', name: 'Bacon, cooked', servingLabel: '2 rashers', calories: 87, proteinG: 6, carbsG: 0.2, fatG: 6.8 },
  { id: 'lamb_leg', name: 'Lamb Leg, roasted', servingLabel: '100 g', calories: 258, proteinG: 26, carbsG: 0, fatG: 17 },
  { id: 'salmon', name: 'Salmon, cooked', servingLabel: '100 g', calories: 208, proteinG: 20, carbsG: 0, fatG: 13 },
  { id: 'tuna_canned', name: 'Tuna, canned in water', servingLabel: '100 g', calories: 116, proteinG: 26, carbsG: 0, fatG: 0.8 },
  { id: 'cod', name: 'Cod, baked', servingLabel: '100 g', calories: 105, proteinG: 23, carbsG: 0, fatG: 0.9 },
  { id: 'prawns', name: 'Prawns, cooked', servingLabel: '100 g', calories: 99, proteinG: 24, carbsG: 0.2, fatG: 0.3 },
  { id: 'sardines', name: 'Sardines, canned in oil', servingLabel: '100 g', calories: 208, proteinG: 25, carbsG: 0, fatG: 11.5 },
  { id: 'whole_eggs', name: 'Egg, whole', servingLabel: '1 large', calories: 72, proteinG: 6.3, carbsG: 0.4, fatG: 4.8 },
  { id: 'egg_whites', name: 'Egg White', servingLabel: '1 cup', calories: 126, proteinG: 26, carbsG: 1.8, fatG: 0.4 },
  { id: 'tofu_firm', name: 'Tofu, firm', servingLabel: '100 g', calories: 144, proteinG: 17, carbsG: 3, fatG: 9, fiberG: 2.3 },
  { id: 'tempeh', name: 'Tempeh', servingLabel: '100 g', calories: 192, proteinG: 20, carbsG: 8, fatG: 11, fiberG: 6 },
  { id: 'seitan', name: 'Seitan', servingLabel: '100 g', calories: 141, proteinG: 25, carbsG: 14, fatG: 1.9, fiberG: 0.6 },
  { id: 'whey', name: 'Whey Protein Powder', servingLabel: '1 scoop', calories: 120, proteinG: 25, carbsG: 3, fatG: 1.5 },
  { id: 'casein', name: 'Casein Protein Powder', servingLabel: '1 scoop', calories: 120, proteinG: 24, carbsG: 4, fatG: 1 },
  { id: 'plant_protein', name: 'Plant Protein Powder', servingLabel: '1 scoop', calories: 130, proteinG: 22, carbsG: 6, fatG: 2.5, fiberG: 3 },

  // ------------------------------------------------------------ dairy ----
  { id: 'greek_yogurt', name: 'Greek Yogurt, nonfat', servingLabel: '170 g', calories: 100, proteinG: 17, carbsG: 6, fatG: 0.7 },
  { id: 'greek_yogurt_full', name: 'Greek Yogurt, whole milk', servingLabel: '170 g', calories: 165, proteinG: 15, carbsG: 7, fatG: 9 },
  { id: 'skyr', name: 'Skyr', servingLabel: '150 g', calories: 96, proteinG: 17, carbsG: 6, fatG: 0.3 },
  { id: 'cottage_cheese', name: 'Cottage Cheese, low fat', servingLabel: '100 g', calories: 81, proteinG: 11, carbsG: 3.4, fatG: 2.3 },
  { id: 'milk_whole', name: 'Milk, whole', servingLabel: '250 ml', calories: 156, proteinG: 8, carbsG: 12, fatG: 8.3 },
  { id: 'milk_skim', name: 'Milk, skimmed', servingLabel: '250 ml', calories: 86, proteinG: 8.4, carbsG: 12, fatG: 0.4 },
  { id: 'oat_milk', name: 'Oat Milk', servingLabel: '250 ml', calories: 120, proteinG: 3, carbsG: 16, fatG: 5, fiberG: 2 },
  { id: 'almond_milk', name: 'Almond Milk, unsweetened', servingLabel: '250 ml', calories: 30, proteinG: 1, carbsG: 1, fatG: 2.5 },
  { id: 'cheddar', name: 'Cheddar Cheese', servingLabel: '30 g', calories: 120, proteinG: 7, carbsG: 0.4, fatG: 10 },
  { id: 'mozzarella', name: 'Mozzarella', servingLabel: '30 g', calories: 85, proteinG: 6.3, carbsG: 0.6, fatG: 6.3 },
  { id: 'feta', name: 'Feta', servingLabel: '30 g', calories: 79, proteinG: 4.3, carbsG: 1.2, fatG: 6.4 },
  { id: 'parmesan', name: 'Parmesan', servingLabel: '15 g', calories: 63, proteinG: 5.7, carbsG: 0.5, fatG: 4.2 },
  { id: 'butter', name: 'Butter', servingLabel: '1 tbsp', calories: 102, proteinG: 0.1, carbsG: 0, fatG: 11.5 },

  // -------------------------------------------------------- carb base ----
  { id: 'white_rice', name: 'White Rice, cooked', servingLabel: '1 cup', calories: 205, proteinG: 4.3, carbsG: 45, fatG: 0.4, fiberG: 0.6 },
  { id: 'brown_rice', name: 'Brown Rice, cooked', servingLabel: '1 cup', calories: 216, proteinG: 5, carbsG: 45, fatG: 1.8, fiberG: 3.5 },
  { id: 'basmati_rice', name: 'Basmati Rice, cooked', servingLabel: '1 cup', calories: 191, proteinG: 4.4, carbsG: 40, fatG: 0.6, fiberG: 0.7 },
  { id: 'pasta', name: 'Pasta, cooked', servingLabel: '1 cup', calories: 221, proteinG: 8.1, carbsG: 43, fatG: 1.3, fiberG: 2.5 },
  { id: 'pasta_wholewheat', name: 'Wholewheat Pasta, cooked', servingLabel: '1 cup', calories: 174, proteinG: 7.5, carbsG: 37, fatG: 0.8, fiberG: 6 },
  { id: 'potato', name: 'Potato, boiled', servingLabel: '1 medium', calories: 130, proteinG: 3, carbsG: 30, fatG: 0.2, fiberG: 2.2 },
  { id: 'sweet_potato', name: 'Sweet Potato, baked', servingLabel: '1 medium', calories: 112, proteinG: 2, carbsG: 26, fatG: 0.1, fiberG: 3.9 },
  { id: 'oats', name: 'Rolled Oats, dry', servingLabel: '1/2 cup', calories: 150, proteinG: 5, carbsG: 27, fatG: 3, fiberG: 4 },
  { id: 'quinoa', name: 'Quinoa, cooked', servingLabel: '1 cup', calories: 222, proteinG: 8.1, carbsG: 39, fatG: 3.6, fiberG: 5.2 },
  { id: 'couscous', name: 'Couscous, cooked', servingLabel: '1 cup', calories: 176, proteinG: 6, carbsG: 36, fatG: 0.3, fiberG: 2.2 },
  { id: 'bread_white', name: 'White Bread', servingLabel: '1 slice', calories: 79, proteinG: 2.7, carbsG: 15, fatG: 1, fiberG: 0.8 },
  { id: 'bread_wholemeal', name: 'Wholemeal Bread', servingLabel: '1 slice', calories: 82, proteinG: 4, carbsG: 14, fatG: 1.1, fiberG: 2 },
  { id: 'sourdough', name: 'Sourdough Bread', servingLabel: '1 slice', calories: 93, proteinG: 3.7, carbsG: 18, fatG: 0.6, fiberG: 0.8 },
  { id: 'bagel', name: 'Bagel, plain', servingLabel: '1 bagel', calories: 245, proteinG: 10, carbsG: 48, fatG: 1.5, fiberG: 2 },
  { id: 'tortilla_flour', name: 'Flour Tortilla', servingLabel: '1 medium', calories: 144, proteinG: 4, carbsG: 24, fatG: 3.5, fiberG: 1.4 },
  { id: 'cereal_granola', name: 'Granola', servingLabel: '50 g', calories: 233, proteinG: 5.5, carbsG: 32, fatG: 9.5, fiberG: 4 },
  { id: 'rice_cake', name: 'Rice Cake', servingLabel: '1 cake', calories: 35, proteinG: 0.7, carbsG: 7.3, fatG: 0.3, fiberG: 0.4 },
  { id: 'noodles_egg', name: 'Egg Noodles, cooked', servingLabel: '1 cup', calories: 221, proteinG: 7.3, carbsG: 40, fatG: 3.3, fiberG: 1.9 },

  // -------------------------------------------------------- vegetables ----
  { id: 'broccoli', name: 'Broccoli, cooked', servingLabel: '1 cup', calories: 55, proteinG: 3.7, carbsG: 11, fatG: 0.6, fiberG: 5 },
  { id: 'spinach', name: 'Spinach, raw', servingLabel: '100 g', calories: 23, proteinG: 2.9, carbsG: 3.6, fatG: 0.4, fiberG: 2.2 },
  { id: 'kale', name: 'Kale, raw', servingLabel: '100 g', calories: 49, proteinG: 4.3, carbsG: 8.8, fatG: 0.9, fiberG: 3.6 },
  { id: 'carrot', name: 'Carrot, raw', servingLabel: '1 medium', calories: 25, proteinG: 0.6, carbsG: 6, fatG: 0.1, fiberG: 1.7 },
  { id: 'tomato', name: 'Tomato', servingLabel: '1 medium', calories: 22, proteinG: 1.1, carbsG: 4.8, fatG: 0.2, fiberG: 1.5 },
  { id: 'cucumber', name: 'Cucumber', servingLabel: '100 g', calories: 15, proteinG: 0.7, carbsG: 3.6, fatG: 0.1, fiberG: 0.5 },
  { id: 'pepper_bell', name: 'Bell Pepper', servingLabel: '1 medium', calories: 31, proteinG: 1, carbsG: 7.2, fatG: 0.3, fiberG: 2.5 },
  { id: 'onion', name: 'Onion', servingLabel: '1 medium', calories: 44, proteinG: 1.2, carbsG: 10, fatG: 0.1, fiberG: 1.9 },
  { id: 'mushrooms', name: 'Mushrooms, raw', servingLabel: '100 g', calories: 22, proteinG: 3.1, carbsG: 3.3, fatG: 0.3, fiberG: 1 },
  { id: 'courgette', name: 'Courgette, cooked', servingLabel: '1 cup', calories: 27, proteinG: 2, carbsG: 4.8, fatG: 0.4, fiberG: 1.6 },
  { id: 'green_beans', name: 'Green Beans, cooked', servingLabel: '1 cup', calories: 44, proteinG: 2.4, carbsG: 10, fatG: 0.4, fiberG: 4 },
  { id: 'peas', name: 'Peas, cooked', servingLabel: '1 cup', calories: 134, proteinG: 8.6, carbsG: 25, fatG: 0.4, fiberG: 8.8 },
  { id: 'sweetcorn', name: 'Sweetcorn', servingLabel: '1 cup', calories: 143, proteinG: 5.4, carbsG: 31, fatG: 2.2, fiberG: 3.6 },
  { id: 'salad_mixed', name: 'Mixed Salad Leaves', servingLabel: '100 g', calories: 17, proteinG: 1.4, carbsG: 3.3, fatG: 0.2, fiberG: 1.8 },
  { id: 'asparagus', name: 'Asparagus, cooked', servingLabel: '1 cup', calories: 40, proteinG: 4.3, carbsG: 7.4, fatG: 0.4, fiberG: 3.6 },

  // ------------------------------------------------------------ fruit ----
  { id: 'banana', name: 'Banana', servingLabel: '1 medium', calories: 105, proteinG: 1.3, carbsG: 27, fatG: 0.4, fiberG: 3.1 },
  { id: 'apple', name: 'Apple', servingLabel: '1 medium', calories: 95, proteinG: 0.5, carbsG: 25, fatG: 0.3, fiberG: 4.4 },
  { id: 'orange', name: 'Orange', servingLabel: '1 medium', calories: 62, proteinG: 1.2, carbsG: 15, fatG: 0.2, fiberG: 3.1 },
  { id: 'blueberries', name: 'Blueberries', servingLabel: '1 cup', calories: 84, proteinG: 1.1, carbsG: 21, fatG: 0.5, fiberG: 3.6 },
  { id: 'strawberries', name: 'Strawberries', servingLabel: '1 cup', calories: 49, proteinG: 1, carbsG: 12, fatG: 0.5, fiberG: 3 },
  { id: 'raspberries', name: 'Raspberries', servingLabel: '1 cup', calories: 64, proteinG: 1.5, carbsG: 15, fatG: 0.8, fiberG: 8 },
  { id: 'grapes', name: 'Grapes', servingLabel: '1 cup', calories: 104, proteinG: 1.1, carbsG: 27, fatG: 0.2, fiberG: 1.4 },
  { id: 'mango', name: 'Mango', servingLabel: '1 cup', calories: 99, proteinG: 1.4, carbsG: 25, fatG: 0.6, fiberG: 2.6 },
  { id: 'pineapple', name: 'Pineapple', servingLabel: '1 cup', calories: 82, proteinG: 0.9, carbsG: 22, fatG: 0.2, fiberG: 2.3 },
  { id: 'avocado', name: 'Avocado', servingLabel: '1/2 fruit', calories: 160, proteinG: 2, carbsG: 9, fatG: 15, fiberG: 7 },
  { id: 'dates', name: 'Dates, dried', servingLabel: '2 dates', calories: 133, proteinG: 1.2, carbsG: 36, fatG: 0.2, fiberG: 3.2 },
  { id: 'raisins', name: 'Raisins', servingLabel: '40 g', calories: 120, proteinG: 1.2, carbsG: 32, fatG: 0.2, fiberG: 1.6 },

  // --------------------------------------------------- pulses and nuts ----
  { id: 'black_beans', name: 'Black Beans, cooked', servingLabel: '1 cup', calories: 227, proteinG: 15, carbsG: 41, fatG: 0.9, fiberG: 15 },
  { id: 'chickpeas', name: 'Chickpeas, cooked', servingLabel: '1 cup', calories: 269, proteinG: 15, carbsG: 45, fatG: 4.2, fiberG: 12.5 },
  { id: 'lentils', name: 'Lentils, cooked', servingLabel: '1 cup', calories: 230, proteinG: 18, carbsG: 40, fatG: 0.8, fiberG: 15.6 },
  { id: 'kidney_beans', name: 'Kidney Beans, cooked', servingLabel: '1 cup', calories: 225, proteinG: 15, carbsG: 40, fatG: 0.9, fiberG: 11 },
  { id: 'baked_beans', name: 'Baked Beans', servingLabel: '1/2 can', calories: 155, proteinG: 8, carbsG: 27, fatG: 0.6, fiberG: 7 },
  { id: 'hummus', name: 'Hummus', servingLabel: '2 tbsp', calories: 70, proteinG: 2, carbsG: 6, fatG: 5, fiberG: 2 },
  { id: 'almonds', name: 'Almonds', servingLabel: '28 g', calories: 164, proteinG: 6, carbsG: 6, fatG: 14, fiberG: 3.5 },
  { id: 'walnuts', name: 'Walnuts', servingLabel: '28 g', calories: 185, proteinG: 4.3, carbsG: 3.9, fatG: 18.5, fiberG: 1.9 },
  { id: 'cashews', name: 'Cashews', servingLabel: '28 g', calories: 157, proteinG: 5.2, carbsG: 8.6, fatG: 12.4, fiberG: 0.9 },
  { id: 'peanut_butter', name: 'Peanut Butter', servingLabel: '2 tbsp', calories: 190, proteinG: 8, carbsG: 7, fatG: 16, fiberG: 2 },
  { id: 'almond_butter', name: 'Almond Butter', servingLabel: '2 tbsp', calories: 196, proteinG: 6.7, carbsG: 6.1, fatG: 17.8, fiberG: 3.3 },
  { id: 'chia', name: 'Chia Seeds', servingLabel: '1 tbsp', calories: 58, proteinG: 2, carbsG: 5, fatG: 3.7, fiberG: 4.1 },
  { id: 'flaxseed', name: 'Ground Flaxseed', servingLabel: '1 tbsp', calories: 37, proteinG: 1.3, carbsG: 2, fatG: 3, fiberG: 1.9 },
  { id: 'pumpkin_seeds', name: 'Pumpkin Seeds', servingLabel: '28 g', calories: 158, proteinG: 8.5, carbsG: 3, fatG: 13.9, fiberG: 1.7 },

  // ------------------------------------------------------------- fats ----
  { id: 'olive_oil', name: 'Olive Oil', servingLabel: '1 tbsp', calories: 119, proteinG: 0, carbsG: 0, fatG: 13.5 },
  { id: 'coconut_oil', name: 'Coconut Oil', servingLabel: '1 tbsp', calories: 121, proteinG: 0, carbsG: 0, fatG: 13.5 },
  { id: 'mayonnaise', name: 'Mayonnaise', servingLabel: '1 tbsp', calories: 94, proteinG: 0.1, carbsG: 0.1, fatG: 10.3 },

  // --------------------------------------------------- prepared meals ----
  { id: 'burrito_bowl', name: 'Chicken Burrito Bowl', servingLabel: '1 bowl', calories: 780, proteinG: 52, carbsG: 74, fatG: 24, fiberG: 9 },
  { id: 'chicken_salad', name: 'Chicken Caesar Salad', servingLabel: '1 bowl', calories: 470, proteinG: 38, carbsG: 12, fatG: 30, fiberG: 3 },
  { id: 'pizza_slice', name: 'Pizza, cheese', servingLabel: '1 slice', calories: 285, proteinG: 12, carbsG: 36, fatG: 10, fiberG: 2.5 },
  { id: 'burger', name: 'Cheeseburger', servingLabel: '1 burger', calories: 535, proteinG: 30, carbsG: 40, fatG: 28, fiberG: 2 },
  { id: 'sushi_roll', name: 'Salmon Sushi Roll', servingLabel: '6 pieces', calories: 255, proteinG: 13, carbsG: 38, fatG: 5, fiberG: 2 },
  { id: 'chicken_curry', name: 'Chicken Curry with Rice', servingLabel: '1 portion', calories: 620, proteinG: 38, carbsG: 68, fatG: 20, fiberG: 4 },
  { id: 'stir_fry', name: 'Chicken & Veg Stir Fry', servingLabel: '1 portion', calories: 430, proteinG: 35, carbsG: 38, fatG: 14, fiberG: 5 },
  { id: 'sandwich_chicken', name: 'Chicken Sandwich', servingLabel: '1 sandwich', calories: 420, proteinG: 30, carbsG: 45, fatG: 12, fiberG: 3 },
  { id: 'omelette_3egg', name: 'Three-Egg Omelette', servingLabel: '1 omelette', calories: 255, proteinG: 19, carbsG: 2, fatG: 19 },
  { id: 'porridge', name: 'Porridge made with milk', servingLabel: '1 bowl', calories: 230, proteinG: 10, carbsG: 34, fatG: 6, fiberG: 4 },
  { id: 'protein_shake', name: 'Protein Shake with milk', servingLabel: '1 shake', calories: 240, proteinG: 33, carbsG: 15, fatG: 5 },
  { id: 'soup_lentil', name: 'Lentil Soup', servingLabel: '1 bowl', calories: 180, proteinG: 11, carbsG: 28, fatG: 2.5, fiberG: 8 },
  { id: 'jacket_potato_beans', name: 'Jacket Potato with Beans', servingLabel: '1 potato', calories: 380, proteinG: 14, carbsG: 74, fatG: 2, fiberG: 12 },

  // ------------------------------------------------- snacks and drinks ----
  { id: 'protein_bar', name: 'Protein Bar', servingLabel: '1 bar', calories: 210, proteinG: 20, carbsG: 22, fatG: 7, fiberG: 8 },
  { id: 'flapjack', name: 'Flapjack', servingLabel: '1 bar', calories: 285, proteinG: 3.5, carbsG: 38, fatG: 13, fiberG: 2 },
  { id: 'dark_chocolate', name: 'Dark Chocolate 70%', servingLabel: '25 g', calories: 145, proteinG: 2, carbsG: 11, fatG: 10, fiberG: 2.7 },
  { id: 'milk_chocolate', name: 'Milk Chocolate', servingLabel: '25 g', calories: 133, proteinG: 1.9, carbsG: 14, fatG: 7.6, fiberG: 0.8 },
  { id: 'crisps', name: 'Crisps', servingLabel: '1 small bag', calories: 150, proteinG: 2, carbsG: 15, fatG: 10, fiberG: 1.2 },
  { id: 'popcorn', name: 'Popcorn, plain', servingLabel: '3 cups', calories: 93, proteinG: 3, carbsG: 19, fatG: 1.1, fiberG: 3.5 },
  { id: 'beer', name: 'Beer', servingLabel: '1 pint', calories: 208, proteinG: 2, carbsG: 17, fatG: 0 },
  { id: 'wine_red', name: 'Red Wine', servingLabel: '175 ml', calories: 150, proteinG: 0.1, carbsG: 4.6, fatG: 0 },
  { id: 'spirit_single', name: 'Spirit, single measure', servingLabel: '25 ml', calories: 56, proteinG: 0, carbsG: 0, fatG: 0 },
  { id: 'coffee_black', name: 'Coffee, black', servingLabel: '1 cup', calories: 2, proteinG: 0.3, carbsG: 0, fatG: 0 },
  { id: 'latte', name: 'Latte, whole milk', servingLabel: '1 medium', calories: 190, proteinG: 10, carbsG: 15, fatG: 10 },
  { id: 'orange_juice', name: 'Orange Juice', servingLabel: '250 ml', calories: 112, proteinG: 1.7, carbsG: 26, fatG: 0.5 },
  { id: 'cola', name: 'Cola', servingLabel: '330 ml can', calories: 139, proteinG: 0, carbsG: 35, fatG: 0 },
  { id: 'sports_drink', name: 'Sports Drink', servingLabel: '500 ml', calories: 126, proteinG: 0, carbsG: 32, fatG: 0 },
  { id: 'energy_gel', name: 'Energy Gel', servingLabel: '1 gel', calories: 100, proteinG: 0, carbsG: 25, fatG: 0 },
];

/**
 * Plain substring search over the bundled list.
 *
 * Kept for the few callers that only want the staples. Anything user-facing
 * should go through `searchLibrary`, which also sees custom and scanned foods
 * and ranks by what this person actually eats.
 */
export function searchFoods(query: string, limit = 20): SavedFood[] {
  const q = query.trim().toLowerCase();
  if (!q) return FOOD_DB.slice(0, limit);
  return FOOD_DB.filter((f) => f.name.toLowerCase().includes(q)).slice(0, limit);
}

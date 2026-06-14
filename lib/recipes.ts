export interface Ingredient {
  name: string;
  quantity: number;
  unit: string;
  category: 'produce' | 'meat' | 'dairy' | 'pantry' | 'frozen' | 'bakery' | 'other';
}

export interface Recipe {
  id: string;
  name: string;
  emoji: string;
  category: 'breakfast' | 'lunch' | 'dinner' | 'snack';
  servings: number;
  prepMinutes: number;
  cookMinutes: number;
  ingredients: Ingredient[];
  tags: string[];
}

export const BUILT_IN_RECIPES: Recipe[] = [
  {
    id: 'spaghetti-meatballs',
    name: 'Spaghetti & Meatballs',
    emoji: '🍝',
    category: 'dinner',
    servings: 6,
    prepMinutes: 20,
    cookMinutes: 30,
    ingredients: [
      { name: 'Spaghetti', quantity: 1, unit: 'lb', category: 'pantry' },
      { name: 'Ground beef', quantity: 1, unit: 'lb', category: 'meat' },
      { name: 'Marinara sauce', quantity: 24, unit: 'oz', category: 'pantry' },
      { name: 'Garlic', quantity: 3, unit: 'cloves', category: 'produce' },
      { name: 'Parmesan cheese', quantity: 0.5, unit: 'cup', category: 'dairy' },
      { name: 'Breadcrumbs', quantity: 0.5, unit: 'cup', category: 'pantry' },
      { name: 'Egg', quantity: 1, unit: '', category: 'dairy' },
    ],
    tags: ['italian', 'kid-friendly', 'comfort food'],
  },
  {
    id: 'tacos',
    name: 'Taco Night',
    emoji: '🌮',
    category: 'dinner',
    servings: 6,
    prepMinutes: 15,
    cookMinutes: 15,
    ingredients: [
      { name: 'Ground beef', quantity: 1.5, unit: 'lb', category: 'meat' },
      { name: 'Taco shells', quantity: 12, unit: '', category: 'pantry' },
      { name: 'Taco seasoning', quantity: 1, unit: 'packet', category: 'pantry' },
      { name: 'Shredded cheese', quantity: 1, unit: 'cup', category: 'dairy' },
      { name: 'Lettuce', quantity: 1, unit: 'head', category: 'produce' },
      { name: 'Tomatoes', quantity: 2, unit: '', category: 'produce' },
      { name: 'Sour cream', quantity: 0.5, unit: 'cup', category: 'dairy' },
      { name: 'Salsa', quantity: 1, unit: 'jar', category: 'pantry' },
    ],
    tags: ['mexican', 'kid-friendly', 'quick'],
  },
  {
    id: 'grilled-chicken',
    name: 'Grilled Chicken & Veggies',
    emoji: '🍗',
    category: 'dinner',
    servings: 4,
    prepMinutes: 15,
    cookMinutes: 25,
    ingredients: [
      { name: 'Chicken breasts', quantity: 4, unit: '', category: 'meat' },
      { name: 'Olive oil', quantity: 3, unit: 'tbsp', category: 'pantry' },
      { name: 'Bell peppers', quantity: 2, unit: '', category: 'produce' },
      { name: 'Zucchini', quantity: 2, unit: '', category: 'produce' },
      { name: 'Garlic powder', quantity: 1, unit: 'tsp', category: 'pantry' },
      { name: 'Italian seasoning', quantity: 1, unit: 'tsp', category: 'pantry' },
    ],
    tags: ['healthy', 'gluten-free', 'quick'],
  },
  {
    id: 'mac-cheese',
    name: 'Mac & Cheese',
    emoji: '🧀',
    category: 'dinner',
    servings: 4,
    prepMinutes: 10,
    cookMinutes: 20,
    ingredients: [
      { name: 'Elbow macaroni', quantity: 2, unit: 'cups', category: 'pantry' },
      { name: 'Cheddar cheese', quantity: 2, unit: 'cups', category: 'dairy' },
      { name: 'Milk', quantity: 1, unit: 'cup', category: 'dairy' },
      { name: 'Butter', quantity: 3, unit: 'tbsp', category: 'dairy' },
      { name: 'Flour', quantity: 3, unit: 'tbsp', category: 'pantry' },
      { name: 'Salt', quantity: 1, unit: 'tsp', category: 'pantry' },
    ],
    tags: ['kid-friendly', 'comfort food', 'vegetarian'],
  },
  {
    id: 'pancakes',
    name: 'Fluffy Pancakes',
    emoji: '🥞',
    category: 'breakfast',
    servings: 4,
    prepMinutes: 10,
    cookMinutes: 20,
    ingredients: [
      { name: 'All-purpose flour', quantity: 2, unit: 'cups', category: 'pantry' },
      { name: 'Milk', quantity: 1.5, unit: 'cups', category: 'dairy' },
      { name: 'Eggs', quantity: 2, unit: '', category: 'dairy' },
      { name: 'Butter', quantity: 4, unit: 'tbsp', category: 'dairy' },
      { name: 'Baking powder', quantity: 2, unit: 'tsp', category: 'pantry' },
      { name: 'Sugar', quantity: 2, unit: 'tbsp', category: 'pantry' },
      { name: 'Maple syrup', quantity: 1, unit: 'bottle', category: 'pantry' },
    ],
    tags: ['kid-friendly', 'weekend', 'vegetarian'],
  },
  {
    id: 'scrambled-eggs',
    name: 'Scrambled Eggs & Toast',
    emoji: '🍳',
    category: 'breakfast',
    servings: 4,
    prepMinutes: 5,
    cookMinutes: 10,
    ingredients: [
      { name: 'Eggs', quantity: 8, unit: '', category: 'dairy' },
      { name: 'Bread', quantity: 1, unit: 'loaf', category: 'bakery' },
      { name: 'Butter', quantity: 2, unit: 'tbsp', category: 'dairy' },
      { name: 'Milk', quantity: 2, unit: 'tbsp', category: 'dairy' },
      { name: 'Salt & pepper', quantity: 1, unit: 'pinch', category: 'pantry' },
    ],
    tags: ['quick', 'easy', 'kid-friendly'],
  },
  {
    id: 'chicken-stir-fry',
    name: 'Chicken Stir Fry',
    emoji: '🥢',
    category: 'dinner',
    servings: 4,
    prepMinutes: 15,
    cookMinutes: 15,
    ingredients: [
      { name: 'Chicken breast', quantity: 1.5, unit: 'lb', category: 'meat' },
      { name: 'Broccoli', quantity: 2, unit: 'cups', category: 'produce' },
      { name: 'Carrots', quantity: 2, unit: '', category: 'produce' },
      { name: 'Snap peas', quantity: 1, unit: 'cup', category: 'produce' },
      { name: 'Soy sauce', quantity: 3, unit: 'tbsp', category: 'pantry' },
      { name: 'Sesame oil', quantity: 1, unit: 'tbsp', category: 'pantry' },
      { name: 'Ginger', quantity: 1, unit: 'tsp', category: 'produce' },
      { name: 'Garlic', quantity: 3, unit: 'cloves', category: 'produce' },
      { name: 'White rice', quantity: 2, unit: 'cups', category: 'pantry' },
    ],
    tags: ['asian', 'healthy', 'quick'],
  },
  {
    id: 'burgers',
    name: 'Homemade Burgers',
    emoji: '🍔',
    category: 'dinner',
    servings: 4,
    prepMinutes: 15,
    cookMinutes: 15,
    ingredients: [
      { name: 'Ground beef', quantity: 1.5, unit: 'lb', category: 'meat' },
      { name: 'Burger buns', quantity: 4, unit: '', category: 'bakery' },
      { name: 'Cheddar cheese slices', quantity: 4, unit: '', category: 'dairy' },
      { name: 'Lettuce', quantity: 1, unit: 'head', category: 'produce' },
      { name: 'Tomato', quantity: 1, unit: '', category: 'produce' },
      { name: 'Onion', quantity: 1, unit: '', category: 'produce' },
      { name: 'Ketchup', quantity: 1, unit: 'bottle', category: 'pantry' },
      { name: 'Mustard', quantity: 1, unit: 'bottle', category: 'pantry' },
    ],
    tags: ['american', 'kid-friendly', 'grilling'],
  },
  {
    id: 'chicken-alfredo',
    name: 'Chicken Alfredo',
    emoji: '🍜',
    category: 'dinner',
    servings: 4,
    prepMinutes: 15,
    cookMinutes: 25,
    ingredients: [
      { name: 'Fettuccine pasta', quantity: 1, unit: 'lb', category: 'pantry' },
      { name: 'Chicken breast', quantity: 1.5, unit: 'lb', category: 'meat' },
      { name: 'Heavy cream', quantity: 1, unit: 'cup', category: 'dairy' },
      { name: 'Parmesan cheese', quantity: 1, unit: 'cup', category: 'dairy' },
      { name: 'Butter', quantity: 4, unit: 'tbsp', category: 'dairy' },
      { name: 'Garlic', quantity: 3, unit: 'cloves', category: 'produce' },
    ],
    tags: ['italian', 'comfort food', 'kid-friendly'],
  },
  {
    id: 'salmon-rice',
    name: 'Salmon & Rice',
    emoji: '🐟',
    category: 'dinner',
    servings: 4,
    prepMinutes: 10,
    cookMinutes: 25,
    ingredients: [
      { name: 'Salmon fillets', quantity: 4, unit: '', category: 'meat' },
      { name: 'White rice', quantity: 2, unit: 'cups', category: 'pantry' },
      { name: 'Lemon', quantity: 1, unit: '', category: 'produce' },
      { name: 'Olive oil', quantity: 2, unit: 'tbsp', category: 'pantry' },
      { name: 'Garlic powder', quantity: 1, unit: 'tsp', category: 'pantry' },
      { name: 'Dill', quantity: 1, unit: 'tsp', category: 'pantry' },
      { name: 'Asparagus', quantity: 1, unit: 'bunch', category: 'produce' },
    ],
    tags: ['healthy', 'seafood', 'gluten-free'],
  },
  {
    id: 'pizza-night',
    name: 'Homemade Pizza Night',
    emoji: '🍕',
    category: 'dinner',
    servings: 4,
    prepMinutes: 30,
    cookMinutes: 20,
    ingredients: [
      { name: 'Pizza dough', quantity: 2, unit: 'balls', category: 'bakery' },
      { name: 'Pizza sauce', quantity: 1, unit: 'can', category: 'pantry' },
      { name: 'Mozzarella cheese', quantity: 2, unit: 'cups', category: 'dairy' },
      { name: 'Pepperoni', quantity: 4, unit: 'oz', category: 'meat' },
      { name: 'Bell pepper', quantity: 1, unit: '', category: 'produce' },
      { name: 'Mushrooms', quantity: 1, unit: 'cup', category: 'produce' },
      { name: 'Olive oil', quantity: 2, unit: 'tbsp', category: 'pantry' },
    ],
    tags: ['italian', 'kid-friendly', 'fun', 'weekend'],
  },
  {
    id: 'oatmeal',
    name: 'Oatmeal with Berries',
    emoji: '🫐',
    category: 'breakfast',
    servings: 4,
    prepMinutes: 5,
    cookMinutes: 10,
    ingredients: [
      { name: 'Rolled oats', quantity: 2, unit: 'cups', category: 'pantry' },
      { name: 'Milk', quantity: 3, unit: 'cups', category: 'dairy' },
      { name: 'Blueberries', quantity: 1, unit: 'cup', category: 'produce' },
      { name: 'Strawberries', quantity: 1, unit: 'cup', category: 'produce' },
      { name: 'Honey', quantity: 2, unit: 'tbsp', category: 'pantry' },
      { name: 'Cinnamon', quantity: 1, unit: 'tsp', category: 'pantry' },
    ],
    tags: ['healthy', 'quick', 'vegetarian', 'kid-friendly'],
  },
  {
    id: 'grilled-cheese-tomato',
    name: 'Grilled Cheese & Tomato Soup',
    emoji: '🥪',
    category: 'lunch',
    servings: 4,
    prepMinutes: 10,
    cookMinutes: 15,
    ingredients: [
      { name: 'Bread', quantity: 1, unit: 'loaf', category: 'bakery' },
      { name: 'Cheddar cheese slices', quantity: 8, unit: '', category: 'dairy' },
      { name: 'Butter', quantity: 4, unit: 'tbsp', category: 'dairy' },
      { name: 'Tomato soup', quantity: 2, unit: 'cans', category: 'pantry' },
      { name: 'Milk', quantity: 0.5, unit: 'cup', category: 'dairy' },
    ],
    tags: ['comfort food', 'kid-friendly', 'quick', 'lunch'],
  },
  {
    id: 'turkey-sandwiches',
    name: 'Turkey Club Sandwiches',
    emoji: '🥙',
    category: 'lunch',
    servings: 4,
    prepMinutes: 10,
    cookMinutes: 0,
    ingredients: [
      { name: 'Sliced turkey breast', quantity: 0.75, unit: 'lb', category: 'meat' },
      { name: 'Bread', quantity: 1, unit: 'loaf', category: 'bakery' },
      { name: 'Lettuce', quantity: 1, unit: 'head', category: 'produce' },
      { name: 'Tomato', quantity: 2, unit: '', category: 'produce' },
      { name: 'Swiss cheese', quantity: 4, unit: 'slices', category: 'dairy' },
      { name: 'Mayonnaise', quantity: 0.25, unit: 'cup', category: 'pantry' },
      { name: 'Bacon', quantity: 8, unit: 'strips', category: 'meat' },
    ],
    tags: ['quick', 'lunch', 'kid-friendly'],
  },
  {
    id: 'chicken-soup',
    name: 'Chicken Noodle Soup',
    emoji: '🍲',
    category: 'dinner',
    servings: 6,
    prepMinutes: 20,
    cookMinutes: 40,
    ingredients: [
      { name: 'Whole chicken', quantity: 1, unit: '', category: 'meat' },
      { name: 'Egg noodles', quantity: 2, unit: 'cups', category: 'pantry' },
      { name: 'Carrots', quantity: 3, unit: '', category: 'produce' },
      { name: 'Celery', quantity: 3, unit: 'stalks', category: 'produce' },
      { name: 'Onion', quantity: 1, unit: '', category: 'produce' },
      { name: 'Chicken broth', quantity: 8, unit: 'cups', category: 'pantry' },
      { name: 'Garlic', quantity: 3, unit: 'cloves', category: 'produce' },
      { name: 'Thyme', quantity: 1, unit: 'tsp', category: 'pantry' },
    ],
    tags: ['comfort food', 'soup', 'family favorite'],
  },
];

export function getRecipeById(id: string): Recipe | undefined {
  return BUILT_IN_RECIPES.find(r => r.id === id);
}

export function searchRecipes(query: string): Recipe[] {
  const q = query.toLowerCase();
  return BUILT_IN_RECIPES.filter(r =>
    r.name.toLowerCase().includes(q) ||
    r.tags.some(t => t.includes(q)) ||
    r.category.includes(q) ||
    r.ingredients.some(i => i.name.toLowerCase().includes(q))
  );
}

export function getAllRecipesSearchUrl(query: string): string {
  return `https://www.allrecipes.com/search/results/?wt=${encodeURIComponent(query)}&sort=re&rating=4`;
}

export const CATEGORY_LABELS: Record<Recipe['category'], string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snack: 'Snack',
};

export const INGREDIENT_CATEGORY_LABELS: Record<Ingredient['category'], string> = {
  produce: '🥬 Produce',
  meat: '🥩 Meat & Seafood',
  dairy: '🧈 Dairy & Eggs',
  pantry: '🥫 Pantry',
  frozen: '🧊 Frozen',
  bakery: '🍞 Bakery',
  other: '📦 Other',
};

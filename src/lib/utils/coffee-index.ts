import { COFFEE_INDEX_DRINKS, COFFEE_PRIMARY_DRINK } from '$lib/config/coffee';
import type { CoffeeDrinkId, CoffeeDrinkPrice, CoffeeIndexShop } from '$lib/types/coffee';

export function formatCoffeePrice(price: number): string {
	return `$${price.toFixed(2)}`;
}

function getCoffeeDrinkOrder(preferred: CoffeeDrinkId = COFFEE_PRIMARY_DRINK): CoffeeDrinkId[] {
	const drinkIds = COFFEE_INDEX_DRINKS.map((drink) => drink.id);
	return [preferred, ...drinkIds.filter((drinkId) => drinkId !== preferred)];
}

export function getOrderedCoffeeDrinkPrices(
	shop: CoffeeIndexShop,
	preferred: CoffeeDrinkId = COFFEE_PRIMARY_DRINK
): CoffeeDrinkPrice[] {
	return getCoffeeDrinkOrder(preferred)
		.map((drinkId) => shop.prices[drinkId] ?? null)
		.filter((price): price is CoffeeDrinkPrice => price !== null);
}

export function getCoffeeHeadlinePrice(
	shop: CoffeeIndexShop,
	preferred: CoffeeDrinkId = COFFEE_PRIMARY_DRINK
): CoffeeDrinkPrice | null {
	return getOrderedCoffeeDrinkPrices(shop, preferred)[0] ?? null;
}

export function formatCoffeeMenuSummary(
	shop: CoffeeIndexShop,
	preferred: CoffeeDrinkId = COFFEE_PRIMARY_DRINK,
	limit = 4
): string {
	return getOrderedCoffeeDrinkPrices(shop, preferred)
		.slice(0, limit)
		.map((price) => `${price.label} ${formatCoffeePrice(price.price)}`)
		.join(' · ');
}

export function getCoffeeStatusLabel(
	shop: CoffeeIndexShop,
	preferred: CoffeeDrinkId = COFFEE_PRIMARY_DRINK
): string {
	return getCoffeeHeadlinePrice(shop, preferred) ? 'Price available' : 'Tracking soon';
}

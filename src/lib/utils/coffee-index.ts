import { COFFEE_INDEX_DRINKS, COFFEE_PRIMARY_DRINK } from '$lib/config/coffee';
import type { CoffeeDrinkId, CoffeeDrinkPrice, CoffeeIndexShop } from '$lib/types/coffee';

const DRINK_LABELS = new Map(COFFEE_INDEX_DRINKS.map((drink) => [drink.id, drink.label]));

export function formatCoffeePrice(price: number): string {
	return `$${price.toFixed(2)}`;
}

export function getCoffeeDrinkOrder(preferred: CoffeeDrinkId = COFFEE_PRIMARY_DRINK): CoffeeDrinkId[] {
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

export function sortCoffeeShopsByHeadline(
	shops: CoffeeIndexShop[],
	preferred: CoffeeDrinkId = COFFEE_PRIMARY_DRINK
): CoffeeIndexShop[] {
	return [...shops].sort((left, right) => {
		const leftHeadline = getCoffeeHeadlinePrice(left, preferred);
		const rightHeadline = getCoffeeHeadlinePrice(right, preferred);

		if (!leftHeadline && !rightHeadline) return left.name.localeCompare(right.name);
		if (!leftHeadline) return 1;
		if (!rightHeadline) return -1;
		if (leftHeadline.price !== rightHeadline.price) return leftHeadline.price - rightHeadline.price;
		return left.name.localeCompare(right.name);
	});
}

export function getCoffeeDrinkLabel(drinkId: CoffeeDrinkId): string {
	return DRINK_LABELS.get(drinkId) ?? drinkId.replace(/_/g, ' ');
}

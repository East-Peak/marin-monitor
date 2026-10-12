import { expect, type Locator } from '@playwright/test';

/**
 * Elements that present an item AS an alert: a badge/class/role/data hook, or an element
 * whose whole text is "ALERT". Ordinary words inside text are not affordances.
 */
export async function alertAffordances(scope: Locator): Promise<string[]> {
	return scope.evaluateAll((roots) =>
		roots.flatMap((root) =>
			[root, ...root.querySelectorAll('*')]
				.filter(
					(el) =>
						el.hasAttribute('data-alert') ||
						el.classList.contains('alert') ||
						el.classList.contains('alert-tag') ||
						el.getAttribute('role') === 'alert' ||
						(el.children.length === 0 && el.textContent?.trim() === 'ALERT')
				)
				.map((el) => el.outerHTML.slice(0, 120))
		)
	);
}

export async function expectNoAlertAffordance(scope: Locator): Promise<void> {
	expect(await alertAffordances(scope)).toEqual([]);
}

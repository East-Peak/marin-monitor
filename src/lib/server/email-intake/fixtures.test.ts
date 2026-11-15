// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { fixtureNames, fixtureText } from './fixtures';

/** The repo is public: a fixture must never carry a subscriber token, tracked link or the real address. */
const FORBIDDEN = ['verification=', 'x-subscriber', 'links-2.govdelivery.com', '885d10db'];

describe('Postmark fixtures', () => {
	it('has all eleven sanitised samples', () => {
		expect(fixtureNames()).toHaveLength(11);
	});

	it.each(fixtureNames())(
		'%s carries no subscriber token, tracked link or real address',
		(name) => {
			const text = fixtureText(name).toLowerCase();
			for (const bad of FORBIDDEN) expect(text).not.toContain(bad);
		}
	);
});

/**
 * Who may write the shared news and refresh stores (Codex r3 #1).
 * Untokened writes belong to the default owner — the dashboard, unchanged.
 * A view that needs the stores exclusively (the TV wallboard) claims them;
 * while the claim is held only its token writes, so work another view
 * started earlier (a pending loadAllNews, enrichment, a refresh cycle) can
 * no longer land. A released token never writes again, so a destroyed
 * owner's late work is dropped too. Enforced at the store write boundary,
 * not by chasing every code path.
 */
export interface StoreClaim {
	readonly token: symbol;
	release(): void;
}

let current: symbol | null = null;

export function claimSharedStores(): StoreClaim {
	const token = Symbol('shared-store-owner');
	current = token;
	return {
		token,
		release: () => {
			if (current === token) current = null;
		}
	};
}

export function mayWrite(token: symbol | undefined): boolean {
	return current === null ? token === undefined : token === current;
}

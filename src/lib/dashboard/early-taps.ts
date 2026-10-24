/**
 * Taps before the dashboard is interactive (MOBILE1). On a phone the server's HTML shows its
 * buttons a second or more before their handlers exist, and a tap then did nothing.
 * app.html's first script keeps each button tapped inside a not-yet-hydrated dashboard
 * (`window.__earlyTaps`); the dashboard replays them once mounted. Hydration keeps the
 * server's nodes, so each is the very button tapped. Buttons only: a link or a <summary>
 * already did its own thing natively.
 */
export function replayEarlyTaps(w: { __earlyTaps?: Element[] }) {
	const taps = w.__earlyTaps ?? [];
	w.__earlyTaps = [];
	for (const el of taps) if (el.isConnected && el instanceof HTMLElement) el.click();
}

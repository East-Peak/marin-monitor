/**
 * What each page's HTML asks the browser to fetch early (SvelteKit's `resolve` preload): its
 * scripts and stylesheets, as by default, and the text font (MOBILE1). Found only inside the
 * CSS, Outfit arrived after a phone's first paint and the swap from the fallback reflowed the
 * page, its last layout shift.
 */
export function preloadAsset({ type, path }: { type: string; path: string }): boolean {
	return (
		type === 'js' ||
		type === 'css' ||
		(type === 'font' && /\/outfit-latin-wght-normal\./.test(path))
	);
}

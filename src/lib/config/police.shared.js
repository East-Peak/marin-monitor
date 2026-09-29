// Shared by the police scraper (src/lib/server/scrapers/police.ts) and the
// local script (scripts/extract-police-logs.mjs).

// Fairfax returns 403 to fetch's default User-Agent. Identify honestly;
// never impersonate a browser.
export const POLICE_USER_AGENT = 'MarinMonitor/2.0 (+https://marinmonitor.com; stuart@eastpeak.cc)';

export const FAIRFAX_DOCS_URL =
	'https://townoffairfaxca.gov/wp-json/wp/v2/documents?search=Press%20log&per_page=8&_fields=id,date,title,link,meta';

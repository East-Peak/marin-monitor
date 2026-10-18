/**
 * Changelog entries for the "What's New" section in the Community panel.
 *
 * Add newest entries at the top. Each entry has a date, description,
 * and optional contributor credit.
 */

export interface ChangelogEntry {
	date: string;
	title: string;
	description?: string;
	contributor?: string;
}

export const CHANGELOG: ChangelogEntry[] = [
	{
		date: '2026-10-17',
		title: 'Road speeds, airports and fitness studios back on the map',
		description:
			'The map’s Layers list now has Road speeds (Mapbox’s congestion lines, on by default), Airports (SFO and OAK, on by default, in the same words as the Getting Around card) and Fitness studios (off by default). Each says where it comes from and when it was read. If the road-speed tiles fail to load, the lines come off the roads and the list says so, instead of leaving old colours behind. On the phone, the same Layers list is in the map’s corner once you expand it.'
	},
	{
		date: '2026-10-17',
		title: 'A bigger map with an “In view” list and more layers',
		description:
			'On a computer, the map now runs the full width of the page, with the latest five headlines in a row underneath. A list inside the map shows what is in view, newest first; click a row or a pin to fly there and read it in the list, photo and source link included. A Layers button turns on traffic, fire, gas prices, EV chargers and coffee, and says where each comes from and when it was read, or that it is unavailable. Town circles are brighter and Fix It Marin dots smaller, so the news stands out. The phone is unchanged.'
	},
	{
		date: '2026-10-17',
		title: 'Advisory chips, a Getting Around card and jump links',
		description:
			'On a computer, weather advisories are now small chips under the header; click one to read the National Weather Service’s own text. Getting Around is a card beside the ocean that says at a glance whether the airports, Marin roads and Marin Transit are clear, and only says so from a fresh read. A row of links under the header jumps to the map, Getting Around, Outdoors, News, Cost and Events. The phone is unchanged.'
	},
	{
		date: '2026-10-17',
		title: 'Weather, tides and the ocean at the top of the desktop page',
		description:
			'On a computer, the top of the dashboard now shows the temperature with its last 12 hours and the next 8 hours’ temperature and rain chance, today’s tide curve from NOAA’s own hourly predictions with each high and low marked, and the ocean at Point Reyes: wave height and period now and for the next day. Anything that can’t be read says so. The phone is unchanged.'
	},
	{
		date: '2026-10-17',
		title: 'The redesigned dashboard is now the default',
		description:
			'The redesigned dashboard is now the default. The old one stays at marinmonitor.com/?layout=legacy for now, and an “Old dashboard” link in the header takes you there. The TV is unchanged.'
	},
	{
		date: '2026-10-17',
		title: 'The preview shows the news as soon as it opens',
		description:
			'The dashboard preview now arrives with its five latest news items already on the page, with how long ago each was published, instead of filling in after a moment. That helps on slow phones and in link previews. If the news can’t be read quickly, the page loads it as before. Marin Lately now appears only when it has published something in the last 30 days; for now it’s hidden, since its last piece was in January.'
	},
	{
		date: '2026-10-16',
		title: 'A way back to all of Marin, and a map key',
		description:
			'In the dashboard preview, after you click into a town on the map, an “All of Marin” button in the corner takes you back to the county view and clears the town. The map also says what each layer shows: stories are placed by town, one circle per town, because they name a town and not a street. Only Fix It Marin reports and earthquakes have exact spots. Counts tell you how many of each are in view.'
	},
	{
		date: '2026-10-16',
		title: 'Getting Around, rebuilt for a quick look before you leave',
		description:
			'In the dashboard preview, Getting Around now starts with road problems on Marin roads and the routes to SFO and OAK, at most three, worst first, each saying where it is and what it means (“US-101 SB between I-580 W and Tamalpais Dr · Roadwork · some lanes closed”). Chips say whether it is in Marin and whether it is on your way to the airport, or on the way back. Transit groups related alerts into one line that explains itself (“Night Closure · 7 stops …” with the stop’s own description) and drops the Clipper ad. Agencies 511 shows nothing for share one line linking to their own pages. Airports are one line while both are clear.'
	},
	{
		date: '2026-10-16',
		title: 'Air quality is back',
		description:
			'AirNow switched off the feed the dashboard used for air quality on October 1, so AQI had gone blank everywhere. It now reads AirNow’s current feed. In the dashboard preview’s Outdoors section, the Air quality line shows the AQI and its category (for example “14 · Good”), which pollutant it is and where it was measured, with the hour AirNow observed it. If the reading can’t be fetched, it says “Unavailable” and why, instead of showing an old number. The regular dashboard and TV show AQI again too.'
	},
	{
		date: '2026-10-15',
		title: 'News, events and Marin Lately in the preview',
		description:
			'The dashboard preview now continues the news after Latest reporting with twelve more stories. It also shows Fix It Marin (311) reports by day with the most common issues, recent police log entries and park alerts, shows over the next ten days with the next five listed, and the race calendar. Marin Lately gets its own satire band, which says honestly that the feed has been quiet since January. On a computer, News sits beside Events under Cost, with a list of every data source and how fresh it is at the bottom. Anything that couldn’t be read says so instead of showing zero. The regular dashboard and TV are unchanged.'
	},
	{
		date: '2026-10-15',
		title: 'Cost & Character in the preview, and the gas 7-day change fixed',
		description:
			'On a computer, the dashboard preview’s Cost & Character section now shows the Cost of being Marin index with its weekly trend and tiers, the itemized Marin Number, gas prices with the low–high band and the cheapest stations, and a tile for each sub-index (coffee, cappuccino, groceries, wine, fitness, school, housing, gas, and the Rivian, dog, ski pass and camp lines) with a trend line or “No history yet”. A reading that failed says so instead of showing $0. Also fixed on the regular dashboard: the gas panel’s 7-day change was comparing against a July reading; it now compares against the reading a week ago.'
	},
	{
		date: '2026-10-15',
		title: 'Outdoors & Conditions, with charts, in the preview',
		description:
			'The dashboard preview’s Outdoors section now charts the next 24 hours (temperature and hourly chance of rain), a 6-day high/low strip, the tides for two days, and Point Reyes surf from a marine forecast. A short list covers wildfire near Marin, earthquakes in the last 7 days, and air quality, which is unavailable until a new feed is connected. Every card says where its numbers come from and when, and a reading that failed says so instead of showing zero. On a computer it sits beside Getting Around. The regular dashboard and TV are unchanged.'
	},
	{
		date: '2026-10-15',
		title: 'The preview fills a desktop screen',
		description:
			'On a computer, the dashboard preview now uses the full width of the window: the morning brief in one row, a taller map beside Latest reporting, and all the cameras in a wall under the map, grouped by area (South, Central, West and North Marin, then the 101 traffic cams). Sections are always open on desktop. Phones and tablets are unchanged, and so are the regular dashboard and TV.'
	},
	{
		date: '2026-10-15',
		title: 'Getting around in the preview: airports, roads and transit',
		description:
			'The dashboard preview’s Getting Around section now answers three questions: is SFO or OAK delayed (FAA), is anything listed on Marin roads or the main routes to the airports (101, 19th Ave, 280 and 380 to SFO; 580, 80 and 880 to OAK, from 511), and what transit alerts 511 lists (Marin Transit’s, plus any for Golden Gate, SMART or the Angel Island ferry, each with a link to the agency’s own alerts page). Each part says how fresh it is and never claims an all-clear it can’t back up. A “Getting around” link under the morning brief jumps to it. The regular dashboard and TV are unchanged.'
	},
	{
		date: '2026-10-15',
		title: 'Preview travel section built, not yet shown',
		description:
			'Behind the scenes: the preview’s Getting Around section is built — airports, roads to SFO and OAK, and Marin transit — and it only says “no delays” or “no alerts” when the reading behind it is complete and current. It isn’t on the page yet.'
	},
	{
		date: '2026-10-15',
		title: 'Getting the preview’s travel answers ready',
		description:
			'Behind the scenes: the dashboard preview can now read FAA status for SFO and OAK and the filtered 511 traffic list, but only once you open Getting Around, and it keeps each transit agency’s own alerts from the read it already makes. Nothing changes on screen yet.'
	},
	{
		date: '2026-10-15',
		title: 'Travel data for the preview, part 1',
		description:
			'Behind the scenes: the dashboard preview’s server can now read 511’s complete list of traffic incidents (filtered to Marin and the routes to SFO and OAK), and each transit agency’s own alerts with the time its feed was updated. Nothing changes on screen yet.'
	},
	{
		date: '2026-10-14',
		title: 'Preview temperature stops going blank',
		description:
			'The preview’s weather card was sometimes saying “Temperature unknown” because the weather service’s newest report hadn’t been checked yet. It now shows the most recent usable reading from Gnoss Field from the last hour and a half, with its own time. If there isn’t one, it still says so, or marks an older reading out of date. The regular dashboard and TV are unchanged.'
	},
	{
		date: '2026-10-14',
		title: 'Ridge and traffic cams in the preview',
		description:
			'The dashboard preview now opens with a row of live cameras right under the morning brief: the ALERTCalifornia ridge cams first (Mt. Tam, Wolfback, Big Rock, Barnabe, Burdell and more), then the Caltrans cams on 101. Swipe the row on a phone; on a computer use the arrows. A camera that isn’t sending pictures says so instead of showing a broken image, traffic cams say how old their picture is, and tapping a camera opens its full-size picture. The regular dashboard and TV are unchanged.'
	},
	{
		date: '2026-10-14',
		title: 'Getting the preview’s cameras ready',
		description:
			'Behind the scenes: the dashboard preview gets the pieces for a row of live cameras — ridge cams first, then 101 — that only shows a picture once it has fully loaded and only says how old a picture is when the camera itself says so. Nothing changes on screen yet.'
	},
	{
		date: '2026-10-13',
		title: 'Preview map stops crying wolf',
		description:
			'The dashboard preview’s map used to say Fix It Marin (311) and USGS earthquakes were “unverified” even when both had loaded fine. Now it checks how old each one’s data really is, and only warns when something is out of date or its age is unknown. A pin kept after a failed refresh says from what time. The regular dashboard and TV are unchanged.'
	},
	{
		date: '2026-10-12',
		title: 'Preview map fits phones better',
		description:
			'On phones the dashboard preview’s map is a little shorter and its Expand button sits on the map’s corner, so the latest stories start higher on the screen. A town with no stories now says so even when another map source is down, and names the source that failed. The regular dashboard is unchanged.'
	},
	{
		date: '2026-10-12',
		title: 'No keyword alerts in the preview',
		description:
			'A new automatic check makes sure the dashboard preview never treats a story as an alert just because it contains a word like “fire”. Only official weather advisories appear as alerts there. The regular dashboard is unchanged.'
	},
	{
		date: '2026-10-12',
		title: 'Preview map and latest reporting',
		description:
			'The dashboard preview now shows the map next to the five latest dated stories, each with its source, how long ago it was published, and whether it is about your town or county-wide. On phones the map is a small preview you can expand, and swiping over it scrolls the page. Tapping a pin opens its story without changing your town, ordinary stories never show up as alerts, and anything kept from an earlier refresh is dimmed and says from when. The regular dashboard is unchanged.'
	},
	{
		date: '2026-10-12',
		title: 'Map groundwork for the preview',
		description:
			'The shared map can now be driven by the dashboard preview with only the data the preview itself loaded: no keyword alert pulses, airport pins, traffic or places it can’t vouch for, and anything kept after a failed refresh is dimmed with a note saying from when. The regular dashboard and TV maps are unchanged.'
	},
	{
		date: '2026-10-12',
		title: 'Preview town label on phones',
		description:
			'On phones the dashboard preview’s town picker now says which town you’re looking at, not just a pin icon. Behind the scenes the preview gets ready for its latest-reporting list: county-wide stories are recognized from their source, and anything the preview can’t vouch for will say so instead of guessing. The regular dashboard is unchanged.'
	},
	{
		date: '2026-10-01',
		title: 'Strava is paused',
		description:
			'The Strava leaderboards, map segments, TV screen and preview section are off the site for now. The tools behind them are kept, so they can return.'
	},
	{
		date: '2026-10-01',
		title: 'Airport status you can trust',
		description:
			'A closure now shows as Closed only while it is in effect; one announced for later is listed as scheduled, with its times. Deicing appears as its own notice. Times read in Pacific time (“Until Oct 1, 7:59 PM PDT”). If the FAA feed can’t be read cleanly, or a refresh fails, the panel and the map pins say the status is unknown rather than leaving On Time showing.'
	},
	{
		date: '2026-10-01',
		title: 'Airport delays show up again',
		description:
			'The airport panel now reads the FAA feed correctly: ground stops, ground delay programs, arrival and departure delays and closures appear with their cause and minutes, instead of every airport reading On Time. If the FAA can’t be reached, the panel says the status is unavailable rather than showing On Time.'
	},
	{
		date: '2026-09-30',
		title: 'Preview morning brief',
		description:
			'The dashboard preview now opens with a morning brief: the temperature observed at Gnoss Field, today’s chance of rain for your forecast area, the next tide with its station, and a shortcut to traffic cams. Weather advisories for Marin’s zones appear with their area and end time and leave on time; if they can’t be checked, it says so. A source-health button lists any data source that is out of date. The regular dashboard is unchanged.'
	},
	{
		date: '2026-09-30',
		title: 'Preview sections and larger type',
		description:
			'The dashboard preview now has its page structure: collapsible sections that remember what you opened, links like /?layout=v2#news that open a section directly, a jump bar on phones, and larger, airier text. Section contents arrive in upcoming releases. The regular dashboard is unchanged.'
	},
	{
		date: '2026-09-30',
		title: 'Preview loads only what it shows',
		description:
			'The dashboard preview now loads its map data and headlines itself, once, whichever sections are open, and reads headlines from the shared news snapshot instead of fetching every feed in your browser. Strava data is never loaded in the preview. The regular dashboard is unchanged.'
	},
	{
		date: '2026-09-30',
		title: 'Honest source status for the preview',
		description:
			'Behind the scenes of the dashboard preview: every data source now reports ok, out of date, unavailable or unknown against the clock, and a section that mixes working and failing sources says "partial coverage" and names the ones that failed. Nothing changes on the regular dashboard.'
	},
	{
		date: '2026-09-29',
		title: 'TV map pins show up right away',
		description:
			'The TV now reads headlines from the shared news snapshot instead of fetching and parsing every feed itself, so Fix It Marin and earthquake pins appear on the county map within a few seconds of loading, and a news outage shows as DEGRADED instead of an empty screen.'
	},
	{
		date: '2026-09-29',
		title: "Weather alerts are Marin's",
		description:
			"The weather alert banner now shows National Weather Service alerts for Marin's own zones (coast, Point Reyes, interior valleys and the county). It had been showing San Francisco's alerts."
	},
	{
		date: '2026-09-29',
		title: 'TV keeps your theme',
		description:
			'Opening the TV wallboard no longer switches the dashboard to dark mode for good, and precise news pin locations no longer go missing after a quick trip to TV and back.'
	},
	{
		date: '2026-09-29',
		title: 'Latest reporting groundwork',
		description:
			"Marin IJ's and NBC Bay Area's Marin County feeds now count as county-wide news, TV and Pulse '24h' counts only count dated stories, and earthquake pins show their age. Groundwork for the redesign's Latest reporting list."
	},
	{
		date: '2026-09-29',
		title: 'TV keeps your town',
		description:
			'Opening the TV wallboard no longer clears the town you picked on the dashboard, and clicking a map pin opens its details without switching the whole dashboard to that town.'
	},
	{
		date: '2026-09-29',
		title: 'Preview settings menu',
		description:
			'The dashboard preview has a small ⚙ menu for text size, default location, theme, camera visibility and Reset sections. Settings are shared with the regular dashboard. One corrupt saved setting no longer resets the others, and a saved light theme now sticks.'
	},
	{
		date: '2026-09-29',
		title: 'Dashboard redesign preview',
		description:
			'An early preview of the redesigned dashboard is available at marinmonitor.com/?layout=v2. The regular dashboard is unchanged.'
	},
	{
		date: '2026-09-29',
		title: 'Belvedere moves to civic news',
		description:
			'Belvedere items no longer appear in Police Logs: they were city announcements, not police calls. City of Belvedere news now comes from its official feed in the Civic column. Belvedere does not publish a public police call log that we could find.'
	},
	{
		date: '2026-09-29',
		title: 'Fairfax and Belvedere police logs return',
		description:
			'Fairfax weekly press logs and Belvedere public-safety posts show up in Police Logs again. Both town sites had been refusing our requests; Marin Monitor now identifies itself honestly and reads Belvedere from its new cityofbelvedere.gov address.'
	},
	{
		date: '2026-09-29',
		title: 'Honest news timestamps',
		description:
			'News items without a real publication date now say "undated" instead of "just now", and a new background producer collects every local feed every 15 minutes, keeping the last good stories when a source is down.'
	},
	{
		date: '2026-09-29',
		title: 'Live data is back',
		description:
			'Coffee, cappuccino, grocery, wine, Ikon Pass, dog-walker, EV-charging and driveway numbers are live again after months of silently stale data. Federal fire incidents are back on the fire map, Marin IJ local news and Marin Lately read from working feeds, and the health check now alerts on any new failure.'
	},
	{
		date: '2026-09-28',
		title: 'Fire cams appear instantly',
		description:
			'TV: ALERTCalifornia fire-cam tiles are now painted the moment a camera slide appears, instead of sitting blank for a couple of seconds while the frame downloaded again.'
	},
	{
		date: '2026-09-28',
		title: 'TV cameras load cleanly',
		description:
			"TV: camera tiles no longer flash 'Camera offline' while loading. They show the last good frame (marked stale if old), recover automatically, and the next camera slide is preloaded so it appears ready."
	},
	{
		date: '2026-09-28',
		title: 'Honest health check',
		description:
			'/api/health now covers all 20 data sources, including the five Cost of Being Marin inputs, and returns 503 whenever any of them is stale or unverifiable. Several sources are stale today and are shown that way until they are repaired.'
	},
	{
		date: '2026-04-05',
		title: 'Mobile layout fixes',
		description:
			'iPhone horizontal scroll eliminated from the signal deck. Signals and Environment panels are now legible on phone with collapsed stat grids and narrower tables.'
	},
	{
		date: '2026-04-05',
		title: 'TV mode: swipe to navigate',
		description:
			'Swipe left or right on the TV wallboard to change screens. Map panning and sidebar scrolling are unaffected.'
	},
	{
		date: '2026-04-01',
		title: 'TV Mode Refresh v2',
		description:
			'20-screen carousel with Cost of Being Marin hero, 311 Photo Wall, index cards, map overlays, and scroll that remembers where you left off.'
	},
	{
		date: '2026-03-31',
		title: 'TV Leaderboards Refresh',
		description:
			'TV mode now shows 20 random segments per column instead of the same 8. Segments with recent KOM/QOM changes pinned to top. Different mix each page load.'
	},
	{
		date: '2026-03-31',
		title: 'Coffee Index Now Automated',
		description:
			'Coffee price scraper runs weekly. Previously manual-only, which is why live sources showed 0/11.'
	},
	{
		date: '2026-03-31',
		title: 'County-Wide Strava Catalog',
		description:
			'Full Marin segment discovery: 2,225 segments total. Curated 100 ride / 100 run shortlist as default dashboard catalog with daily leaderboard cron.'
	},
	{
		date: '2026-03-31',
		title: 'Panel Defaults Fixed',
		description:
			'New panels (composite, leaderboards, cappuccino, grocery, wine, tuition, fitness, driveway) now automatically included in presets. Older saved layouts updated on load.'
	},
	{
		date: '2026-03-29',
		title: 'Cost of Being Marin',
		description:
			'Composite index with tiered sub-scores (Daily Life, Lifestyle, Housing, Structural). The Marin Number: $21,110/mo ($253,320/yr).'
	},
	{
		date: '2026-03-29',
		title: 'The Marin Driveway',
		description:
			'Vehicle registration data from California DMV. Top makes, fuel type breakdown (8.3% EV), and fun stats like 68 hydrogen fuel cells and 12 Lucids.'
	},
	{
		date: '2026-03-29',
		title: 'Fitness Drop-in Index',
		description:
			'Drop-in class prices at 16 studios across yoga, pilates, cycling, CrossFit, and HIIT. Map pins color-coded by type.'
	},
	{
		date: '2026-03-29',
		title: 'Marin Private School Tuition Index',
		description:
			'7 schools across 4 tiers (preschool through high school), shown as percentage of median household income. Cumulative K-12 cost: $698,998.'
	},
	{
		date: '2026-03-29',
		title: 'Wine Index',
		description:
			'Premium wine market tracker powered by PlumpJack Shopify API. Category medians for Napa/Sonoma Cab, Burgundy, and Champagne. Staff picks and allocated wines.'
	},
	{
		date: '2026-03-29',
		title: 'The Bare Essentials',
		description:
			'12-item Marin grocery basket tracked via Instacart. Vital Farms eggs, Marin Kombucha, Silver Oak cab, and more with sparkline trends.'
	},
	{
		date: '2026-03-29',
		title: 'Marin Coffee Index',
		description:
			'Gas-prices-style coffee tracker with Marin shop pins, multi-drink hover details, and cappuccino as the countywide benchmark.'
	},
	{
		date: '2026-03-28',
		title: 'Strava KOM Tracker',
		description:
			'Curated Marin cycling and trail segments with live Strava leaderboards across the Leaderboards panel, interactive map overlays, TV mode, and chyron updates.'
	},
	{
		date: '2026-03-24',
		title: 'TV Mode v2',
		description:
			'Redesigned TV dashboard with 8 screens: map explorer with per-region weather, news wire, safety with auto-scroll, 3 geographic camera clusters (Tam & Coast, Central & Highway, West & North), conditions & trails, and outdoors & community. Press M or click the TV button to try it at /tv.'
	},
	{
		date: '2026-03-04',
		title: 'Featured listings & events',
		description:
			'Newspaper-style classified ads inline in wire columns and as banners. Local listings, events, and community features from Marin businesses.'
	},
	{
		date: '2026-03-03',
		title: 'Airport map pins',
		description:
			'SFO, OAK, STS (Santa Rosa), and SJC (San José) appear as color-coded dots on the map. Green = on time, amber = delays, red = ground stop. Click for details.'
	},
	{
		date: '2026-03-03',
		title: 'Airport Status panel',
		description:
			'SFO and OAK delays, weather conditions, fog risk, and forecast alerts. Data from FAA NAS and Aviation Weather.'
	},
	{
		date: '2026-03-03',
		title: 'Pathogen Watch panel',
		description:
			'Wastewater pathogen surveillance from 5 Marin sewersheds. Tracks COVID, Flu A, RSV, and Norovirus with trend sparklines.'
	},
	{
		date: '2026-03-03',
		title: 'Bug fixes',
		description:
			'Settings modal no longer transparent. Gas prices chart reads left-to-right. Pacifics schedule shows clean game titles.'
	},
	{
		date: '2026-03-02',
		title: 'Town filter overhaul',
		description:
			'Per-town filtering across the whole dashboard. Weather, conditions, gas, and EV panels re-fetch for your selected town.'
	},
	{
		date: '2026-03-02',
		title: 'Expanded fire camera coverage',
		description:
			'Added all 17 ALERTCalifornia fire cameras across Marin, organized by sub-region. New expandable full-screen camera grid.'
	},
	{
		date: '2026-03-02',
		title: 'EV charging station tracker',
		description:
			'200+ stations from NREL AFDC with pricing data from Open Charge Map. DC fast charger and connector breakdowns.'
	},
	{
		date: '2026-03-01',
		title: 'Gas price tracking',
		description: 'Real-time Marin County gas prices with station-level data and trend history.'
	},
	{
		date: '2026-02-28',
		title: 'Traffic camera feeds',
		description: 'Live Caltrans CCTV feeds for Highway 101 and Sir Francis Drake.'
	},
	{
		date: '2026-02-27',
		title: 'Coastal conditions panel',
		description:
			'NOAA tide predictions, marine buoy data, and nearshore conditions for Point Reyes and SF Bar.'
	},
	{
		date: '2026-02-26',
		title: 'Air quality monitoring',
		description: 'Real-time AQI from AirNow with pollutant breakdowns and health guidance.'
	},
	{
		date: '2026-02-25',
		title: 'Interactive Marin map',
		description:
			'MapLibre base map with Mapbox traffic overlay, toggleable civic/news/safety layers, and earthquake markers.'
	},
	{
		date: '2026-02-24',
		title: 'Initial launch',
		description:
			'Local news aggregation, weather forecasts, community feeds, and the signal deck dashboard.'
	}
];

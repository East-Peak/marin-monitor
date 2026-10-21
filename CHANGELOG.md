# Changelog

All notable changes to Marin Monitor are documented here.

---

## 2026-10-20

### Added — The Lifestyle Index: its tax engine (not shown yet)

- **A 2026 federal and California tax engine for W-2 wages**, and a solver for the pre-tax salary a household needs to break even. Federal and California are computed separately, each with its own itemised rules (the SALT cap and its phase-down, the mortgage-interest limits, the gift floor, §68, California's itemised limitation and credit phase-outs, the 1% tax over $1 million, SDI with no wage cap). It is checked against ten hand-worked reference cases to within $5 a line. Nothing on the site uses it yet.
- **Every published figure the Lifestyle Index will use, with its source.** Each one carries the exact figure, the page or dataset it was read on, its period and scope, the date we read it, and when it goes stale (an offer's end date, or a re-check cadence). Not shown yet.
- **The engine that prices a household's month.** Each line is priced only from its own inputs, and each input says what it is: our own live read (with when we read it), a published figure (with where and when), or a stated assumption. Nothing is substituted: an input we cannot vouch for leaves its line unpriced, and a budget missing a required line shows no break-even salary. The mortgage comes from the household's frozen purchase (and refinance) facts, never today's market. Not shown yet.

## 2026-10-19

### Added — Stories placed by the place in their headline

- **A story whose headline names one place we have checked is drawn there**, only as precisely as that place: a bay, beach, park, peak or bridge is a soft halo labelled "(area)" ("Tomales Bay (area)"); a building (a ferry terminal, a SMART station, the Point Reyes Lighthouse, a show venue) is a dot. The story's detail says where the place came from: "Tomales Bay (area) · matched in the headline". A placed story is no longer counted on a town's dot. The Stories group in Layers says how the stories in view are placed: by their headline, on their town, or at their feed's own point.
- **Only the headline, and only one place.** A summary's place is too often a meeting room, so it is never read. A headline naming two places, or a school, college or agency named after a place ("Mount Tam School", "Golden Gate Bridge District"), places nothing; a building must agree with any town the headline names. "Point Reyes Station" is the town, not the Lighthouse. A feed's own point still wins.
- **The places were checked against OpenStreetMap.** Three of the map's landmark buildings were off (the Sausalito Ferry Terminal by 716 m, the Novato Downtown SMART station by 1.4 km); stories use the checked points. The landmarks layer itself is unchanged.

## 2026-10-18

### Added — Shows and sheriff reports back on the map

- **Shows · next 10 days.** A dot at each venue we have checked (Sweetwater, Rancho Nicasio, Mac's at 19 Broadway, Dance Palace, the Osher Marin JCC, the Tourist Club), placed on the venue's own building. Click it for its shows; each show is a row under its venue in the In view list. A show is mapped only when its own listing agrees it is at that venue: an event the JCC lists at Rodef Sholom, a West Point Inn screening on the Tourist Club's calendar, a virtual briefing or a cancelled matinee stays off the map. The Layers row says how many upcoming shows are mapped and how many are not.
- **Events and the map agree on what's on.** Both read the same next ten Pacific days. A listing counts only with the venue's own show date: Sweetwater's feed dates are post times and the hub pages are dated when we read them, so neither is listed. Rancho Nicasio's and Mac's dates are now the show's day (Rancho's shows had been landing on the evening before).
- **Sheriff blotter · last 36 h**, counted on each town's dot ("San Anselmo · 2 sheriff reports"). The county publishes a hundred-block ("5XX The Alameda") but a much finer point; we show the hundred-block as text and never draw the point. Only property and public-place reports (theft, shoplifting, burglary, vandalism, stolen property, trespass) are shown; the rest are counted in the row as "not shown". A failed read says unavailable; a read kept after a failure says from when, and its reports still drop off after 36 hours.
- **Venue points checked against their addresses.** The Tourist Club's point was 1.3 km off; five others were 80–150 m off.

### Fixed — Hide and Show in view leave the map still

- **The map no longer slides when the In view list hides or comes back.** Every town, pin and road stays where it was; the list and Layers counts still update to the newly uncovered (or covered) part of the map, and later fits and flights still land clear of the list. A pin picked while the list is hidden, or a Hide during a flight, still lands its item in the open part of the map.

### Fixed — A selected camera lets go

- **Back to list, Esc, or a click on empty map now unselects** a camera or any other selected item. Its wedge goes quiet, the white ring goes away and the list comes back, on the dashboard map and on /map (where the link's `sel` is cleared too). A drag still keeps the selection. On a tablet the same three close the inspector; on a phone, the detail's Close does it.
- **Back no longer relights the camera.** Focus going back to the list's row lit its camera again; now only a pointer or the keyboard (Tab) lights a row's camera.

### Changed — Road speeds show free-flowing roads; 511 reads stay inside their allowance

- **Free-flowing roads are drawn**, as a faint grey-green line under the slowdown colours, so a quiet Sunday map shows the roads are covered rather than looking empty. Slow spots stand out against it.
- **The Layers row says what the lines show**: "No slowdowns in view", or "N slow segments in view", counted from the segments drawn on screen, with a colour key (free flow, moderate, heavy, severe, closed).
- **511 reads are budgeted under our key's 60-an-hour limit.** Road events are read at most every 5 minutes, transit alerts every 15 minutes per agency, and concurrent requests share one read. A road read that hits a 511 server error tries once more; a "too many requests" answer is never retried, and every route waits out 511's Retry-After. A failed read still says it failed.

### Changed — 511 reads say why they fail

- **Every read from 511 (road events, transit alerts) now logs one line** with 511's answer, its `Retry-After` and the requests left on our hourly allowance, so an intermittent "Traffic events unavailable" can be traced to a cause. A failed road read also says 511's status in its reply.

### Changed — Quieter camera wedges, a bigger picture, cameras where they are

- **Camera wedges are quiet until you ask.** At rest each wedge is a faint tint with a hairline outline, drawn under every dot on the map. Hovering a wedge, its camera's pin or its row in the list, or opening the camera, shows its wedge at full strength. A tap does the same on a phone.
- **The picture enlarges.** In the camera's panel, click or tap the picture (or "Enlarge") to see the whole frame as large as the screen allows, credited below it. Esc or Close goes back to the panel. On a phone it fills the screen.
- **Cameras sit at their sites.** Eleven ALERTCalifornia pins were 1 to 17 km off; each is now on its named peak or ridge, within 1 km of ALERTCalifornia's own point. League 221 is west of Hicks Valley, not in Novato. Mt. Vision is on Inverness Ridge, not in Tomales Bay.
- **A camera without a wedge says why**, e.g. "No direction drawn: last frame 11 min ago".

### Changed — The test suite passes at full speed

- **The page says when it is refreshing.** The v2 dashboard's root carries `data-cycling="true"` while a data refresh is in flight, so tests can wait for one to finish instead of guessing how long it takes. Nothing visible changes.
- **The end-to-end suite passes with every worker running.** Tests that waited a fixed time, or let the test clock run minute by minute, now wait for what they check: the page settling, a response arriving, a TV screen becoming current. The TV tests pause the carousel and go to each screen by its dot, and Fix It's photo wall is tested both with and without a photo.

### Fixed — Camera pictures show whole, with nothing on them

- **Labels moved off the picture.** On the camera strip, the camera wall, and `/tv`, the camera's name, credit, heading and "updated" time now sit under the picture instead of on it. ALERTCalifornia asks that their frames not be cropped and that the info bar along the bottom not be covered. Pictures now show whole, never trimmed to fit the tile. On a phone the caption is one line (name and credit) to keep the strip the same height, so tiles are slightly narrower.

## 2026-10-17

### Added — Traffic cameras on the map; a down camera says so

- **The four Caltrans cameras on 101** are on the map too, where Caltrans places them, each with a short wedge on the road direction it faces. Caltrans gives only a compass quadrant, so these wedges are labelled "approximate (road direction)". The layer is now called **Cameras**.
- **"Temporarily Unavailable" is no longer a picture.** When Caltrans serves its stand-in card ("Temporarily Unavailable", "Down for Construction" or a crossed-out camera) instead of a picture, the tile says "Camera temporarily unavailable" and makes no "updated N min ago" claim. Its clock bar changes every frame, so the card is recognised by a coarse picture of it compared with captured copies, never by reading its text.

### Added — Fire cameras on the map, with the way each one looks

- **A wedge per camera.** The 17 ALERTCalifornia ridge cameras are pins on the v2 map, each with a wedge pointing the way it last reported looking. The wedge is solid while the camera holds still, dashed while it sweeps on patrol, and gone when its last frame is more than 5 minutes old. Its length is a drawing convention, not how far the camera sees; the Layers list says so.
- **Click a wedge or pin** to open the camera's latest frame in the side panel, refreshed every 15 s, with "Last reported heading: SSE (163°) · 7:52 AM". That is when we read the heading; the picture may have been taken at another moment, and the panel never claims they match.
- **Camera tiles** now say "Looking SSE · 163°", or "Sweeping" while patrolling. With no heading, there is no footer: never a guess.
- If ALERTCalifornia's camera list can't be read, the layer says "unavailable", draws no wedges, and the cameras still open.
- ALERTCalifornia frames are now credited "ALERTCalifornia | UC San Diego", as they ask.
- New: `GET /api/cams/heading` (30 s public cache; 503 with a reason when the feed can't be read).

### Changed — Every map layer starts on

- EV chargers, coffee and fitness studios now start switched on, like everything else, on the dashboard map and on `/map`. Anything you've switched off stays off.

### Added — Explore mode: the map on the whole screen (/map)

- **Phone:** "Expand map" now opens `/map` instead of growing the map in place. There, a sheet at the bottom shows how many things are in view; tap it, press ↑ or swipe it up for the list, and pick one to read its detail over the map. Layers sit behind the map's Layers button. The dashboard's small preview is unchanged.
- Coming from the dashboard, a layer you switch on `/map` is saved as usual. A link someone else sent you with different layers applies only to that visit.
- **"Explore ↗"** on the desktop map opens `/map`: the map fills the screen, the Layers list is a column on the left that is always open, and the "In view" list and each item's detail sit on the right.
- **The link is the view.** The address keeps the camera (`#zoom/lat/lng`), the layers that are on and the open item (`?layers=…&sel=…`). Toggling a layer, opening an item or going back updates it at once, so a copied link reopens exactly what you see.
- A link's layers apply for that visit and never change your saved choices. A linked item turns its own layer on. If its source can't be read, the list says so ("Fix It Marin is unavailable right now"); if it has left the feed, it says that instead.
- **Esc** goes back from an item to the list, then back to the dashboard. "← Dashboard" does the same.
- The page arrives with the layer names and the latest headlines in its HTML, is cached like the dashboard and is not indexed.

### Added — Road speeds, airports and fitness studios on the v2 map

- **Road speeds** (Mapbox congestion lines) are back, on by default, with their own status: "Mapbox · as of …" once the tiles in view have loaded, or "Mapbox unavailable" when one fails. A failure takes the colour off the roads instead of leaving stale lines.
- **Airports**: SFO and OAK pins from Getting Around's FAA read, in the card's words ("SFO no delays" only from a fresh read). On by default. Santa Rosa and San José stay off until Getting Around reads them.
- **Fitness studios** (Fitness Drop-in Index), off by default, listed in "In view" like the other places.
- **Phone:** the same Layers list, once the map is expanded. The collapsed preview loads nothing new.
- The Getting Around card keeps acronyms when it lowers a line ("SFO FAA status unavailable", not "faa").
- Still off, on purpose: keyword alert pulses, and news pins placed by guessing an address from the article text.

### Changed — The phone and tablet say what desktop says

- **On the phone, the "Getting around" line under the brief now shows status**, in the desktop card's own words, instead of a bare link: for example "Marin Transit: 511 lists no alerts". It is still one tap to the section. Airports and roads join the line once the section has been opened (the phone loads them only then). Anything out of date or unverified comes first, so a cut-off line never hides a warning.
- **Tablets (768–1023 px) get the jump row** under the header: Map · Getting around · Outdoors · News · Cost · Events. Before, they had no jump navigation at all. The phone keeps its bottom bar.

### Changed — A full-width desktop map with an "In view" list and more layers

- **The map spans the page** on desktop, 62% of the window's height (520–820 px). Latest reporting sits under it as one row of five headlines. That row is still the content the page arrives with, and what the phone shows.
- **An "In view" list** docks inside the map's right edge, 360 px wide and collapsible. It lists what the visible map shows, newest first in each layer: stories (a story placed only by town is listed at its town circle), Fix It Marin reports, earthquakes and every layer that's on. Hovering a row rings its pin, and hovering a pin marks its row. Clicking either flies there and opens the item in the list: the report's photo and text, a link to the source and the time. "Back to list" or Esc returns. On desktop the map's pop-up is gone.
- **A Layers button** opens a checklist. Each layer shows its colour, how many are in view, its source and when it was read, or "unavailable" (with no count).
  - **Traffic** (511, Marin events, every severity; an event without a location is counted, not dropped), **Fire** (CAL FIRE + NIFC) and **Gas prices** are on by default.
  - **EV chargers** and **Coffee** are off by default.
  - The story categories are its "Stories" group.
  - Choices are remembered.
  - Airports, fitness studios and landmarks stay off. They have no honest status, or add nothing here.
- **Easier to read:** town circles use a brighter fill with a light outline and a count. Fix It Marin dots are smaller and lighter at county zoom, and grow as you zoom in.
- **Behind it:** `/api/traffic/corridors` now carries each event's 511 location.
- Desktop only (1,024 px and wider). The phone, `?layout=legacy` and `/tv` are unchanged.

### Changed — Advisories, Getting Around and jump links at the top of the desktop page

- **Advisories are chips**: "⚠ Beach Hazards Statement · North Bay coast · until Oct 18, 5:04 PM", one per advisory, wrapping as needed, instead of a full-width box. Clicking one opens the National Weather Service's own text (what, where, what to do) in a panel on the right; Esc or Close puts you back on the chip. "Advisories unavailable" is one muted line.
- **Getting Around is a status card** in the brief's third slot instead of a link: "SFO no delays · OAK no delays · 511 lists no incidents on Marin roads · Marin Transit: 511 lists no alerts". An all-clear appears only from a fresh read; otherwise the card says "out of date", "not verified" or "unavailable". The whole card jumps to the section.
- **Jump links** under the header: Map · Getting around · Outdoors · News · Cost · Events.
- Desktop only (1,024 px and wider). The phone is unchanged.

### Changed — The top of the desktop dashboard answers more at a glance

- **Weather** shows the temperature large, with the last 12 hours at Gnoss Field (Novato) drawn beside it and the next 8 hours' temperature and rain chance underneath. The 12-hour line comes from the station's own reports; a stretch with no report stays a gap.
- **Tides** draws today's curve from NOAA's own hourly predictions, with each high and low marked on it. If NOAA's hourly heights can't be read, the card says "Tide curve unavailable" rather than drawing one of its own.
- **Ocean · Point Reyes** fills the third slot: wave height and period now, and the next 24 hours, from the Open-Meteo marine forecast (a model, labelled as one). It loads straight away on desktop, and a failed read says "Ocean forecast unavailable".
- Desktop only (1,024 px and wider). The phone's brief is unchanged and requests nothing new.

### Changed — The redesigned dashboard is now the default

- **The redesigned dashboard is now the default.** The old one stays at marinmonitor.com/?layout=legacy for now; the header's "Old dashboard" link goes there. `/tv` is unchanged.
- `/` carries the old dashboard's title, description and link-preview tags, is indexable, and is edge-cached for 60 s once its news snapshot reads in time (otherwise it isn't cached at all). `?layout=v2`, `?layout=legacy` and `?layout=edit` still work, are never edge-cached and are `noindex`; `?layout=v2` names `/` as its canonical page.
- The "preview" badge and footer note are gone. Rolling back is one constant (`DEFAULT_DASHBOARD_LAYOUT`).

### Changed — The v2 preview arrives with its news already on the page

- **Latest reporting is in the page's HTML.** The server reads the published news snapshot (at most 1.2 s) and renders the five Latest-reporting items with their ages, so a slow phone, a link preview or a crawler sees news before any script runs. If the read fails or runs out of time, the page loads news in the browser as before and is never cached; it never says "no reports".
- The browser starts from the same snapshot and the same clock as the server, so nothing flashes or re-dates on load. A later snapshot replaces it; an older one never does. The map's pins come from the same snapshot when the map starts.
- A saved town applies right after the page loads: the server's page is county-wide for everyone, then the list narrows once.
- **Marin Lately shows only when it has something recent.** The band appears while its newest piece is at most 30 days old; otherwise it's gone, with no heading and no "quiet for N months" note. Today (newest piece Jan 7) it's hidden.

## 2026-10-16

### Added — A way back to all of Marin on the v2 map, and a key for what it shows

- **"All of Marin"** sits in the map's bottom-left corner whenever a town is chosen or the map has moved off the county view. It clears the town (the "Showing" picker goes back to All of Marin) and returns the map to the same county view it opens on.
- **The map now says what each layer shows.** Stories (news, safety, civic, activity, housing, Marin Lately) carry a town, not a street address, so each town gets one circle sized by its stories. Only Fix It Marin reports and earthquakes have exact spots. The key under the button lists each layer that's switched on, how it's placed and how many are in view ("Stories · 10 in the San Rafael circle", "Fix It Marin · 44 in view"). A layer that hasn't loaded gives no count.
- Why: zoomed into San Rafael with every layer on, the map looked like it showed only Fix It Marin. On Oct 16 all 10 San Rafael stories were in the one red circle at the town centre, and no news story had a street location.

### Changed — Getting Around in the v2 preview answers "can I get there?"

- **Roads come first** and say where and what in plain words: the road and 511's location (direction as the signs say it, e.g. "US-101 SB between I-580 W and Tamalpais Dr"), then the kind, the lane consequence ("some lanes closed", "road closed"), the severity in words ("severity unknown" when 511 doesn't say) and how long ago it was reported. A colored dot adds to the severity; it never replaces the words. At most 3, worst first: full closures, then Major, unknown, Moderate, Minor.
- **Marin and the airport trips are separate chips.** Roadwork on 101 in Corte Madera is both "Marin" and "to SFO". The trip chip appears only when 511's direction is the way out of Marin (101/280/380 south to SFO, 580 east then 80/880 to OAK). The return direction says "toward Marin", and an event 511 gives no point for claims no trip at all. Long-term construction shows only when it closes the road.
- **Transit summarizes instead of listing headlines.** Alerts that share a headline prefix become one row ("Night Closure · 7 stops: Terra Linda SB, Lucky Dr, Terra Linda NB, …") with one stop's own description as the example. Other alerts show their headline with a short excerpt. "Timing unverified" appears when 511's active periods don't add up. Alerts not in effect now, and the named Clipper promotion, are left out. "N more" counts alerts. Agencies 511 lists nothing for share one line, "No alerts on 511; check the agencies", with each agency's page linked once. A failed read says unavailable.
- **Airports:** one line, "No airport-wide delays at SFO or OAK", while both are plainly clear; the detail returns when either isn't.
- Nothing on the page says "on time", "tonight" or "no delays" unless a fresh, complete read backs it. The phone page with everything open is shorter than before (4,835 px; the budget is 5,064).

### Fixed — Air quality reads again

- AirNow retired the endpoint `/api/air-quality` used (`/aq/observation/latLong/current/`, HTTP 410 since Oct 1), so every AQI display had been blank. The route now reads `/aq/observation/current/ziplatlong/` and reports the worst pollutant's NowCast AQI, its category, the reporting area and the hour AirNow observed it. A service error or an unreadable payload is now a 502 that isn't cached, never "no reading".
- **Preview, Outdoors · Air, fire & ground:** the Air quality row shows the AQI and category (e.g. "14 · Good", with a category-coloured dot), plus the pollutant and area. Its source line reads "AirNow · as of 4:00 AM". A failed read says "Unavailable" with the reason. So does a reading kept after a failed refresh (with the last value noted) or one with no observation time; none of them shows a number as current. A reading stays current for 3 hours, since AirNow posts each hour late.
- The regular dashboard's Environment panel and the TV Conditions card use the same route, so they show AQI again.

## 2026-10-15

### Added — News & Civic, Events & Sports and Marin Lately in the v2 preview

- **More from the wire:** the next twelve stories after the five in Latest reporting, never repeating them. "Nothing beyond the five above" appears only when every reporting feed is current.
- **311 · Fix It Marin:** reports per day, oldest first. The strip stops at the feed's own update day, so a stale read never invents empty days. Also the six most-reported issue types and the three newest reports. A failed read says "Unavailable", never 0.
- **Police & parks:** the newest police log entries and National Park Service alerts, each from its own read. An NPS rate limit is now reported as a failure instead of "no alerts".
- **Events & Sports:** shows over the next ten days, with a day that has none drawn as a blank bar rather than "0". Then the next five shows and the race calendar. Only times still ahead count, so a venue's calendar page or a news post is never mistaken for tonight's show. A failed read says so in one card.
- **Marin Lately:** a full-width satire band with up to six pieces. It says how long the feed has been quiet, computed from its newest piece (on Oct 15: Jan 7, quiet for 9 months). Subscriber notices are left out.
- **Data sources:** a footer line for each source in the health report, with its status and as-of time.
- **News & Civic header:** reads "N of M feeds OK".
- **Where:** on desktop News & Civic sits beside Events & Sports (7 and 5 of 12 columns from 1280 px), after Cost and the Lately band. Phones and tablets get the same News (with Lately) and Events content inside their collapsible sections. Cost and the sources footer stay desktop-only, so the phone stays inside its height budget.

### Added — Cost & Character in the v2 preview (desktop)

- **Cost of being Marin:** the composite index with its change against the previous weekly reading, a weekly trend with the base-100 line, tier bars centred on 100 (right is pricier than baseline, left cheaper; a tier more than 20 points out pins at the edge), and "N weekly readings since …".
- **The Marin Number:** the monthly total and its yearly figure, a stacked bar, and every line item tagged live or static, Rivian included.
- **Gas prices · regular:** the county average with its low–high band; average, 7-day change, cheapest and station count; the three cheapest stations and the priciest; diesel and premium on the source line.
- **The sub-indexes:** twelve tiles (four across, six from 1700 px), each with a sparkline or "No history yet" when its source has fewer than two readings, and its own source line. A read that failed says "Unavailable" with the reason, never $0.
- **Where:** desktop (1024 px and wider). Phones and tablets keep the placeholder for now, so the phone layout is unchanged.

### Fixed — Gas 7-day change

- The regular dashboard's gas panel compared today's average with a July reading (the 42nd-oldest snapshot) and called it the 7-day change: on Oct 15 it showed +0.759 when the week's real change was −0.222. It now compares with the newest reading at least 7 days old, and shows "—" ("Not enough history") when there isn't one. The preview's gas card uses the same calculation.

### Added — Outdoors & Conditions with charts in the v2 preview

- **Next 24 hours:** a temperature curve with the high and low labelled and a "now" line, hourly chance-of-rain bars ("0% every hour" only when all 24 hours are forecast at 0%; a missing hour draws nothing and is counted), the temperature range, peak rain and warmest day, and a 6-day high/low strip. All of it comes from the NWS hourly forecast the brief already loads, so there is no extra daily-forecast request.
- **Tides:** a 48 h curve through NOAA's high/low predictions with each high and low marked, plus the next four.
- **Surf · Point Reyes:** wave height and period over 48 h from the Open-Meteo marine forecast, labelled as a forecast, not a buoy.
- **Air, fire & ground:** air quality reads "Unavailable · no AQI feed connected"; wildfire reads "None near" only after both CAL FIRE and NIFC answer, and a failure says unavailable (unreported acreage or containment is named, never 0); earthquakes count every M2+ within 100 km over 7 days and name the largest, and a failed read is "Unknown", never 0.
- **Source lines:** every card ends with its source and when it was issued or checked, or why it couldn't be read.
- **Layout:** from 1280 px Outdoors sits beside Getting Around (7 and 5 of 12 columns); from 1024 to 1279 px they stack. Phones and tablets keep the collapsible section, with the charts inside it when opened.

### Changed — Desktop frame for the v2 preview

- **Full width:** at 1024 px and wider the preview runs edge to edge up to 2,240 px, with a gutter of `clamp(16px, 2.2vw, 44px)` (the approved desktop mockup).
- **Brief and map:** from 1280 px the brief is one row (Weather 5fr · Next tide 4fr · a third slot 3fr) and the map shares a 3:2 row with Latest reporting. The map is 500 px tall at desktop widths and 540 px from 1700 px. Below 1280 px both stack in one column.
- **Cam wall:** on desktop the Cams strip becomes a wall under the map, grouped by area: South Marin (4 of 6 columns, its first camera a 2×2 tile), then Central, West and North Marin, then the 101 traffic cams. A camera with no area goes into a final "Other" group and is never dropped. Tiles keep the strip's decode gate (a tile shows a picture only once it has decoded) and load only with the wall near the screen.
- **Sections:** on desktop they are always open on a 12-column grid, with a plain heading and no toggle, and a close saved on a smaller screen is ignored there. Phones and tablets (below 1024 px) keep collapsible, remembered sections and the swipeable strip, so the phone layout is unchanged.

### Added — Getting Around in the v2 preview

- **Airports:** SFO and OAK from the FAA (via `/api/airport-status`): "No delays reported", "Ground delay, avg 45 min, up to 90 min", closures and notices; a failed FAA read is "FAA status unavailable", never on time. "FAA · checked N min ago".
- **Roads:** 511 incidents on Marin roads and the routes to SFO (US-101, CA-1/19th Ave, I-280, I-380) and OAK (I-580, I-80, I-880), from `/api/traffic/corridors`; most severe first, with the route, severity and age; "No incidents listed…" only after a complete, fresh read. Three shown, then the 511 traffic map.
- **Transit:** 511's alerts per agency, each line linking to the agency's own alerts page. Marin Transit: "N alerts listed", "511 lists no alerts" only on a fresh, timed feed, "Alerts unavailable" on failure. Golden Gate Transit and Ferry, SMART and the Angel Island ferry: alerts 511 lists are shown, but an empty or failed 511 list makes no claim ("See goldengate.org ↗"), because on 2026-10-14 511 was empty while goldengate.org listed alerts. Alert rows link only to their own page.
- **Loading:** the section is closed by default on phones; airports and roads load only when it opens. Its header names any failing source.
- **Brief:** a compact "Getting around: airports, roads & transit →" link restores the entry point the Cams strip retired (phone budget re-measured).

### Added — Getting Around section for the v2 preview (part 1, not yet shown)

- `src/lib/dashboard/getting-around.ts`: the section's model. Airports (SFO, OAK) from the FAA fields only ("Ground delay, avg 45 min, up to 90 min"; "FAA status unavailable" for `unknown`); roads grouped Route to SFO / Route to OAK / Marin with 511's own kind and severity; Marin Transit from 511, and Golden Gate, SMART and Angel Island linking to their own pages (511's empty lists aren't trusted for them). "No delays reported", "511 lists no alerts" and "No incidents listed by 511 on these roads" appear only for a complete, timed, current read; otherwise the line says out of date, not verified or unavailable.
- `GettingAround.svelte`: the three parts, three rows each with "N more" links out to 511 and the FAA, and each part's source time. Not mounted yet.

### Added — Getting Around data for the v2 preview (part 2, not yet shown)

- Checked fetchers for `/api/airport-status` and `/api/traffic/corridors` (anything outside the expected shape throws; the section will show it as unavailable). Both load only when Getting Around opens (a new "detail" dataset tier), then refresh with every 5-minute cycle, each value carrying its own time (FAA response time; 511 check time).
- The v2 controller keeps each transit agency's read from its one existing transit request (no new 511 requests), and a failed or timed-out read reaches the view instead of leaving the last one looking current.

### Added — Getting Around data for the v2 preview (part 1, not yet shown)

- `/api/traffic/corridors`: 511's complete traffic event list (it follows 511's paging inside one 8 s deadline; a partial list is a 502, never served), filtered to Marin and the SFO/OAK routes in `src/lib/config/traffic-corridors.ts` (US-101, CA-1/19th Ave, I-280 and I-380 to SFO; I-580, I-80 and I-880 to OAK). Long-term construction excluded; incidents always kept; an event that can't be placed is kept and marked, and a record that can't be read is counted, never hidden.
- `fetchTransitAlerts` also reports each agency's own read: alerts in feed order with their own links only, the GTFS-RT feed time, or the failure; its body is now read under the owner's lifetime. Legacy items are unchanged.

## 2026-10-14

### Fixed — the v2 brief's temperature no longer goes blank when NWS's "latest" report is unprocessed

- **Cause:** the Weather card read KDVO's `/observations/latest`, which often serves a not-yet-QC'd copy of the newest report with no temperature (6 of 16 polls on 2026-10-14), while the station's observation list already held the same report with its value. The card then said "Temperature unknown" though Gnoss Field was reporting fine.
- **Fix:** the card reads KDVO's observation list (8 reports) and shows the newest report with a usable temperature from the last 90 minutes, with that report's own time. If none has one, it shows the newest report as it is: "Temperature unknown" if it has no temperature, or, if the station has gone quiet, its older number marked "out of date". A value QC-flagged rejected, questioned or bad (`X`/`Q`/`B`) is never the headline, and the time, temperature and description always come from the same report.
- **Store:** a refresh is judged by the list it came from, so a newer list can replace an "unknown" with an older report's value, or replace a value it rejected, while a stale copy of an older list never overwrites the one shown.
- Legacy `/` and `/tv` take their temperature from the NWS forecast and are unchanged.

### Added — the Cams strip in the v2 preview

- **Cameras:** an always-open row directly under the brief, above the map: 17 ALERTCalifornia ridge cams (south → north), then 4 Caltrans 101 cams. Phone: one swipe row with the next tile peeking; desktop: five per view with ‹ › buttons. Tapping a tile opens the source's full-size frame.
- **Honest tiles:** a frame shows only once it has decoded; a camera that never delivers reads "Camera offline"; if every camera tried is offline the strip says "No cameras are loading right now." Caltrans tiles show the source's own capture age (`Last-Modified`, now allowed in CSP `connect-src`), amber past 30 minutes; ALERTCalifornia exposes no capture time to browsers, so its tiles claim none.
- **Bandwidth:** only tiles near the viewport load, once a minute, never while the tab is hidden or the strip is scrolled away; ridge cams use ALERTCalifornia's ~6 KB thumbnails.
- **Settings:** the ⚙ toggle reads "Show cameras" and hides the whole strip (it says so, with a Show button). The brief's "Traffic cams & map" link is retired; the cams are right below it.
- **Layout budget:** on a 390×844 phone the strip takes ≤ 220 px and the rest of the page keeps the 1,266 px third-item budget (§13.3, re-ruled for decision 5a), measured healthy and with every camera down.

### Added — Cams strip building blocks for the v2 preview (not yet shown)

- `src/lib/dashboard/cam-strip.ts`: the strip's cameras (17 ALERTCalifornia ridge cams, then 4 Caltrans 101 cams; the frozen ABC7 frame and Windy embeds excluded), thumbnail URLs, and the age rule (only a source-provided capture time, amber past 30 min).
- `src/lib/dashboard/cam-frame-loader.ts`: decode-gated frames; Caltrans frames carry their own `Last-Modified`; cancellable, with a no-age fallback when CORS is unavailable.
- `CamTile.svelte`: TV's decode gate in a v2 tile — never an undecoded image; "Camera offline" only after two failures; refreshes only while active.

## 2026-10-13

### Fixed — map status no longer warns about 311 and earthquakes that loaded fine

- **Cause:** the v2 preview map read every successful 311 and USGS fetch as "unverified" because the time each payload reports was dropped before the status line saw it, so every healthy load showed "Partial coverage · Fix It Marin (311), USGS earthquakes unverified".
- **Fix:** USGS reads carry `metadata.generated` and 311 reads carry the blob's `lastUpdated`, both validated (a non-date, a zoneless time or an out-of-range number counts as no time). Each is judged by its own max age: 311 by G0a's 1 day, quakes by 30 min. A read with no payload time still reads "unverified". A pin kept after a failed refresh says from when ("Kept from 1:01 PM · HTTP 503").
- **Map emptiness:** "Nothing on the map right now" judges each layer by its own max age, so a normal few-hours-old 311 blob no longer turns an empty map into "Status unknown". A town click never shows a zero over a layer with no known time.
- **311 cron:** a 200 response with no `issues` array now fails loudly and keeps the last-good blob, so a non-answer never becomes a fresh "nothing here".
- The regular dashboard and the TV are unchanged.

## 2026-10-12

### Changed — map and Latest reporting proven in the built app (D1 PR 9c)

- **Phone layout:** the map preview is 160 px with its Expand/Collapse button over the preview's corner, and the phone header is tighter; on a 390×844 phone the third Latest-reporting item now ends at 1,256 px (budget 1,266, §13.3).
- **Map status:** a town with nothing on the map reads "Nothing for this town" when the other layers merely failed (they are named); only a kept or expired layer withholds it.
- **Built-app proofs:** e2e for selection and scope (3 town + 2 county-wide, no unlocated padding), no keyword alert affordance or pulse, only owned layers and no airport/traffic/fire requests, kept 311 and quake pins explained in the inspector, pins with every section closed, a collapsed phone preview that never captures scroll, and the height budget — each with a negative control that fails without its guard.

### Added — no-keyword-alerts guard for the v2 preview (D1 PR 9b2)

- **Guard:** an AST check parses every v2 `.ts`/`.svelte` file (nested folders included) and fails if code reads the keyword alert classification (`isAlert`, `alertKeyword`, `containsAlertKeyword`) by identifier, quoted key or element access. Words in comments, strings, template text and URLs ("ALERTCalifornia", Nixle `/alert/` links) pass.

### Added — map and Latest reporting in the v2 preview (D1 PR 9b)

- **Latest reporting:** the five newest items with a trustworthy publication time (undated, satire, event listings and items more than 5 minutes ahead excluded); with a town selected, up to 3 town items plus 2 county-wide, never padded with stories that name no town. Each row shows source · age · scope; the status line names failing reporting sources.
- **Map:** a 3:2 row with Latest reporting on desktop; on phones a preview that expands on tap and doesn't capture page scroll. Pins are present whatever sections are open; a pin never changes the town. The preview map draws only what this page itself loaded and vouches for (news, Fix It 311, earthquakes), dims anything kept after a failed refresh and says from when, and its status line counts the shown layers for the selected town; no keyword alert pulses, airport pins, traffic, or gas/EV/coffee/fitness places. Its own text meets the 12 px floor.

### Added — owner-driven map inputs for the v2 preview (D1 PR 9a2)

- **Map inputs:** the shared map can now leave out keyword alert pulses, airport pins, traffic and places, draw only data its owner hands it, and mark kept-after-failure features (dimmed, with an inspector note); it reports what it drew after each sync. The regular dashboard and TV keep reading their stores, unchanged.
- **Controller:** the v2 controller exposes its applied news snapshot and its own Fix It (311) items (none until its own first successful read).
- **Earthquakes (v2 only):** a cached copy after a failed USGS refresh counts as a failure, so the preview can mark it as kept; quake and 311 pins carry their item id for that note.

### Added — phone town label, measured values and the reporting model for the v2 preview (D1 PR 9a)

- **Town picker on phones:** the v2 header shows the selected town ("Showing: Mill Valley ▾"), and the button's accessible name says it; legacy `/` keeps its icon-only picker (spec §2.1). With the label shown, the phone settings menu anchors to the header so it stays on screen.
- **Measured values** (`src/lib/dashboard/measured.ts`): a value is shown only after this page's own successful read, with its own time; an expired or failed read is never "fresh" or "nothing new".
- **Latest reporting model** (`src/lib/dashboard/latest-reporting.ts`): candidates from the news snapshot's deduplicated stories; county scope from the producer ids of `COUNTY_WIDE_RULE`'s feeds, including merged copies; rows carry source, age and scope, and no alert field.
- **Tests:** the v2 sections e2e now follows the Strava mothball (five sections; no Strava section or data).

## 2026-10-01

### Changed — Strava is paused (mothballed)

- **Off the site:** one switch, `STRAVA_ENABLED = false` in `src/lib/config/strava.ts`, removes the Leaderboards panel, the v2 preview's Strava section, the TV leaderboards screen, the map's segment layer and its toggle, and the settings entry. The TV rotation and panel order close up with no gaps.
- **API and schedules:** `/api/data/strava-*` answer 404 before any blob read; the two Strava crons are gone from `vercel.json`, and their routes answer 404 without scraping.
- **Health:** `/api/health` no longer watches Strava Segments or Strava Events, and their accepted exceptions are retired with them.
- **Kept for a revival:** scrapers, curation scripts, curated catalog, fixtures and docs stay in the repo. To bring Strava back, set the switch to `true` and restore the two crons; tests pin both states.

### Fixed — airport status: timed closures, strict feed reading, stale map pins (Codex review of 8f996bc)

- **Closures follow their clock:** a closure counts as "Closed" only between its `startTime` and `endTime`. One announced for later is listed as "Closure Scheduled" with its window, and one that has ended is dropped.
- **Strict feed reading:** every entry must name its airport (a bare 3–4 character identifier, once), carry at least one event, and give each field it reads the expected type. Times must be zoned ISO 8601 times on a real calendar day, and a closure must have a start before its end. Otherwise the whole read is untrusted and the status shows "Status Unavailable". A valid empty list still means no events.
- **Map pins:** a failed, empty, partial or malformed refresh redraws every airport pin as "Unknown" instead of leaving the last "On Time" in place, and the next good refresh restores them.
- **Deicing** is listed as its own notice ("Deicing", since its event time), with no delay minutes and without marking the airport delayed.
- **Times in Pacific:** closure, delay and notice times read "Until Oct 1, 7:59 PM PDT" instead of raw ISO.

### Fixed — airport delays were never shown

- **FAA parser** (`src/lib/server/faa-airport-events.ts`): the NAS Status feed keys events by `airportId` and gives causes as `impactingCondition` (ground stops and delay programs) or `reason` (arrival/departure delays), with delays as numbers. The old reader looked for `airportCode`/`airport` — names guessed at the panel's creation, never in the feed — so every airport read "On Time" even under a ground delay program. Delays now carry numeric `avgMinutes`/`maxMinutes`; closures and free-form NOTAMs carry their text, and a NOTAM is listed as a notice without marking the airport delayed.
- **No false all-clear:** an FAA read that fails or doesn't parse now shows "Status Unavailable" (map pin: "Unknown"); weather and forecast notes still show.
- Pinned by tests against a real feed capture from 2026-10-01 (DFW's 79-minute thunderstorm ground delay program).

## 2026-09-30

### Added — morning brief, advisory contract and source health in the v2 preview (D1 PR 8)

- **Weather card:** observed "now" from NWS station KDVO (Gnoss Field, Novato; QC-rejected or missing values read "unknown"), kept separate from the forecast. "Rain today" is the highest hourly probability from now to Pacific midnight; a missing value or a gap reads "Rain chance unknown", never 0%. The forecast names the grid point it was made for ("Central Marin forecast"), and a town switch never relabels a retained value.
- **Next tide:** NOAA hi/lo predictions for the preset's station, read as Pacific time and named ("Point Reyes").
- **Advisory contract** (`src/lib/weather/advisories.ts`): the corrected Marin zone config (CAZ502/CAZ505/CAZ506 and county CAC041); `Actual` messages only; updates and cancellations honored; expiry by the clock with no refetch; a failed, stale or partly unreadable check shows "Advisories unavailable", "not updated since" or "N advisory messages couldn't be read", never an all-clear.
- **Provenance and bounds:** every status carries the time of the value it describes (a transport success alone reads "unknown"); every preview request has a deadline that covers the body and ends with the page.
- **Source health** in the header reads `/api/health` and lists degraded sources and failing feeds, with accepted exceptions marked.
- **Not in the brief yet, on purpose:** incidents (G1c), "This weekend" (event contract), a 101 verdict and surf (no source).

### Added — sections, type tokens and fragment navigation in the v2 preview (D1 PR 7)

- **Section primitive** (`Section.svelte`): a real disclosure button (`aria-expanded`, `aria-controls`) in an `<h2>`; a header that keeps its status line whether open or closed; a body mounted only while open.
- **Open state:** hash target > saved choice > viewport default (phone < 768 px closed; desktop open except Strava). Hash and jump-nav opens are never saved; only a toggle is.
- **Fragment navigation:** `#news`, `#cost`, `#strava`, … open their section, then focus it. A phone jump-nav (Top · Map · News · Sections) uses real anchors and clears the safe area.
- **Type tokens** (`v2-tokens.css`, `type-roles.ts`): body 15 px (16 on phones), metadata ≥ 12, brief values 20, section titles 17, line-height 1.45. An e2e classifies every visible text node and checks overflow at 50% and 150% UI scale.

### Added — dataset ownership for the v2 preview (D1 PR 6)

- **One owner per dataset** (`src/lib/dashboard/datasets.ts`, `v2-controller.ts`): gas, EV, coffee and fitness (the map stores) plus news load when the preview mounts, whatever sections are open, and refresh every 5 minutes (at most once a minute on tab focus). Concurrent requests share one fetch; a failed refresh keeps the last good data and reports it as retained.
- **News from the snapshot:** the preview reads `GET /api/news/snapshot` through the TV's snapshot loader, so it never runs the browser feed, article or geocode chain.
- **Strava is an inventory:** it loads only on an explicit browse, which nothing in D1 does.
- **Tests:** a request-count e2e (each essential once; no `/api/feeds|article|geocode`, no Strava); the layout and isolation e2e now key on legacy-only URLs, with a mutation run proving the isolation test still fails when legacy cleanup is removed.

### Added — per-source status and coverage for the v2 preview (D1 PR 5)

- **State model** (`src/lib/dashboard/source-status.ts`): the G0a states (ok, stale, unavailable, reference, unknown; pinned type-equal to the health evaluator) plus UI-only loading, evaluated against the clock on every read. `presentSection()` implements one precedence table: loading, ok, partial coverage (failing sources named), stale ("as of"), successful-empty, no town match, unavailable, unknown.
- **Adapters** (`source-adapters.ts`): snapshot sources (retained → stale as of its last success), snapshot reads, news-loader parts (the five adapters that swallow failures always read "unknown"), datasets (dated by their own payload's scrape time, never by our fetch time or a separate health read) and G0a JSON. A transport success alone reads "unknown".
- **Fixed:** `news.setItems()` no longer clears a category error or stamps "now"; `lastUpdated` is the caller's observation time. The snapshot loader reports each part's outcome (`onPartSettled`).

## 2026-09-29

### Changed — the TV reads the shared news snapshot (TV slice 3)

- **`GET /api/news/snapshot`.** Serves the producer's published snapshot, only after it passes the strict reader. The body is the public view: deduplicated stories plus each source's status. The producer's retention copies stay server-side. Failures are honest: `503 {status:"unavailable", reason:"missing"}` before the first publication, and `503 {status:"unknown", reason:"invalid"|"read-failed"|"not-configured"}` when a snapshot cannot be trusted or read. Browsers always revalidate (`Cache-Control: public, max-age=0, must-revalidate`). Only Vercel's CDN keeps a copy, for 60 s plus up to 240 s stale while revalidating (`Vercel-CDN-Cache-Control`). Failures are never cached. The dashboard will read the same endpoint at G2.
- **`/tv` no longer parses feeds, enriches articles or geocodes in the browser.** Before, every TV made about 22 feed-proxy, 60 `/api/article` and 16 `/api/geocode` calls every 3 minutes; now it makes none. Headlines come from the snapshot. 311 reports and earthquakes appear the moment their own requests return, instead of waiting for the news chain. That wait had put the county map's pins 4–24 s after load, sometimes after the first slide had moved on.
- **Outages stay visible and never blank the TV.** The header's DEGRADED badge counts:
  - an unavailable snapshot;
  - a snapshot not published, or with no successful fetch, for 45 minutes;
  - a feed that has failed with nothing retained;
  - a feed serving retained stories for more than 2 hours;
  - a failed 311 or earthquake read.
    The last good stories and pins stay on screen. A running TV never goes back to an older snapshot, even after the snapshot is recreated. Leaving `/tv` cancels its pending work, so nothing late lands in the dashboard.
- **Locations are exactly as precise as the evidence.** Feed coordinates become pins, and a town named in the title places a story at that town. Nothing is geocoded, because the TV's map shows 311, earthquake and fire pins, not news pins.

### Fixed — Weather alerts are Marin's, not San Francisco's

- **NWS alerts now query Marin's zones** (`NWS_ALERT_ZONES` in `src/lib/config/map.ts`): CAZ502 Marin Coastal Range, CAZ505 Coastal North Bay incl. Point Reyes, CAZ506 North Bay Interior Valleys, and county CAC041, sent as one comma-joined `zone` param. The old `NWS_ZONE = 'CAZ006'` was San Francisco's forecast zone, so the banner showed SF alerts as Marin's and missed Marin-only ones.

### Fixed — TV keeps your theme (D1 batch 1 final review)

- **`/tv` forces dark through a transient theme** (`settings.beginTransientTheme`): `mm_theme` is never written, so a saved light theme survives a TV visit however it ends (Escape, reload, closed tab, or TV's 6-hour reload).
- **Precise news pin locations** are no longer skipped when you leave the dashboard mid-refresh (for example `m` → TV): an aborted enrichment run releases its category at once.
- A drift test keeps the map's pin-inspection layer list in sync with the layers it binds.

### Added — Latest-reporting selector and county-wide rule (D1 PR 4)

- **County-wide rule** (`src/lib/config/county-scope.ts`, one constant, **confirmed by Stuart on 2026-09-29**). The existing Marin IJ `/tag/marin-county` and NBC Bay Area – Marin feeds are county-scoped: their items count as county-wide unless tagged to a specific town. All of Marin → the 5 newest dated items from any source. A town → up to 3 town items plus 2 county-wide, with county backfilling a short town and never unlocated items.
- **`selectLatestReporting`** (`src/lib/news/reporting.ts`, pure) is built on the news pipeline's shared dedupe, ordering and per-feed ids. It is rendered in a later release.
- **Fixed:** TV header and Pulse "24h" counts include only known publication times, and earthquake pins carry their time, so the tooltip shows an age.

### Fixed — TV scope and map pin inspection no longer overwrite the dashboard town (D1 PR 3)

- **`/tv` takes a transient county-wide scope** (`townFilter.beginTransientScope`): `mm_town` is never written while it is active and is restored on exit, whether you arrive by URL or by the `m` / `Escape` keys.
- **Map pin inspection opens the inspector only**, for pins, stations, incidents and fire zones alike. Clicking a town, "focus town", and the clear-filter chip remain the explicit ways to change the town.
- `townFilter` never throws when storage is denied.

### Added — v2 section preferences and the ⚙ menu (D1 PR 2)

- **Versioned v2 section prefs** under `mm_sections_v2`: validated entry by entry, idempotent, and independent of the v1 keys (left intact for rollback). Precedence: hash target > saved choice > viewport default (phone < 768px closed; desktop open except Strava).
- **⚙ menu in the preview header** with the retained controls: UI scale, default location, theme, camera visibility, and "Reset sections" (resets sections only).
- **Fixed:** a malformed `mm_panels` no longer discards the other saved settings; denied storage never throws; the saved theme (written as JSON) is read back; an unknown saved location falls back to the default.
- **Fixed (PR 1 follow-up):** one caller's abort no longer fails a shared deduplicated `ServiceClient` request; `fetchJson` reads the body under its deadline and owner signal; an owner abort is not logged as a fetch failure; `WeatherPanel` writes no state after it is destroyed.

### Added — dashboard redesign preview behind `?layout=v2` (D1 PR 1)

- **`/?layout=v2` renders the new dashboard shell; `/` is unchanged.** The layout is resolved in the server `load({ url })` and returned as page data, so SSR, hydration and client navigation agree.
- **Exactly one layout mounts.** The legacy page moved unchanged into `LegacyDashboard.svelte`; under v2 its loaders never start, and the server skips the legacy weather/quake prefetch.
- **Caching:** `/` keeps `s-maxage=120, stale-while-revalidate=300`; the v2 preview (HTML and `__data.json`) is `private, no-store`. `?layout=legacy` is reserved as the post-flip rollback override.
- **Isolation:** a destroyed legacy controller and legacy panels abort their timers and in-flight continuations, so no request starts and no shared store is written after the switch. `loadAllNews`, `loadStravaData`, the transit, NWS, tides and data-panel adapters, and `ServiceClient` retries accept an owner `AbortSignal`.

### Changed — Belvedere is city news, not a police log

- **Belvedere no longer appears in Police Logs.** Its "public safety" items were keyword-matched city news (an AlertMarin countywide test, a shelter-in-place preparedness event), not police calls. Both police producers (`src/lib/server/scrapers/police.ts` and `scripts/extract-police-logs.mjs`) drop the Belvedere fetch, and `police.shared.js` no longer exports a Belvedere URL. The bundled fallback `static/data/marin-police-logs.json` (served when Blob is unreadable) is stripped of its Belvedere items, and a test keeps it that way.
- **City of Belvedere is a civic news feed instead.** `https://cityofbelvedere.gov/feed/` validated on 2026-09-29 (200, `application/rss+xml`, 10 current items, no redirect) with both the police User-Agent and the news producer's. It is added to the civic feeds, so the producer's host allowlist and per-feed health cover it automatically. The producer now reads 19 feeds.
- **No public Belvedere call log located.** A bounded search on 2026-09-29 (city site search for police log / calls for service / blotter / police activity; the Police Transparency page, which links only a 2022 RIPA stop-data dashboard; four likely Nixle agency slugs) found none. That is not proof none exists.

### Fixed — Fairfax and Belvedere police logs are back

- Both town sites answer `403` to fetch's default User-Agent. Every Fairfax and Belvedere police request now sends one honest, identifying User-Agent, `MarinMonitor/2.0 (+https://marinmonitor.com; stuart@eastpeak.cc)`, never a browser impersonation. Belvedere moved from `www.cityofbelvedere.org` (now a 302) to `cityofbelvedere.gov`. The UA and both URLs live in `src/lib/config/police.shared.js`, shared by the Vercel scraper (`src/lib/server/scrapers/police.ts`, the writer `/api/health` observes) and the local `scripts/extract-police-logs.mjs`.
- `Fairfax Police` and `Belvedere Police` are removed from `KNOWN_SUBSOURCE_FAILURES` and `ACCEPTED_EXCEPTIONS`.
- Fairfax items still link to the weekly press-log PDF. Nothing extracts incidents from the PDF yet.

### Removed — two feeds behind a bot captcha

- **MMWD / Marin Water and Marin Humane are no longer read.** Both sites' SiteGround hosting answers every `/feed/` request with an `sgcaptcha` challenge page instead of RSS, so neither feed has delivered stories. The producer now reads 18 feeds. Neither blocked feed will be worked around.

### Added — shared news producer (TV slice 2)

- **One scheduled news producer.** `/api/cron/produce-news` runs every 15 minutes. It fetches the 22 configured RSS/Atom feeds and publishes a versioned, normalized snapshot to Vercel Blob (`news/v1/snapshot.json`). The TV (slice 3) and later the dashboard read it. Article enrichment and geocoding are not part of it.
- **Bounded and overlap-safe.** One 50s budget per run covers the lease, reads, fetches, publish and release, and every Blob call is cancellable. Only allowlisted https hosts are contacted, redirects are checked hop by hop, one 10s deadline covers each body, and bodies are capped at 2 MB. An expiring lease makes overlapping runs skip, and the snapshot is published by ETag compare-and-swap, so a late run can never overwrite newer data.
- **Per-source status and last-good retention.** Each feed is `ok`, `empty`, `retained` (serving its own last good items for up to 48h) or `failed`. `/api/health` validates the snapshot with one read: it is stale after 3h, and any feed with no successful fetch in 6h is listed.
- **Honest times.** Items without a trustworthy publication time are no longer stamped "now". They stay visible as **undated**, sort after dated items, and are excluded from recency counts. This covers missing, invalid, date-only and more-than-5-minutes-in-the-future dates. Atom `<updated>` no longer counts as published. Board of Supervisors agenda and minutes dates are meeting times, so they are kept as the meeting time and are no longer shown as news ages. NBC Bay Area's zone-less dates are read as Pacific time, and that assumption is recorded.
- **Story identity.** Items are identified per feed, so two feeds' GUID "42" never collide. A story that several feeds carry, such as one Marin IJ post in two tag feeds, still appears once, joined by its article URL.
- **Undated items are handled everywhere they appear.** The dashboard wire, map lists, map and pin tooltips, Signals, and the TV wire and map sidebar all sort undated items last, label them "undated", and keep them out of "fresh" and "nearby this week".
- **One parser for browser and server.** RSS/Atom parsing moved from the browser-only `DOMParser` to a shared `htmlparser2` pipeline (`src/lib/news/`) that rejects anything that is not well-formed XML. In the browser it is lazy-loaded. If its chunk fails to load (for example, just after a deploy), the page reloads once for that failure and deployment. It never reloads repeatedly; a TV keeps its 6-hour reload.

### Fixed — Grocery Basket priced live from Instacart again (G0)

- Instacart changed its product cards (`data-item-card` with an `<h3>` name, and the `item_list_item_items_…` test IDs are gone), so every run found 0 products and fell back to reference prices. New `scripts/shared/instacart-parse.mjs` parses the current markup: store from the section heading, name plus size with star ratings and review counts stripped (they had broken size matching), current price, and sale state per card. It is tested against a trimmed real page (`src/lib/server/__fixtures__/instacart-cross-retailer.html`: 40 cards, 4 stores), including a sign-posts block before the results (seen live on the eggs search) and after them.
- **Freshness invariant fixed:** the basket used to count as live whenever the first item was. It now needs at least half the items priced live (`hasLiveBasketCoverage`).
- Live run from the Mac: 12/12 items live, total $172.86 (reference $236.29).

### Fixed — Ikon Pass price read live again (G0)

- `ikonpass.com/en/shop-passes` now redirects to a JavaScript-only homepage, so every run silently used the hardcoded $1,399. The sync now renders `/en/shop-passes/ikon-pass` with Playwright and reads the adult season price ("From $1,449 USD (Age 23+)", 26/27) with a tested parser (`scripts/shared/ikon-pass.mjs`, a plausible range guard). A failed render keeps the previous prices and never advances the observation.
- Ikon publishes no child price (only a "save up to $100" child discount), so the child price is carried forward from the previous snapshot and marked `childPriceObserved: false`. The composite still counts the family-of-4 figure as live; that's flagged for the composite redesign.

### Changed — residential scrapers run on the Mac mini, not GitHub Actions (G0, Stuart approved 2026-09-29)

- **Why:** Toast, Instacart, PlumpJack, ikonpass.com and Thumbtack block datacenter IPs. On clean GitHub runners Cappuccino got 2–4 of 10 Toast menus while the same pages loaded fully from the Mac. The runners' route to the Mac's residential proxy had also broken three ways: the Tailscale authkey had expired, Tailscale on the Mac was stopped, and the proxy URL was unreachable.
- **Now:** coffee-index, cappuccino, grocery-basket, wine-index, ikon-pass and dog-walker run from launchd plists in `scripts/launchd/` (calendar-scheduled, local time; coffee and cappuccino run Monday 03:10/03:40, ahead of the Monday composite cron). They go through `scripts/sync-runner.sh`, which exports only `BLOB_READ_WRITE_TOKEN` from `.env.local`, never the scrape proxy, fails loudly if the token is missing, and kills a job hung for 20 min. Their six GitHub workflows are deleted, so each blob has exactly one writer; the keepalive now covers Camp, Rivian and itself.
- **First local runs (production writes):** Coffee 12/12 live menus, Cappuccino 10/10 live Toast, Wine live (134/64/81 wines), Dog Walker live (thumbtack.com).
- `src/lib/server/local-sync.test.ts` pins the wiring: plist ↔ runner ↔ manage-sync, calendar schedule, no RunAtLoad, blob token only, watchdog, the composite ordering, and no remaining GitHub workflow for any moved job. Docs: `docs/marin-indices.md`.

### Removed — two dead Marin IJ tag feeds (G0, Stuart approved 2026-09-29)

- `marinij.com/tag/breaking-news/feed/` (Local Wire) and `tag/emergency/feed/` (Crime & Safety) have returned 0 items all year, and the IJ has no populated equivalent. Both are retired; local news comes from `tag/marin-county`, and Crime & Safety keeps the IJ Crime and Fire feeds. With them gone, the only remaining known subsource failures are the Fairfax and Belvedere police 403s (accepted until 2026-12-31).

### Added — sync workflows stay enabled: weekly API keepalive (G0 repair 2)

- **All 8 GitHub sync workflows had been `disabled_inactivity`.** GitHub disables scheduled workflows in a public repo after 60 days without activity. They are re-enabled.
- New `.github/workflows/sync-keepalive.yml`: weekly (Wed 07:23 UTC) plus on demand, `permissions: actions: write` only, no checkout and no commits. It calls the enable API for every sync workflow and itself, tries all of them, and fails the run if any fails. It runs on the same scheduler it protects, so the independent backstop is external: stale data turns `/api/health` 503, and UptimeRobot alerts on that. (GitHub doesn't document that re-enabling resets the timer; this is the pattern established keepalive actions use.)
- `src/lib/server/sync-keepalive.test.ts` pins the cadence, the minimal permissions, error accumulation, and that the list matches every `sync-*.yml` on disk.

### Changed — /api/health: 200 means "no unaccepted failure" (G0 alerting contract)

- **The problem:** G0 leaves Strava stale by design (GS), and the Fairfax and Belvedere police sites answer 403. The strict evaluator returned 503 until every source was fixed, so an external uptime monitor could never see a recovery.
- **The fix does not relabel anything.** Each source keeps its real status, `status` stays `degraded`, and the summary counts are unchanged. A separate `acceptable` flag drives HTTP 200/503. An inventory `ACCEPTED_EXCEPTIONS` entry covers **one exact condition** for one named source or subsource (e.g. Strava _stale_; a missing or unreadable Strava blob still fails). Each entry has a reason, approver, approval time and an exact UTC expiry. Expired, future-approved or incomplete exceptions fail closed. Accepted items show `accepted` (sources) or `acceptedUntil` (subsources) in the public body.
- Accepted until 2026-12-31: Strava Segments + Strava Events (stale), Fairfax + Belvedere Police (403). `check-freshness` still returns 503 whenever anything is degraded, accepted or not.
- Tests: `health/exceptions.test.ts` (exact-condition coverage, expiry, malformed metadata, subsources, empty inventory) and `api/health/health-acceptance.test.ts` (200 while still reporting stale; 503 on an unaccepted failure mode; check-freshness still 503).

### Fixed — Marin IJ local news from a populated feed (G0)

- `marinij.com/tag/news/feed/` has been empty all year. The "Marin Independent Journal" local feed now reads `tag/marin-county/feed/`, the IJ's live Marin tag (10 items; newest 2026-09-28). The IJ's non-tag feeds answer 403 to bots. Removed from the known subsource failures.

### Fixed — federal (NIFC) fires back on the fire map (G0)

- **The NIFC query had been rejected since ArcGIS renamed `attr_POOState` to `POOState`.** ArcGIS answers a bad query with HTTP 200 plus an `error` body, which the adapter read as "no fires". An error body now fails loudly (logged), and the adapter reads the current schema: the point comes from `geometry` (`POOLatitude/POOLongitude` are gone), and acres from `IncidentSize`/`DiscoveryAcres` (`DailyAcres` is gone).
- **The query was also wrong in shape.** It asked for the first 50 year-to-date California incidents and filtered for Marin afterwards; Marin fires were rarely among those 50, and the YearToDate layer almost never marks a fire out. It now queries WFIGS **Current** (active) incidents inside a Marin envelope (~80 km) in WGS84. Live check: 1 active incident near Marin (CHILENO, Marin County, 341 ac).
- NIFC is removed from the health inventory's known subsource failures.

### Fixed — Marin Lately column reads the Substack feed (G0 repair 5b)

- `marinlately.com/feed/` redirected to a dead sfcurrently.com page. The satire column now reads `https://marinlately.substack.com/feed` (200, 10 items). The newest post is from January, so it shows as dated satire, which is honest. The feed proxy allowlist follows the config automatically; the article allowlist is untouched because satire is never enriched.
- Marin Lately is removed from the health inventory's known subsource failures.
- Test: `src/routes/api/feeds/feeds.test.ts` (configured URL; the proxy accepts the Substack feed and rejects the retired one).

### Fixed — Driveway reads the newest DMV release; no more hardcoded 2024 data (G0 repair 5)

- **The DMV retired the fixed resource ID the scraper queried**, and renamed the columns it used (`Zip Code`→`ZIP Code`, `Fuel Type`→`Fuel`, `Number of Vehicles`→`Vehicles`). Every run silently served hardcoded 2024 numbers, with no observation time.
- **Now:** the newest yearly release is resolved through CKAN `package_show` (named `1/1/YYYY …`; the newest must be queryable, with no quiet fallback to last year). The run checks the columns the SQL reads, requires a UUID resource ID before it goes into SQL, and requires a non-empty make aggregate and a Marin total within 15% of the 2024 reference (210,586). Any failure throws: the cron returns 500 and the last-good blob stays. The hardcoded fallback is gone.
- **Fuel labels:** the current release says `Battery Electric`/`Plug-in Hybrid` (the `(BEV)`/`(PHEV)` suffixes are gone), and both forms are mapped, so EVs are no longer lumped into "other".
- Live check (read-only): the 1/1/2026 release has 210,427 Marin vehicles; Toyota 27,246, Honda 11,475, Tesla 8,795; 20,405 battery-electric.
- Tests: `scrapers/driveway.test.ts` (newest-release selection, no older fallback, UUID guard, column names, tolerance, fuel labels, empty makes, CKAN down) and `sync-driveway.test.ts` (failure writes nothing).

### Fixed — EV Charging back on NREL's new host; fails closed on partial scrapes (G0 repair 4)

- **`developer.nrel.gov` no longer resolves.** The API moved to `developer.nlr.gov`, and existing keys carry over. The EV cron had been failing every day since the move.
- **A partial scrape is no longer published as fresh.** The four county tiles overlap for coverage, but the scraper published whatever tiles succeeded. Now any failed, malformed, empty or truncated tile, or zero Marin stations, throws; the cron returns 500 and leaves the last-good blob untouched. Tiles request `limit=all`: the old `limit=200` silently truncated San Rafael (222 stations within 10 mi).
- Tests: `ev-charging.scrape.test.ts` (NLR host + `limit=all`, fresh stamp only for a complete scrape; failed, malformed, empty and truncated tiles throw) and `sync-ev-charging.test.ts` (a failure writes nothing and returns 500; success writes and reports the station count).

### Fixed — Wine Index fails closed instead of publishing empty scrapes (G0 repair 3)

- **A blocked or partial PlumpJack scrape no longer overwrites the blob.** Before, a failed page logged an error and `break`, and the run still wrote whatever it had with a fresh `lastSuccessfulScrapeAt`. Now any failed page (HTTP error, dead proxy, timeout, a non-JSON bot wall), or an empty index category, aborts the run before the write. The last good data and its real observation time stay put, and `/api/health` keeps reporting it stale.
- New `scripts/shared/shopify-collection.mjs` (`fetchShopifyCollection`, `requireNonEmpty`), tested in `src/lib/server/shopify-collection.test.ts`. `proxyFetch` now forwards the caller's abort signal, so timeouts fire through the proxy.

### Changed — the scrape proxy never silently goes direct (G0)

- **`scripts/shared/proxy-fetch.mjs`: a configured proxy is now required.** With `SCRAPE_PROXY_URL` + `SCRAPE_PROXY_SECRET` set, an unreachable or rejecting proxy throws. Before, it quietly fell back to a direct fetch from the GitHub runner, which the target sites block, so a dead proxy looked like a thin but successful scrape. Setting only one of the two variables throws; setting neither fetches direct (local runs).
- **Run ↔ proxy correlation.** Every proxied call sends an `X-Request-Id` UUID and logs `[proxy <id>] <host> -> <upstream status>` in the Actions log. The Mac proxy logs the same ID with host, status and bytes.
- Tests: `src/lib/server/proxy-fetch.test.ts` (envelope passthrough, request ID, success log, unreachable, rejected, half-configured, unconfigured).

### Fixed — scrapers launch Chromium again: one Playwright version (G0 repair 1)

- **Coffee, Cappuccino and Grocery syncs died at browser launch.** Two Playwright versions were in the tree: a direct `playwright@1.61` beside `@playwright/test@1.57`'s own copy. The workflows' `npx playwright install` fetched one browser build and the scripts launched the other.
- Dropped the direct dep. `@playwright/test@^1.61` (resolves 1.63.0) is now the only Playwright, and the three scrapers import `chromium` from it. The workflows install it with `--with-deps chromium`, so a clean runner has the system libraries.
- `src/lib/server/playwright-pin.test.ts` pins it: exactly one resolved `playwright`/`playwright-core` in the lockfile, no direct dep, no `playwright` imports (static or dynamic) in `scripts/`, and every browser-launching sync workflow installs from the pinned package.

## 2026-09-28

### Fixed — fire-cam frames painted the moment a camera slide appears (TV slice 1b)

- **TV: ALERTCalifornia fire-cam tiles are painted as soon as the slide appears.** Before, they sat blank for about 2s.
- **Why they were blank.** Those frames are ~276 KB with `cache-control: max-age=10`, and the warm-up runs ~19s before the slide. Rendering a fresh `<img src>` made Chromium refetch the expired frame even though a decoded copy was still in memory, and keeping the preloaded `Image` object alive was not enough on its own (checked empirically).
- **Fix: mount the decoded element itself.** `preloadImage` now resolves the decoded `HTMLImageElement`. The per-camera last-good cache keeps that element: one per camera, replaced when a newer frame arrives. `TvCameraTile` mounts it directly, so a remount cannot trigger a fetch.
- **New e2e fixture.** It serves a 300 KB frame with `max-age=10` and waits 12s between warm-up and slide. It asserts that every live tile is painted 0.5s after the slide appears and that each frame was fetched exactly once. It fails on the previous build.
- `.prettierignore` and `knip.jsonc` now skip `.superpowers/`, the agent scratch directory (already gitignored).

### Fixed — TV camera tiles no longer flash "Camera offline" (TV slice 1)

- **TV: camera tiles no longer flash 'Camera offline' while loading.** They show the last good frame (marked stale if old), recover automatically, and the next camera slide is preloaded so it appears ready.
- **Ready means decoded.** A new `TvCameraTile` swaps in a frame only after it has loaded _and_ decoded (`image-preload.ts`, 8s timeout, late loads ignored). Preload and display use the same bucketed `?t=` URL (`camera-frame.ts`).
- **Failures degrade instead of blanking.** A tile with a previous frame keeps it and shows "Last frame N min ago" once it's older than max(60s, 3 refresh intervals). "Camera offline" appears only after 2 consecutive failures with no frame ever shown, counted across carousel visits so a dead slow-refresh camera still surfaces as offline. The old error handler set `display:none` forever, so a camera that recovered never came back; recovery is now automatic.
- **Next-slide warm-up.** While any slide is showing, the wallboard preloads the next camera slide's frames (image cams only, max 8) into a small per-camera last-good cache. The tiles mount already showing a frame.
- Windy iframe cameras render exactly as before.

### Fixed — one truthful health evaluator (G0a)

- **`/api/health` now tells the truth and says so with its status code.** It returns **200 only when every source is ok or declared reference data**, and **503** otherwise. Before this it always returned 200, even while 7 of 15 sources were months stale. Generic uptime monitors can now see degradation.
- **One evaluator, one inventory.** New `src/lib/server/health/`:
  - a frozen 20-source inventory: the 15 existing sources plus the 5 composite inputs that were never monitored (Cappuccino, Camp Prices, Dog Walker, Ikon Pass, Rivian Lease);
  - a declared list of known subsource failures (Fairfax/Belvedere police 403s, empty Marin IJ news/breaking/emergency feeds, dead Marin Lately, NIFC `attr_POOState` rename), each with a disposition;
  - a pure, clock-injected `evaluate()` giving per-source `ok | stale | unavailable | reference | unknown`.
    `/api/health` and the daily `check-freshness` cron both use it, and a test proves they classify identically.
- **Timestamps that can't be vouched for are `unknown`, never `ok`:** missing, malformed or impossible (`2026-02-30`), non-ISO, or in the future. Previously NaN ages and future timestamps passed as ok. An explicit `lastSuccessfulScrapeAt`/`lastLiveScrapeAt: null` no longer falls back to `lastUpdated`.
- **`check-freshness` returns 503 when anything is degraded** (was 207, which Vercel treats as success) and still rejects unauthorized calls.
- **Public diagnostics trimmed:** blob keys, subsource problem detail and repair notes now appear only for authenticated (cron-secret) callers.
- **No sources were repaired.** Coffee, Grocery, Wine, EV Charging, both Strava sources, Driveway (hardcoded 2024 fallback) and the stalled composite inputs stay visibly degraded until G0.

## 2026-07-03

### Internal — dead-code gate (knip), no behavior change

- Wired **knip** into `verify` (and therefore CI): dead FILES and unused/missing **dependencies** now fail the gate, so new dead code can't accumulate silently. Config (`knip.jsonc`) gates the low-false-positive classes only; export/type checks are deferred to a later triage. Three false-positive devDependencies (`@typescript-eslint/*` peer-deps, `@types/d3` ambient types) and three false-positive files (two `.d.mts` type companions, the LaunchAgent-invoked `scrape-proxy.mjs`) are baselined with inline notes. Gate proven (exits non-zero on a planted dead file).
- **Removed 4 confirmed-dead files** (Codex-verified zero real importers across 413 files): `src/lib/server/sanity.ts` (unwired price-sanity-bounds helper — never called), and three unused re-export barrels `src/lib/{analysis,components,services}/index.ts` (all imports use direct subpaths). 1417 unit tests green, build green.

## 2026-06-27

### Security — code-scanning (CodeQL)

- **Stack-trace exposure hardening (14 cron sync endpoints + `run-all`).** Every `/api/cron/sync-*` endpoint and the `run-all` aggregator returned the raw internal error string (`err.message`) in their JSON response on failure. Added a shared `cronErrorResponse()` helper that logs the full error (with stack) server-side but returns a generic `{ ok: false, error: 'sync failed' }` — internal details (DB hosts, upstream URLs, stack info) are never echoed to callers. Clears 14 CodeQL `js/stack-trace-exposure` alerts. TDD + Codex-reviewed; 1400 unit tests green, svelte-check clean.
- **Unified HTML→text sanitization (`src/lib/server/html-text.js`).** The scrapers had six duplicated regex copies of `stripHtml`/`decodeEntities`/`cleanHtml`/`stripTags` that CodeQL flagged for `bad-tag-filter` (×3), `double-escaping` (×6), and `incomplete-multi-character-sanitization` (×2) — bypassable tag regexes and `&amp;→&` then `&lt;→<` double-decoding. Replaced with one DOM-based `stripHtml` (linkedom parse → element-boundary whitespace, script/style removal, curly-quote normalization) + a single-pass `decodeEntities` (case-insensitive, code-point-range-guarded). The server scrapers and the standalone `.mjs` sync scripts now share it; `rss.ts` (client-side) uses an equivalent browser-DOM version. Output was already auto-escaped (not exploitable) — this is a robustness/correctness fix. Behaviour preserved (existing scraper tests green); TDD (17 cases) + Codex-reviewed (which caught block-boundary collapse, a `</body>`-truncation edge, and a `RangeError` on malformed numeric entities — all fixed). Clears 11 CodeQL alerts. 1417 unit tests green, svelte-check 0/0.

## 2026-06-21

### Fixed

- The UI now actually loads its intended **Outfit** typeface. `@fontsource-variable/outfit` was installed and referenced in the CSS (`font-family: 'Outfit Variable'`) but never imported, so the app silently rendered in the system fallback font. Added the import to the root layout; verified the font loads (`document.fonts.check` → true).

### Internal — code-quality glow-up (phases 0–5, no behavior change)

- ESLint now ignores `.vercel/` build output; combined with type-error fixes and lint triage, `svelte-check` and `eslint` are both clean (0 errors) where lint previously reported 4,687 problems (4,626 of them noise from the unignored build dir).
- Repo-wide Prettier formatting pass (220 files). `static/data/` (generated) and `tests/fixtures/` (whitespace-sensitive parser fixtures) are now excluded from formatting.
- Fixed all 10 `svelte-check` type errors (test-file typing) and all 61 real ESLint issues; 1,170 unit tests green before and after.
- Added Vitest coverage tooling (`@vitest/coverage-v8`, `npm run coverage`).
- Removed dead code: two unused scripts (`build-boundaries`, `extract-housing` — its logic lives in the housing cron), the never-mounted `AgentationWidget` dev component + its orphaned `agentation`/`react-dom` deps; dropped dead exports/consts in map/nws/chart; declared the previously-undeclared `@eslint/js` + `playwright` deps. (Codex-verified — no production-reachable code removed.)
- Decomposed the two oversized data scripts (`extract-activity-feeds.mjs` 1,455→1,314; `strava-explore.mjs` 1,305→1,072) — extracted 35 pure helpers into tested ES modules (`scripts/lib/*-helpers.mjs`), adding **+155 unit tests** to scripts that previously had 0% coverage. No behavior change.
- Decomposed `MapDataLayer.svelte` (1,130→901) — extracted 16 pure feature-builder functions into `map-data.ts` with **+69 unit tests**; runtime-verified the map still renders every layer (news/activity/housing/311/gas/EV/coffee/fitness/earthquakes/segments/traffic). No reactive code touched.
- **Locked in deterministic gates:** a `verify` script (typecheck + lint + format-check + unit tests), a CI workflow (`.github/workflows/ci.yml` — `npm ci → verify → build` on push/PR, fails on violations), and a tiered `husky` + `lint-staged` pre-commit (format/lint staged files only). Test count over the whole glow-up: **1,170 → 1,394 green**.

---

## 2026-05-03

### Fixed

- `/api/data/*` blob-backed endpoints now return `503` with a structured error body (`{ error, message, timestamp, blobKey, upstreamStatus? }`) when the blob is missing, env is unset, or upstream fetch fails. Previously returned `200 OK` with an empty payload, so a misconfigured deployment looked like "Marin has no data" instead of an operational outage. 16 endpoints migrated to a single `serveBlobJson` / `tryReadBlobText` helper.
- Freshness pipeline no longer substitutes blob upload time for missing scrape metadata on live-scrape datasets. When `preferContent: true` and content lacks `lastSuccessfulScrapeAt` (or the fetch fails), `lastUpdated` is now `null` — so `/api/health` and the daily check-freshness cron correctly report stale data as stale instead of healthy.
- TV wallboard refresh cycle no longer reports success when individual fetchers fail. New `createDataFetcherWithStatus` factory returns tagged `{ ok, data } | { ok, error, fallback }` results; the wallboard collects per-source failures, preserves previous good data on error (instead of blanking with fallback), and passes the error list to `refresh.endRefresh()` so refresh history correctly shows degraded status during upstream outages.
- Weather no longer shows the wrong town on hydration. Server bootstrap is hardcoded to Central Marin coordinates; previously a user whose persisted town was Novato/Sausalito/etc. would see Central Marin weather indefinitely until something else triggered a live fetch. Bootstrap now declares its `locationId`, and the client fetches the user's actual location's weather on mount when the IDs differ.
- Weather fetch race fixed. Quick town switches or visibility-change + auto-refresh overlaps could let a slow earlier `fetchWeather()` overwrite a faster later one. Each call now captures a monotonic request ID via the new `createRequestGuard()` helper and only commits its result if it's still the latest.
- Auto-refresh toggle/interval changes now reschedule against the post-update store state. `toggleAutoRefresh(callback)` and `setAutoRefreshInterval(ms, callback)` previously called `setupAutoRefresh()` from inside the `update()` closure, which observed the pre-update state — so toggling off could leave the timer running and changing the interval could keep the old cadence.
- Main dashboard refresh now has an in-flight guard. Visibility-change + auto-refresh + manual refresh could overlap and double-fetch the same sources; only one cycle runs at a time now (matches TV mode's existing behavior).
- `staleWhileRevalidate` no longer defeats the circuit breaker. Background revalidation is now gated on `breaker.canRequest()`; when an upstream is down, stale-cache hits stop firing fresh retrying requests behind the scenes.
- `CircuitBreaker.getState()` is now a pure read. It previously called `canRequest()` internally, which transitions OPEN→HALF_OPEN once the reset timeout has elapsed — so a monitoring/debug read could silently consume the recovery window. Split into `peekCanRequest()` (status reads) and `canRequest()` (the real gate); only the latter still mutates.
- `CacheManager.invalidate(pattern)` actually honors the pattern now. Storage entries are written with their `originalKey` embedded; invalidation parses each entry and only removes those whose key matches. Previously the storage path ignored the pattern and flushed every prefix-matching entry — what looked like a targeted clear was a full cache wipe.
- 311 (SeeClickFix) feed no longer pins stale incidents indefinitely on outage. `fetchSeeClickFixIssues` now throws on fetch failure (was silently returning `[]`); the orchestrator uses `Promise.allSettled` status to decide between "rewrite the store with fresh data" (success — including legitimate empty) and "preserve last known good" (failure). Previously a fetch failure left whatever was in the 311 panel visible forever, looking like fresh civic reports during an upstream outage.
- `fetchSeeClickFixIssues` also throws on malformed response shape (was silently returning `[]` when the upstream JSON had no `issues` array). Schema breakage now goes through the failure-preservation path instead of clearing the 311 store as if it were a quiet day.
- 311 blob is now monitored by `/api/health` and the daily check-freshness cron (was missing from `DATA_SOURCES`).
- 311 direct-rewrite path no longer clobbers a per-category RSS merge. If `fetchAllFeeds` ever returns a `'311'` category result, the per-category loop's `setItems('311', ...)` is now respected; the direct rewrite skips. Latent today (no live RSS source for 311) but the tripwire is removed.
- `/api/data/strava-segments` and `/api/data/strava-leaderboard/[id]` migrated to the shared `tryReadBlobText` / `serveBlobJson` helpers. Strava segment endpoint now returns `503` only when both the live blob AND the local committed catalog are unavailable; the local-fallback path emits `X-Data-Source: local-fallback` to match the activity/housing/police-logs contract.
- Dashboard panels (Composite, Grocery Basket, Wine Index, Fitness, School Tuition, Driveway, Gas Prices, Housing) now use the `*WithStatus` fetchers instead of the silent ones. When `/api/data/*` returns `503`, panels render an explicit "Live data unavailable" message via `Panel.error` instead of pretending the endpoint succeeded with empty data. Housing panel error now reflects housing-data fetch failures instead of housing-news RSS errors.
- `loadAllNews()` now returns `errors: string[]` of per-adapter failures (RSS feeds, NPS, USGS, transit, sheriff, police, supplemental activity, SeeClickFix, plus per-feed RSS errors). Both `+page.svelte` and `TvWallboard.svelte` propagate these into `refresh.endRefresh(errors)`, so refresh history correctly records degraded vs. clean cycles. Previously the dashboard's `handleRefresh` recorded "success" regardless of upstream state.
- TV wallboard surfaces a `DEGRADED · N` badge in the header when the most recent refresh had errors. The chyron's "All clear in Marin County" fallback is suppressed during degraded refreshes; an explicit "Data refresh degraded — N source(s) failed" item is shown instead so operators don't read silent-stale data as live.
- `FetchResult<T>` now carries a `dataSource: 'live' | 'static-fallback' | 'local-fallback' | 'legacy'` field on success, parsed from the server's `X-Data-Source` response header. Coffee's legacy-blob fallback now emits the header. Status-aware panels can render an explicit "fallback data" indicator (HousingPanel does this; others can opt in). Previously the server signaled fallback-source provenance but the client discarded it, so degraded data silently looked healthy.
- `CircuitBreaker.canRequest()` now atomically reserves a half-open probe slot when it admits a request. Previously `canRequest()` only reported "would be allowed"; the slot was incremented later via `trackHalfOpenRequest()`, so concurrent callers could each see "available" and bypass the recovery limit, all probing a failing upstream simultaneously. `trackHalfOpenRequest()` is now a deprecated no-op.
- ServiceClient's retry loop bails out on the first failure when the breaker is HALF_OPEN. Previously a probe with `retries: 2` could hit a still-failing upstream three times before the breaker re-opened, defeating the breaker exactly when the service was most fragile. Half-open probes are now strictly single-attempt; subsequent retries only run once the breaker is fully closed.

---

## 2026-04-05

### Fixed

- Signal deck no longer causes horizontal page scroll on iPhone. Root cause was bare `1fr` grid tracks with implicit `auto` minimum; fixed to `minmax(0, 1fr)` at narrow breakpoints.
- Signals panel stats bar collapses to a 2×2 grid on phone (was 4 cramped columns).
- Environment panel stat cards stack vertically and stream table narrows to 2 columns on phone.
- Map + camera sidebar now stacks to single column at 800px (was 1320px) — no more unusable 78px camera sliver on tablets/phones.
- Main content padding smoothed across breakpoints: 1.5rem → 0.75rem (≤768px) → 0.375rem (≤480px). Was a harsh cliff from 1.5rem to 0.25rem.
- Header tightened at 400px: smaller logo, compact buttons, reduced padding for narrow phones.
- Tip banner wraps gracefully on mobile with reduced padding and font size.

### Added

- TV mode: swipe left/right to navigate between screens on mobile. Map panning and sidebar scrolling are unaffected.

---

## 2026-04-01

### Added

- **TV Mode Refresh v2** — 20-screen carousel (up from 13) with hero/anchor/card screen types
  - Cost of Being Marin hero screen with The Marin Number ($21,110/mo)
  - 311 Photo Wall ("Wall of Grievances") — scrolling grid of complaint photos
  - Daily Life card (cappuccino + grocery basket + gas prices)
  - Lifestyle card (wine index + fitness drop-in prices)
  - Structural Marin card (private school tuition + housing)
  - Marin Driveway card (vehicle registration, EV share, fuel breakdown)
  - Conditions card (weather + AQI + tides)
  - Outdoors card (surf report + Hero Dirt tracker + stream gauges)
- **Map overlays** — Each TV map region shows contextual data pins (311 photos, coffee/gas prices, fitness studios)
- **IDX chyron category** — Index data headlines scroll in the ticker (cappuccino prices, grocery basket, Marin Number, etc.)

### Changed

- **Scroll system replaced** — CSS animation (TvAutoScroll) replaced with JS rAF-driven scroll (TvScroller) that preserves position across carousel cycles
- **Variable screen durations** — Hero screens (22s), anchor screens (18-20s), card screens (12s), map screens (15s)
- **Conditions screen split** — Old grab-bag environmental screen split into focused Conditions + Outdoors cards

---

## 2026-03-31

### Added

- **Strava County-Wide Catalog** — Full Marin segment discovery (2,225 total). Curated 100 ride / 100 run shortlist with override files. Daily leaderboard cron tracks the curated 200.
- **Coffee Index weekly cron** — Automated the coffee price scraper to run weekly (was manual-only, so live sources showed 0/11).

### Changed

- **TV Leaderboards** — Show 20 segments per column (up from 8) with randomized selection. Segments with recent KOM/QOM changes pinned to top. Different smattering each page load.
- **Panel defaults** — "Everything" preset and default panel order now derived from panel registry instead of stale hand-maintained list. New panels (composite, leaderboards, cappuccino, grocery, wine, tuition, fitness, driveway) automatically included. Older localStorage normalized to include newly added panels.

---

## 2026-03-29

### Added

- **Cappuccino Index** — Gas-prices-style map showing cappuccino prices at 12 Marin coffee shops (Equator, Marin Coffee Roasters, Firehouse, Fox & Kit, Philz, Red Whale). Map pins with toggle. Weekly cron.
- **The Bare Essentials** — 12-item Marin grocery basket tracked via Instacart (Vital Farms eggs, Marin Kombucha, Silver Oak cab, collagen, manuka honey, etc.). Weekly cron with sparkline trend.
- **Wine Index** — Premium wine market tracker powered by PlumpJack Shopify API. Category medians for Napa/Sonoma Cab, Burgundy, and Champagne. Staff picks and allocated wines listings. Weekly cron.
- **Marin Private School Tuition Index** — 7 schools across 4 tiers (preschool through high school), shown as percentage of median household income. Cumulative K-12 cost: $698,998. Monthly cron.
- **Fitness Drop-in Index** — Drop-in class prices at 16 studios across yoga ($27-39), pilates ($45-55), cycling ($39), CrossFit ($25), and HIIT ($29). Map pins color-coded by type. Monthly cron.
- **The Marin Driveway** — Vehicle registration data from California DMV. Top makes (Toyota #1, Tesla #3), fuel type breakdown (8.3% EV), fun stats (68 hydrogen fuel cells, 12 Lucids). Monthly cron.
- **Cost of Being Marin** — Composite index with tiered sub-scores (Daily Life, Lifestyle, Housing, Structural). The Marin Number: $21,110/mo ($253,320/yr). Weekly cron.
- **Coffee and Fitness map layers** with toggle controls.

---

## 2026-03-28

### Added

- **Strava KOM Tracker** — Curated Marin cycling and trail segment catalog with live leaderboards, map overlays, TV mode cards, and chyron-ready event data. Expanded seed coverage to 17 cycling segments and 9 running/trail segments across Headlands, Tam, West Marin, and Tennessee Valley classics.

### Fixed

- **Leaderboard panel rendering** — tied Strava ranks no longer break the segment table render, and collapsed cards now surface record holders and segment stats without needing expansion.
- **Strava parser cleanup** — stripped inline HTML from scraped leaderboard times, decoded athlete names safely, and hardened the cron path so deleted/unavailable segments write an empty placeholder while transient Strava failures preserve existing data.
- **TV leaderboard badges** — climb-category labels now match Strava’s category scale and zero-distance placeholders are hidden until real segment stats are available.

---

## 2026-03-24

### Added

- **TV Mode (`/tv`)** — Full-screen, hands-free dashboard for wall-mounted TVs. Six auto-rotating carousel screens (Map & Conditions, News Wire, Safety & Alerts, Camera Wall, Environment, Outdoors & Tides) with 20-second rotation and fade transitions. Scrolling chyron ticker merges 8 data categories. Keyboard shortcuts (arrows, space, R, Escape, F). Cursor auto-hides. Silent 3-minute data refresh. Forced dark theme.
- **Camera Wall screen** — Full-screen grid of all 24 Marin cameras (traffic, scenic, fire) in TV carousel.
- **Environment screen** — Air quality, UV index, active fires, and stream gauges in TV carousel.
- **TV button in header** — Monitor icon in main dashboard header links to `/tv`. Press `M` on the main dashboard to enter TV mode.
- **Pulse stats in TV header** — Temperature, story count, and alert count shown persistently in the TV mode header bar.
- **Map sub-carousel** — Map screen auto-flies through 5 regional views (county overview, Southern Marin, Central Marin, Novato & North, West Marin) every 6 seconds with smooth MapLibre flyTo transitions. Location label overlay shows current region.

### Changed

- **TV Mode v2** — Redesigned carousel: 8 purpose-built screens replacing 6. Geographic camera clusters (Tam & Coast, Central & Highway, West & North) replace generic camera wall. Contextual map sidebar shows per-region weather and nearby stories during flyby. Full-width safety feed with vertical auto-scroll. Combined Conditions & Trails screen with Hero Dirt (single instance). Outdoors & Community two-column headline screen. No panel duplication. Current temperature now reads hourly forecast (actual temp, not daytime high). Military time throughout.
- **Venue GPS coordinates** — Corrected 25 of 30 hardcoded venue coordinates in activity scraper. Worst offenders: Osher Marin JCC (~5km off), Marin Symphony (~3.6km), The Junction (~3.4km), Albert Park/Pacifics (~1.5km).

---

## 2026-03-04

### Added

- **Featured listings & events** — Config-driven newspaper-style classified ads. Inline wire column cards with amber dashed border and horizontal banners between signal deck and news area. Click tracking via Vercel Analytics + persistent Blob counter. Schedule ads by date range, target specific news categories, set priority for weighted selection.

---

## 2026-03-03

### Added

- **Airport Status panel** — SFO and OAK operational status, FAA delay/ground stop alerts, METAR weather conditions (flight category, visibility, ceiling, wind, fog risk), TAF forecast notes for IFR/LIFR periods, and TSA wait times (graceful degradation while API is down).
- **Airport map pins** — SFO, OAK, STS (Santa Rosa), and SJC (San José) shown as color-coded dots on the map (green=on-time, amber=delays, orange=ground-delay, red=ground-stop). Click for status details and aviation weather summary.
- **Santa Rosa Airport (STS)** — Charles M. Schulz–Sonoma County Airport added to airport status panel and map pins with METAR/TAF weather, FAA delays, and TSA wait times.
- **San José Airport (SJC)** — Norman Y. Mineta San José International Airport added to airport status panel and map pins.
- **Pathogen Watch panel** — wastewater pathogen surveillance using CDPH Cal-SuWers CKAN API. Tracks SARS-CoV-2, Influenza A, RSV, and Norovirus across 5 Marin sewersheds with population-weighted county-wide trends, sparklines, and status chips.

### Fixed

- **Settings modal opacity** — modal background changed from transparent `var(--surface)` to near-opaque `rgba(20, 25, 40, 0.95)` so map no longer bleeds through. Added backdrop blur.
- **Gas prices chart x-axis** — history now sorted ascending by timestamp so dates read left-to-right chronologically (was newest-first from API).
- **Pacifics schedule titles** — regex anchored to `imagearray` element boundary to prevent capturing JavaScript URLs into opponent names. Also extracts per-game event URLs for direct linking.

---

## 2026-03-02

### Added

- **Town filter UX overhaul** — larger picker dropdown grouped by geographic region, town filter banner below header, town-aware weather/conditions/gas/EV panels that re-fetch for selected town's coordinates.

### Changed

- Synced panel presets and default order with current panel set.
- Security hardening: CSP nonces, ServiceClient wired into API adapters, deduplicated fire fetch.
- Code quality pass: dead code removal, null safety, consistent patterns.

---

## 2026-03-01

### Added

- **Town boundary highlights** — selecting a town shows its boundary on the map with deep filtering across map markers and panels.
- **Town picker by region** — dropdown grouped into Southern Marin, Central Marin, San Rafael, Novato, San Geronimo Valley, West Marin.
- Town-specific weather using actual town coordinates instead of nearest preset location.

### Changed

- Environment panel moved from right column to middle column under Tides.
- TownPicker dropdown made fully opaque.
- Removed EV station count trend chart (not useful with sparse data).
- Map goes full-width when camera views are expanded.

### Fixed

- Map town chip now clears townFilter store in sync with header picker.
- EV charging stations filtered to show only Marin County.

---

## 2026-02-28

### Added

- **Hide/show toggle for cameras** sidebar.
- **Global town picker** for per-town filtering across the entire dashboard.
- Changelog section added to Community panel (in-app).

---

## 2026-02-27

### Added

- **EV Charging panel** — station locations, connector types, networks, and charging levels with map layer and Vercel cron data pipeline.
- **17 ALERTCalifornia fire cameras** with expandable camera grid. Expand toggle moved to panel header.

### Fixed

- Gas prices cron: add `allowOverwrite` to Vercel Blob put.
- Blob data endpoints: pass auth token for private blob downloads.

---

## 2026-02-26

### Added

- **Gas Prices panel** — station-level fuel prices across Marin County with map layer, price trend chart, cheapest/priciest station lists, and Vercel cron sync.

### Changed

- Swapped Environment and Coastal Conditions (Tides) panel positions for better layout flow.

---

## 2026-02-25

### Added

- **Hero Dirt Tracker V2** — soil-moisture-first model using Open-Meteo observed weather and NWS hourly forecast. Score ring, moisture spectrum bar, trail intel rows, and drying rate.

### Fixed

- CSP blocking Google Fonts and Open-Meteo API.

---

## 2026-02-24

### Added

- Footer, Community panel, feedback modal, and Vercel Analytics.
- OG meta tags for link previews.

---

## 2026-02-23

### Added

- **Vercel-native data ingestion pipeline** — cron endpoints for housing, activity, and police log sync via Vercel Blob storage.

### Fixed

- Blob access (private store) and housing scraper (stream parsing).
- Error handling added to cron endpoints.

---

## 2026-02-22

### Added

- **Full dashboard build** — data adapters, panels, map, cameras, weather, crime & safety, activity verticals, tides, air quality, earthquakes, fire incidents, transit alerts, NPS alerts.
- Server-side API key management, CSP headers, fetch timeouts.

### Fixed

- CSP connect-src for CalFire, Open-Meteo, Socrata domains.
- Transit allowlist, CalFire CORS proxy, article proxy domain handling.
- Geocode 429 rate limiting, stale Mapbox tile cache.
- CSP for ABC7 camera images and Windy webcam iframes.

---

## 2026-02-20

### Added

- Initial scaffold from situation-monitor patterns, rewritten for Marin County.

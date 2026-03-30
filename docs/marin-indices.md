# Marin Indices

Date: 2026-03-28

## Goal

Add a family of local, legible, slightly dry Marin-specific indices that say something useful about county mood without pretending to be official economics.

This should not be framed as CPI.

The better framing is:

- local basket
- luxury pulse
- sentiment
- bull / bear score

## Product Angle

Marin Monitor is stronger when it feels observant and specific, not generic.

That points toward a small set of indices that are:

- obviously Marin-coded
- easy to explain in one sentence
- updated often enough to feel alive
- funny in a dry way, not gimmicky

## Candidate Indices

### 1. Molly Stone's Basket

What it is:

A premium local grocery basket built from products a Marin household would actually recognize.

Good starter items:

- eggs
- berries
- olive oil
- coffee beans
- chicken thighs or breasts
- sourdough
- sparkling water
- yogurt
- avocados
- wine
- fancy snack item

Why it works:

- local and concrete
- easy to explain on the site
- easy to chart over time
- plausible to collect manually before automating

Data sources:

- Molly Stone's
- Whole Foods
- Safeway
- Nugget
- Sprouts
- United Markets

Cadence:

- weekly is enough for v1
- daily only if scraping is reliable

Feasibility:

High

### 2. Wine / Whiskey Index

What it is:

A premium discretionary spending index built from a small set of bottles or wine-market reference points.

Possible components:

- 3 to 5 widely available Napa / Sonoma bottles
- 1 to 2 champagne anchors
- 1 to 2 collector whiskey anchors
- optional wine-futures reference if the source is clean enough

Why it works:

- aligns with Marin taste and status signaling
- complements grocery pricing without duplicating it
- can serve as a cleaner "luxury mood" signal than a generic inflation chart

Data sources:

- retailer product pages
- merchant catalogs
- secondary-market reference sites if legally and technically stable

Cadence:

- weekly or biweekly

Feasibility:

Medium

Notes:

Wine is probably easier than whiskey if we want stable public pricing.

### 3. Watch Index

What it is:

A grey-market luxury watch proxy for local wealth mood.

Possible anchors:

- Rolex Submariner
- Rolex GMT-Master II
- Cartier Santos
- Omega Speedmaster

Why it works:

- strong signal of upper-end consumer sentiment
- memorable and editorially sharp

Risks:

- less explicitly local
- data quality may depend on third-party listings

Cadence:

- weekly

Feasibility:

Medium

### 4. Exotic Car Index

What it is:

A higher-end inventory and asking-price tracker for cars that map to Marin affluence.

Possible anchors:

- Porsche 911 GT3
- G-Wagen
- Range Rover
- Ferrari 488 / Roma
- Rivian R1S at the top trim level

Why it works:

- funny and memorable
- naturally fits a "bullish or bearish on Marin residents" framing

Risks:

- data may be noisy
- asking prices are not transaction prices
- could get too broad too quickly

Cadence:

- weekly or monthly

Feasibility:

Medium to low

### 5. Bullish / Bearish Marin

What it is:

A composite sentiment score built from the other indices plus a few existing Marin Monitor signals.

Possible ingredients:

- grocery basket trend
- gas prices
- housing inventory and days on market
- luxury basket trend
- restaurant / retail signals later if we have them

Why it works:

- gives the site a point of view
- turns several narrow datasets into one legible headline number

Risks:

- needs transparent methodology
- should be a scorecard, not fake precision

Cadence:

- weekly

Feasibility:

High after at least one basket exists

## Recommendation

Prototype in this order:

1. Molly Stone's Basket
2. Wine / Whiskey Index
3. Bullish / Bearish Marin
4. Watch Index
5. Exotic Car Index

This keeps the first version grounded in data that is local, visible, and explainable.

## V1 Recommendation

The cleanest first shippable version is:

- one grocery basket panel
- one premium bottle panel or sub-panel
- one composite "Bullish on Marin" score built from groceries, gas, and housing

That is enough to establish the pattern without turning the product into a joke.

## Data Collection Model

Start simple.

V1 should assume one of these approaches:

- manual weekly capture into a checked-in JSON file
- a small local script that exports reviewed JSON into the repo
- selective scraping only where markup is stable

Avoid building a large scraping system before the panel format is proven.

## UI Notes

Possible names:

- Molly Stone's Basket
- Marin Luxury Pulse
- Bullish on Marin
- Bearish on Marin
- Marin Mood

Good panel shapes:

- a compact basket card with current value, 7-day change, 30-day change
- a sparkline with 5 to 10 anchor items underneath
- a composite sentiment tile with a plain-language takeaway

The tone should stay dry and observational, not cute.

## Confirmed Index Designs

### Private School Tuition Index

Status: CONFIRMED

Framing: "Marin Private School Index" -- average annual tuition by level, shown as a percentage of median Marin County household income.

Headline card:

- Tier averages for Preschool, Elementary (K-5), Middle School (6-8), High School (9-12)
- Each tier shows average tuition and percentage of median household income
- Cumulative K-12 cost (13 years at tier averages) as a standalone kicker line
- Median household income source and year cited at bottom (Census ACS)

Drill-down:

- Every individual school we can scrape, listed with actual tuition
- Schools: Branson ($71,290 total), San Domenico ($83,450 boarding / $66,950 day), Marin Academy ($64,750), Marin Country Day ($49,535), MP&MS ($49,900), Marin Horizon ($47,590), Marin Montessori ($42,690)

Data sources:

- School websites: plain HTML scrape of admissions/tuition pages (6 of 7 schools)
- San Domenico: use boardingschoolreview.com or privateschoolreview.com as fallback (school site uses PDFs)
- Census ACS API for median Marin County household income

Cadence:

- Monthly cron to check for updates; realistically changes once per year (January-February for next fall)
- Some schools publish next year's rates early (Branson, MP&MS, Marin Montessori already showing 2026-27 by March)

Notes:

- Ring Mountain Day School is permanently closed (2022), skip it
- MCDS and Marin Montessori use indexed tuition models; track the max/sticker price as the comparable number
- No acronyms on the card -- spell out "median household income," not "HHI"

### Reservation Difficulty Index

Status: CONFIRMED (implementation deferred to post-merger summer 2026)

Name: "Table Stakes"

Framing: Tracks how far out you need to book at genuinely hard-to-get restaurants that Marin residents care about.

Headline card:

- Curated list of 8-12 hard-to-book restaurants across Marin, SF, and wine country
- Party size of 2 as the baseline (hardest to book)
- Display format depends on how the restaurant's booking model works:
  - "Monthly drop" restaurants (French Laundry, Lazy Bear, Single Thread): show "Next drop: Apr 1 at 10 AM" and "Sold out through: [month]"
  - "Rolling availability" restaurants (Atelier Crenn, Chez Panisse, HOPR): show "Next available: [date]" or "Booked [N] months out"
  - All entries show Michelin stars and price per person where applicable

Target restaurants (Resy post-merger):

- French Laundry (Yountville) -- 3 Michelin stars, Tock → Resy summer 2026, monthly drops on 1st at 10 AM PT, sells out in 1-2 min, $425-500/pp
- Atelier Crenn (SF) -- 3 Michelin stars, already on Resy
- Benu (SF) -- 3 Michelin stars, Tock → Resy summer 2026
- Lazy Bear (SF) -- 2 Michelin stars, Tock → Resy summer 2026, monthly drops, $295/pp
- Chez Panisse (Berkeley) -- already on Resy, 1 month out drops at 9 AM PT
- Mister Jiu's (SF) -- 1 Michelin star, already on Resy
- State Bird Provisions (SF) -- 1 Michelin star, Tock → Resy summer 2026
- Nari (SF) -- 1 Michelin star, already on Resy

Target restaurants (OpenTable, harder to scrape):

- House of Prime Rib (SF) -- OpenTable ID 1779, currently 7+ months out for dinner, resale market averages $151/reservation on AppointmentTrader
- Single Thread (Healdsburg) -- 3 Michelin stars, OpenTable, monthly drops on 1st at 9 AM PST

Other platforms:

- Quince (SF) -- 3 Michelin stars, SevenRooms

Data sources:

- Resy API: public, no auth required for availability checks. API key embedded in client JS (VbWk7s3L4KiK5fzlO7JD3Q5EYolJI7n5, may rotate). Endpoint: GET api.resy.com/4/find with venue_id, day, party_size. Header: Authorization: ResyAPI api_key="...". Venue search: POST api.resy.com/3/venuesearch/search with geo coords. Response includes slot times, seating types, score.total (demand), and estimated turn time. Reference: github.com/Alkaar/resy-booking-bot. Existing Tock bots for French Laundry: github.com/ct-le/reserve-tfl (Selenium), github.com/azoff/tockstalk (Cypress + GitHub Actions)
- OpenTable: requires Playwright for SSR page scraping or GraphQL with CSRF token extraction. More fragile, persisted query hashes change with deploys. GraphQL endpoint: POST opentable.com/dapi/fe/gql?optype=query&opname=RestaurantsAvailability. Needs x-csrf-token header extracted from page HTML (__CSRF_TOKEN__). Uses sha256Hash-based persisted queries that break on each OpenTable frontend deploy. SSR approach (loading profile page with date/time/covers params and parsing rendered DOM) is more robust. Reference implementation: github.com/nfmcclure/opentable_availability_check
- SevenRooms: open-source scrapers exist on GitHub

CRITICAL TIMING NOTE:

- Tock is merging into Resy summer 2026 (American Express acquisition). All ~8,000 Tock venues move to Resy
- After merger, one Resy scraper covers French Laundry, Lazy Bear, Benu, State Bird + everything already on Resy
- Resy is also releasing upgraded APIs for third-party partners including AI platforms in 2026
- DO NOT BUILD until post-merger (likely July-August 2026) to avoid building Tock scraping that immediately becomes obsolete
- Revisit this index in summer 2026 when the merger is complete

Cadence:

- Check availability every 15-60 minutes for cancellation monitoring
- Daily snapshot stored for trend tracking

Notes:

- Terrapin Crossroads is permanently closed (Nov 2021)
- Sol Food does not take reservations (walk-in only)
- Most Marin-local restaurants (Buckeye, Copita, Playa, Bungalow 44) are easy to book and not interesting enough for this index
- Saltwood is in Marina, CA (Monterey), not Sausalito -- skip it

### Marin Grocery Basket

Status: CONFIRMED

Name: "The Bare Essentials"

Framing: A 12-item grocery basket of aggressively Marin products tracked weekly via Instacart cross-store search. Total basket cost shown as headline, with per-item breakdown in drill-down.

The basket:

1. Vital Farms Pasture-Raised Large Eggs, 12 ct -- Sprouts $8.99 / Safeway $12.99
2. Organic Large Hass Avocado, 1 each -- Sprouts $3.50
3. Marin Kombucha Original Oak, 16 fl oz -- brewed in Novato, oak-aged. Driver's Market $4.79 / Berkeley Bowl $5.39 / also at Mollie Stone's and Woodlands (marinkombucha.com)
4. Oatly Oatmilk, 64 fl oz -- Sprouts $5.99 / Target $6.69 / Safeway $6.99
5. San Luis Sourdough Sliced Bread, 32 oz -- Safeway $7.59
6. Mary's Chicken Organic Breast, 2 lb -- Sprouts $19.99 (fixed package, not per-lb)
7. Earthbound Farm Organic Chopped Kale, 10 oz -- Sprouts $3.99
8. Manuka Health Honey MGO 263+, 8.8 oz -- Sprouts $31.99
9. Justin's Classic Almond Butter, 16 oz -- Sprouts $10.99 / Safeway $16.99 / Mollie Stone's $18.89
10. Open Nature Salmon Fillets, Sockeye, Wild Caught, 2 ct frozen -- Safeway $16.99
11. Silver Oak Alexander Valley Cabernet Sauvignon, 750 ml -- Total Wine $78.49 / Lucky $99.99
12. Vital Proteins Collagen Peptides, Unflavored, 20 oz -- Vitamin Shoppe $42.99 / Costco $37.31 (1.5 lb)

Total basket (anchor store prices): ~$185 at cheapest stores, higher at premium stores

Data source:

- Instacart cross-store search: instacart.com/store/s?k={search_term} with Marin ZIP (94901)
- No auth required. Returns results from Sprouts, Safeway, Target, Costco, Mollie Stone's, Total Wine, BevMo, Lucky, Walmart, Fairfax Market, and others
- Amazon/Whole Foods: Amazon product pages show prices publicly for shelf-stable items (no login needed), but these are Amazon.com delivery prices, not in-store WF shelf prices. Fresh produce not available this way. Keepa API ($49 EUR/month) is the most reliable programmatic path for Amazon price tracking. Not needed for v1 -- Instacart covers enough stores. Consider as a future comparison column

Cadence:

- Weekly cron job. Scrape all 12 items, store prices by store and date
- Track regular vs sale pricing (items frequently go on sale)

Headline card:

- Total basket cost (cheapest-store mix and/or single-store totals)
- Week-over-week change with trend arrow
- Sparkline of basket cost over time

Drill-down:

- Per-item price across stores
- Which items moved most this week
- Price spread between cheapest and most expensive store for each item

Design notes:

- All items are branded, fixed-package products to avoid per-lb variability
- Sprouts is the dominant anchor store (carries 9 of 12 items, frequently cheapest)
- Justin's almond butter has the wildest cross-store spread: $10.99 to $18.89 for the same jar
- Sale prices are common (GT's kombucha, almond butter both on sale during initial check). Track both regular and sale

### Wine Index

Status: CONFIRMED

Name: TBD

Framing: A premium wine market index powered by PlumpJack's Shopify API. Tracks category median prices over time (sparkline) and surfaces PlumpJack's own curated editorial selections as a rotating bottle listing.

Headline card (sparkline/composite tracked over time):

- Napa/Sonoma Cab median price (384 wines in catalog, sweet spot $50-200)
- Burgundy median price (276 wines, sweet spot $30-100)
- Champagne median price (230 wines, sweet spot $30-200)
- Each category shows current median, weekly change, and sparkline over time
- These are computed from PlumpJack's full inventory, not a fixed basket of bottles

Bottle listing (rotates with PlumpJack's curation):

- Staff Picks collection (45 wines, $14-$144) -- PlumpJack's editorial voice, genuinely interesting producers
  - Examples: Lelarge-Pugeot Tradition NV Champagne ($66), Cameron Winery Dundee Hills Pinot ($45), Vinca Minor Mariah Vineyard Chard ($50), Horus Frappato ($25)
- Allocated Wines collection (44 wines, $38-$463) -- limited production, hard-to-find
  - Examples: Quintarelli Amarone 2017 ($463), Dominus 2019 ($400), Ridge Montebello 2021 ($300), Kosta Browne Russian River Pinot ($121)
- Unique Reds 2025 collection (40 wines, $8-$71) -- offbeat, interesting
  - Examples: Arnot-Roberts Trousseau ($42), Skerk Teran Terrano ($45), Graci Etna Rosso ($37)
- Staff picks rotate naturally as PlumpJack updates them -- no editorial work needed on our side

Data source:

- PlumpJack Wine & Spirits Shopify API (plumpjackwines.com)
- 6,817 total products, ~3,210 wines, 502 collections
- All endpoints open, no auth required:
  - GET /collections.json -- all collections
  - GET /collections/{handle}/products.json?limit=250 -- products in a collection
  - GET /products/{handle}.json -- single product detail
  - GET /search/suggest.json?q=QUERY&resources[type]=product -- search
- Product tags include: grape variety, region, sub-region, country, farming practice (organic, biodynamic, natural), color, price tier
- Product data: title, price, compare_at_price (sale), available (boolean), body_html (tasting notes), vendor, product_type

Secondary source:

- Blackwell's Wines & Spirits (blackwellswines.com) -- also Shopify, has a San Rafael (Marin) location
- Same API pattern works but wine metadata is sparser (product_type is just "WINE", tags less granular)
- 593 cabs, 275 chards, 219 champagnes
- Useful as a price comparison source, not primary curation

Cadence:

- Weekly cron job to compute category medians and pull current staff picks / allocated wines
- Daily optional for availability tracking (sold out / back in stock)

Collections to use for index computation:

- napa-and-sonoma-wines (384 products) -- Napa/Sonoma median
- burgundy (276 products) -- Burgundy median
- champagne (230 products) -- Champagne median
- staff-picks + fillmore-staff-picks -- editorial listing
- allocated-wines -- limited/hard-to-find listing
- unique-reds-2025 / unique-reds -- interesting picks listing
- natural-wine (177 products) -- possible future category line

Future: Wine-Searcher integration (backlog):

- wine-searcher.com is the industry standard for wine pricing across thousands of retailers
- API exists but $250/mo for useful tier (500 calls/day). Free trial at 100 calls/day — apply first
- No category browsing — must query each wine by name individually
- Not self-serve — requires contacting their team for API key
- Alternative approach: Chrome + Claude MCP scrape (browser automation with reasoning)
- Colin (Stuart's wine friend) recommends it as the go-to source
- Decision: backlog for now. PlumpJack is working well as primary source. Revisit when we want to get "really dorky on wine" — either via their API trial or a Chrome+MCP approach

Collections to AVOID (mass-market grocery wines):

- classics-under-50 (has Prisoner, Cakebread, Rombauer, Meiomi)
- hilarys-picks (has Meiomi, Saldo)
- everyday-drinkers (value tier)

Notes:

- Opus One ($519.99) and Silver Oak Napa Valley ($177.99) can appear in the allocated/notable section but are NOT the editorial backbone
- The index intentionally leans on PlumpJack's curation rather than tracking "famous" bottles
- Vintage turnover makes discrete bottle tracking misleading year-over-year; category medians are the right unit for time-series tracking

### The Marin Driveway

Status: CONFIRMED

Name: "The Marin Driveway" (working title)

Framing: What's actually registered and parked in Marin driveways, based on real California DMV data. Snapshot of vehicle makes and fuel types across the county, with year-over-year trends and EV adoption tracking.

Headline card:

- Top makes registered in Marin (Toyota 26,943 / Honda 11,787 / Tesla 8,104 / Subaru 6,443 / etc.)
- Fuel type breakdown: 75.6% gas, 8.3% BEV, 8.1% hybrid, 2.7% PHEV, 0.03% hydrogen (68 cars)
- Total registered vehicles: 210,586 (2024)
- Year-over-year trend for EV share (historical data back to 2018)
- Fun stats: Rivian count (393), Lucid count (12), Porsche count (836)

Drill-down:

- Breakdown by town (ZIP-to-town mapping via existing TOWN_BY_SLUG config)
- EV adoption rate by town (compare Tiburon vs Novato vs Point Reyes)
- Specific EV models popular in Marin (from CEC quarterly data: Model Y vs Model 3 vs Rivian R1S)
- Year-over-year trend charts for each fuel type

Future enhancement — estimated driveway value:

- Cross-reference make data with average MSRP/market values to estimate total fleet value
- "The average Marin driveway is worth $X" as a composite stat for the Cost of Being Marin index

Data sources:

- Primary: California DMV "Vehicle Fuel Type Count by Zip Code" on data.ca.gov
  - Free, no registration needed
  - SQL-capable REST API: data.ca.gov/api/3/action/datastore_search_sql
  - Fields: date, ZIP code, model year, fuel type, make, duty (light/heavy), vehicle count
  - Coverage: all vehicle types (gas, electric, diesel, hybrid, everything)
  - Marin ZIPs: 32 ZIP codes to aggregate
  - Historical data: 2018-2024 available
  - Privacy masking: make/year/fuel/ZIP combos under 10 vehicles lumped into OTHER/UNK (~61% at ZIP level, much better when aggregated across county)
  - Limitation: make only, no model (can say "26,943 Toyotas" but not "X RAV4s vs Y Priuses")
- Supplementary: California Energy Commission (CEC) New ZEV Sales XLSX
  - energy.ca.gov/files/zev-and-infrastructure-stats-data
  - Adds MODEL-level granularity for EVs (not just make)
  - Quarterly updates (last update Jan 15, 2026)
  - Downloadable XLSX, filterable by county/ZIP
  - Limitation: EV/ZEV only, not gas/diesel vehicles

Cadence:

- Monthly cron job to check for new data (DMV publishes annually each spring, CEC quarterly)
- Ingest and store historical snapshots to build time-series even if source data moves slowly
- Over time, month-over-month ingestion will reveal whether changes are detectable at shorter intervals

Notes:

- Auto.dev API (used car listings) is a web-scraping aggregator run by Drivly Inc., 6 employees, no accuracy guarantees. NOT needed for this index — real DMV data is superior
- Exotic car count from listings could be a supplementary fun stat but is not the backbone
- CNCDA reports cover Bay Area as a region, not Marin specifically — not useful
- S&P Global Mobility has the gold-standard make/model/trim data but costs $10K-$100K+/year — not viable for this project
- CalMatters GitHub repo has a template for joining vehicle data with Census demographics and Zillow home values by ZIP — useful reference for future enrichment

### The Marin Cappuccino

Status: CONFIRMED

Name: "Cappuccino Index"

Framing: Gas-prices-style map showing the price of a cappuccino at coffee shops across Marin. Each shop is a pin on the map with a price. Aggregate trend line over time like the gas prices panel.

Headline card:

- Map pins showing cappuccino price at each location
- Median/average Marin cappuccino price as headline number with trend arrow
- Sparkline of aggregate cappuccino price over time (like gas prices)
- Modeled after the existing gas prices panel UX

Locations (11 confirmed, 7 on Toast):

- Fox & Kit, San Rafael -- $4.50 (via delivery platforms)
- Equator Coffees, Roundhouse / Golden Gate Bridge -- $5.00 (Toast)
- Marin Coffee Roasters, San Anselmo -- $5.10 (Toast)
- Marin Coffee Roasters, Ignacio -- $5.10 (Toast)
- Marin Coffee Roasters, Novato drive-thru -- $5.10 (Toast)
- Equator Coffees, Mill Valley (2 Miller Ave) -- $5.25 (Toast)
- Equator Coffees, Larkspur (Marin Country Mart) -- $5.25 (Toast)
- Equator Coffees, Sausalito (1201 Bridgeway) -- $5.25 (Toast)
- Equator Coffees, Proof Lab / Tam Junction (244 Shoreline Hwy) -- $5.25 (Toast)
- Firehouse Coffee & Tea, Sausalito -- $6.00 (plain HTML on Squarespace)
- Philz Coffee, Corte Madera (Town Center) -- no cappuccino (pour-over only, starts $6.15, track as a separate category or note)

Observations:

- Equator prices are identical across all 4 Marin locations; Roundhouse (GGB) is $0.25 cheaper on every item
- Marin Coffee Roasters is $0.15 cheaper than Equator on cappuccinos
- Firehouse in Sausalito charges the most ($6.00)
- Fox & Kit in San Rafael is the cheapest ($4.50)
- DoorDash marks up Toast prices 5-10% — always use Toast direct as the source of truth

Data sources:

- Primary: Toast online ordering pages via Playwright headless browser
  - Toast blocks curl/WebFetch (403) but Playwright works
  - Text output is clean and parseable: item name + price in predictable format
  - Regex pattern: /^(.+?)(\$[\d.]+)$/ on innerText lines extracts name+price pairs
  - Toast URLs (confirmed working):
    - order.toasttab.com/online/equator-coffees-miller-ave (Mill Valley)
    - order.toasttab.com/online/equator-coffees-proof-lab (Proof Lab)
    - order.toasttab.com/online/equator-coffees-larkspur (Larkspur)
    - order.toasttab.com/online/sausalito-equator (Sausalito — note different URL pattern)
    - order.toasttab.com/online/equator-coffees-roundhouse-golden-gate-bridge-plaza (Roundhouse)
    - order.toasttab.com/online/marin-coffee-roasters-san-anselmo-546-san-anselmo-ave
    - order.toasttab.com/online/marin-coffee-roasters-ignacio-466-ignacio-blvd
    - order.toasttab.com/online/marin-coffee-roasters-drive-through-1551-s-novato-blvd
  - Also on Toast: Rustic Bakery (Larkspur), Trailhead (Novato) — could add later
- Secondary: Plain HTML scrape for Firehouse Coffee (Squarespace)
- Secondary: Delivery platform scrape for Fox & Kit (DoorDash/Postmates)
- Philz: own ordering platform (philzcoffee.order.online) + third-party menu aggregators

Cadence:

- Weekly cron job via Playwright scraping Toast pages
- Coffee prices change infrequently, but weekly captures sales/seasonal drinks and builds the trend line
- Store historical snapshots for trend chart

Scraping exercise value:

- High — combines Playwright headless browser, Toast SPA scraping, regex extraction, multi-source aggregation
- Good professional feedback loop for similar scraping challenges at work

Notes:

- Track cappuccino as the primary benchmark drink (not latte — user preference)
- Philz is pour-over only, no espresso drinks — display as a separate category or footnote
- Equator roastery at 115 Jordan St, San Rafael does not have a Toast ordering page
- Peet's and Starbucks could be added later as chain baselines but are lower priority
- Could expand to track multiple drinks (cappuccino, drip, cold brew) over time

### Fitness Drop-in Index

Status: CONFIRMED

Name: TBD (working title "Fitness Index" or "Drop-in Index")

Framing: Gas-prices-style map showing the price of a drop-in class at fitness studios across Marin. Pins color-coded by type (yoga, pilates, cycling, CrossFit, HIIT). Aggregate trend line over time.

Headline card:

- Map pins showing drop-in price at each studio, color-coded by type
- Median drop-in by category as headline stats (yoga $32, pilates $50, cycling $39)
- Sparkline of aggregate fitness class price over time
- Toggle filter by type: yoga / pilates / cycling / CrossFit / HIIT

Confirmed studios with pricing (18+):

Yoga:
- Love Story Yoga, Larkspur -- $27 drop-in (Mariana Tek)
- Marin Iyengar Yoga, Corte Madera -- $29 drop-in
- NOW Power Yoga, Corte Madera -- $30 drop-in (Zenrez)
- Embrace Yoga, San Rafael -- $32 drop-in (MindBody)
- Sukha Yoga, Novato -- $34 drop-in (HealCode)
- Pilates Tiburon (barre/yoga classes), Tiburon -- $34 drop-in (MindBody)
- The Studio Mill Valley -- $38 drop-in (Momence)
- Hot Yoga Republic, Mill Valley + San Rafael -- $39 drop-in (HealCode)
- Home Studio Yoga, San Anselmo -- $48 intro month (Momence)
- Some Like It Hot, Novato -- $18 student / $189 monthly (Unknown)

Pilates (reformer):
- Pilates Tiburon (reformer), Tiburon -- $45 drop-in (MindBody)
- The Studio Mill Valley (reformer) -- $45 drop-in (Momence)
- Mighty Pilates, Larkspur -- $50 drop-in (MindBody)
- Studio Pilates Marin, San Rafael -- $50 drop-in (plain HTML)
- Internal Fire Pilates, Mill Valley -- $55 drop-in (MindBody)

Cycling:
- SoulCycle, Larkspur -- $36-$42 per ride (Proprietary)

HIIT:
- Orangetheory, Greenbrae -- ~$29/class via pack, $119-$219/mo (Proprietary)
- F45, Corte Madera -- ~$35 drop-in estimated (Proprietary)

CrossFit:
- Tamalpais CrossFit, San Rafael -- $25 drop-in (donated to animal shelter), $225/mo (custom site)
- Ross Valley CrossFit, San Anselmo -- $235/mo, no drop-in listed (custom site)

Full gyms (for reference/comparison):
- Fitness SF, Corte Madera -- $79.95/mo unlimited classes (Proprietary)
- Body Kinetics, Novato -- $99/mo unlimited classes (custom site)

Observations:

- Yoga drop-in range: $27-$39
- Reformer Pilates is significantly more expensive: $45-$55
- SoulCycle is the most expensive per-class: $36-$42/ride
- CrossFit at Tam CrossFit is cheapest drop-in ($25) and they donate it to the animal shelter
- A full gym membership ($80-$99/mo) is cheaper per-class than a single yoga drop-in
- MindBody is the dominant booking platform (6+ studios)

Data sources:

- Studio websites: mix of plain HTML, MindBody widgets, Momence, Mariana Tek, HealCode, Zenrez
- Many studios hide pricing behind booking platforms or require contact
- Playwright + LLM extraction would cover most; manual spot-check for the rest
- Studios that hide pricing entirely: Metta Yoga (3 locations), The Dailey Method, Pure Barre, Club Pilates, BODYROK, Bodhi Hot Yoga

Cadence:

- Monthly cron job. Fitness class prices change infrequently (quarterly at most)
- Store historical snapshots for trend line
- Playwright scraping of studio websites + booking platform pages

## Map Layer Architecture

The Cappuccino Index and Fitness Drop-in Index both use gas-prices-style map pins. These should be implemented as toggleable map layers on the existing Marin map, alongside existing layers (Civic, News, Safety, Housing, Activity, Gas, EV, Coffee, Fitness, Satire, Traffic).

New map layers needed:

- Coffee: pins for each coffee shop with cappuccino price (12 locations)
- Fitness: pins for each studio with drop-in price, color-coded by type (16 locations)
- Both default ON in the current map UI

Toggle/filter design:

- Top-level toggle: Coffee / Fitness (show/hide all pins of that type)
- Sub-filter within Fitness: yoga / pilates / cycling / CrossFit / HIIT
- Consistent with existing layer toggle pattern in the map UI

This may require refactoring the current map layer system to accommodate price-data layers (which show a dollar amount on hover/click) vs. the existing story-based layers (which show article/event details). The data shape is different: a price pin has {lat, lon, name, type, price, lastUpdated} vs. a story pin which has {lat, lon, title, source, verification_level, etc.}.

## Backlog

### Observability / Data Pipeline Monitoring

Not part of the indices spec but needed before or alongside shipping indices. Backlog item.

Approach:
- /api/health endpoint that returns status of every data source (last updated, record count, errors)
- Each data source has an expected cadence; if data is older than expected, flag as stale
- Daily freshness-check cron that emails stuart@eastpeak.cc when anything is stale or errored
- Per-job structured logging (timestamp, source name, status, duration, record count, error message)
- Sanity bounds on scraped values (cappuccino shouldn't cost $0 or $500)
- No need for Datadog/PagerDuty — keep it simple

### Scrape Proxy on Mac Mini

The Mac mini runs a residential IP proxy at 127.0.0.1:8889 (LaunchAgent: com.marinmonitor.scrape-proxy). GitHub Actions workflows route scraping requests through it via Tailscale (100.67.183.14:8889) to avoid datacenter IP blocking.

- LaunchAgent: /Users/tammypais/Library/LaunchAgents/com.marinmonitor.scrape-proxy.plist
- Script: scripts/scrape-proxy.mjs
- Health endpoint: http://127.0.0.1:8889/health (returns request counts, success/error rates, last request/error)
- Auth: Bearer token stored in GH Actions secret SCRAPE_PROXY_SECRET
- Tailscale auth key for GH runners: stored in GH Actions secret TAILSCALE_AUTHKEY (ephemeral, reusable, 90-day expiry — renew before expiration)
- Monitor: proxy health should be checked alongside index freshness in the observability system

### Better Event Scraping / Calendar Ingestion

Backlog item. Not part of the indices feature but uses the same scraping techniques.

Current problem: Pacific games, regattas, rowing calendar, and other seasonal events are not being extracted correctly from source pages. They get listed but not properly structured.

Approach: Use the same `window.__OO_STATE__` / structured-data extraction pattern proven in the Cappuccino Index. Instead of regex-on-innerText, extract structured event data (dates, times, locations, categories) from page state objects, JSON-LD, or embedded data attributes.

Goal: Build a proper calendar destination for each sport/activity for the year or season, rather than just listing individual events in wire columns.

Candidates for improvement:
- Pacific games schedule
- Rowing/regatta calendar
- Other seasonal event sources that are currently scraped poorly

### FixItMarin (backlog)

HIGHLY VIABLE. Powered by SeeClickFix (CivicPlus). Free public JSON API, no auth needed.

API: GET https://seeclickfix.com/api/v2/issues?place_url=marin-county&per_page=100
- Returns: id, status, summary, description, lat/lng, address, category, photos, timestamps, comments, assignee
- ~9 new reports/day, 853 total issues, 38 service categories
- Top categories: Illegal Dumping (16%), Potholes (12%), Sidewalks (10%), Drainage (8%)
- Rate limit: 20 req/min (fine for cached dashboard)
- Covers unincorporated Marin County + City of San Rafael
- GeoJSON points ready for map display — maps perfectly to existing TOWN_BY_SLUG
- Could build: live issue map pins, category breakdown, resolution time tracking, town-level filtering, recent reports feed with photos
- This would be a civic data layer, not an index — more like a "what's broken in Marin" panel

### Nextdoor Integration (backlog)

Nextdoor is a walled garden — no public API, requires login. But the same Chrome+MCP browser automation approach used for Strava and LinkedIn scraping could work here with a logged-in session. Could pull local posts, alerts, community discussions, neighborhood-level sentiment. Requires setting up a Nextdoor account/login and using browser automation to scrape while logged in.

### Bullish / Bearish on Marin (backlog)

Status: BACKLOG (for future consideration)

Concept: Directional sentiment score where each index votes +1 (bullish / getting pricier / more demand) or -1 (bearish / cooling off). Score range -7 to +7, displayed as a gauge. Not a dollar figure — a vibe.

Deferred per Stuart's preference to focus on the tiered composite and The Marin Number first.

---

## The Composite: Cost of Being Marin

### Tiered Sub-Scores

Status: CONFIRMED

Framing: Four tiers of Marin costs, each tracked as a base-100 index over time. The tiers tell different stories at different cadences. The composite blends them with weights.

#### Tier 1: Daily Life (updates weekly, weight ~40%)

What you spend every week just existing in Marin.

Components:
- Groceries: Bare Essentials basket total ($185/week → ~$796/mo)
- Coffee: Cappuccino Index median ($5.25/day × 22 workdays → ~$116/mo)
- Gas: already tracked, currently ~$6.02/gal in Marin (~$200/mo assuming 40 gal/mo)

Monthly subtotal: ~$1,112

This tier moves the most and is the most relatable. Egg spikes, gas surges, coffee price changes all show up here within a week.

#### Tier 2: Lifestyle (updates weekly/monthly, weight ~25%)

The discretionary spending that makes Marin, Marin.

Components:
- Wine: PlumpJack category medians (Napa Cab ~$78, Burgundy ~$52, Champagne ~$65)
- Fitness: median yoga drop-in ($32), monthly unlimited (~$175)
- Restaurants: Table Stakes booking difficulty (qualitative signal, post-merger summer 2026)

Monthly subtotal: ~$331 (2 bottles wine + monthly fitness)

This tier captures the "luxury pulse" — are people spending on wine, yoga, and dining out?

#### Tier 3: Housing (updates monthly, weight ~25%)

The elephant in every Marin room.

Components (from Redfin data, already in the system):
- Median home price: $1,357,250 (Feb 2026 Redfin)
- Estimated monthly PITI on median home: $8,566 (20% down, 6.38% 30yr fixed, 1.1% property tax, insurance)
  - Principal & Interest: $6,991
  - Property tax: $1,283
  - Insurance: $292 (base; wildfire risk areas much higher)
- Median rent: $3,569/mo
- Days on market: 43-64 (seasonal)
- Inventory: 289-365 listings
- Months of supply: 2.8 (seller's market, below 4-6 balanced threshold)

Additional Redfin fields available but not currently extracted:
- MONTHS_OF_SUPPLY, AVG_SALE_TO_LIST, SOLD_ABOVE_LIST, NEW_LISTINGS, PENDING_SALES, PRICE_DROPS
- All with MOM and YOY variants
- Could enrich the housing tier significantly by extracting more from the existing TSV

Other available sources:
- Zillow ZHVI: $1,429,486 (Feb 2026) — "typical home value" (35th-65th percentile)
- FRED: All-Transactions HPI for Marin (FIPS 06041), quarterly, from 1975
- Marin County Open Data: housing permits, parcel data

Monthly subtotal for composite: $8,566 (PITI) or $3,569 (rent) depending on whether we model an owner or renter

#### Tier 4: Structural (updates annually, weight ~10%)

The big, slow-moving costs that define Marin.

Components:
- Private school tuition: ~$47,000/yr average K-8 → ~$3,917/mo
- Driveway: fleet composition (210,586 vehicles), estimated fleet value
- Country club dues: ~$15,000/yr ongoing → ~$1,250/mo

Monthly subtotal: ~$5,167

This tier barely moves quarter to quarter. It anchors the composite and prevents short-term grocery fluctuations from dominating the score.

#### Composite Calculation

Each tier starts at base 100 in the baseline period (e.g., first week of data collection). Weekly/monthly updates compute % change from baseline. Composite = weighted average of tier scores.

Weights (initial, tunable):
- Daily Life: 40% (most dynamic, most relatable)
- Lifestyle: 25% (the Marin premium)
- Housing: 25% (the biggest real cost, but moves slowly)
- Structural: 10% (annual anchor)

Display: Single composite number (e.g., "Cost of Being Marin: 103.2 (+3.2% from baseline"), with drill-down showing each tier's score and what moved.

---

### The Marin Number

Status: CONFIRMED

Framing: The absurd, all-in monthly dollar figure that answers "what does it actually cost to live the full Marin lifestyle?" This is the joke number — the performance art. Deliberately comprehensive, deliberately horrifying.

Persona: One household, two adults, one kid in private school, one dog, the works.

Monthly breakdown:

| Category | Monthly | Source |
|----------|---------|--------|
| Housing (PITI on median home) | $8,566 | Redfin median + current mortgage rates |
| Groceries (Bare Essentials × 4.3 wks) | $796 | Instacart scrape |
| Coffee (daily cappuccino × 22 days) | $116 | Cappuccino Index |
| Wine (2 bottles Napa Cab median) | $156 | PlumpJack API |
| Fitness (monthly unlimited yoga) | $175 | Fitness Index |
| Gas (~40 gal/mo) | $241 | Gas price cron (already tracked) |
| Private school (1 kid, K-8 avg $47K/yr) | $3,917 | School tuition scrape |
| The Dog (one golden retriever) | $1,000 | Vet, walker 3x/wk, premium food, grooming |
| Therapist (weekly, 1 person) | $1,000 | $250/session × 4 |
| Ski season (Ikon passes + gas + lodging, amortized) | $600 | $7,200/yr ÷ 12 |
| Summer camp (2 kids, 8 weeks, amortized) | $933 | $11,200/yr ÷ 12 |
| Country club dues (amortized) | $1,250 | $15,000/yr ÷ 12 |
| Wine country trips (12-15x/yr, amortized) | $667 | ~$8,000/yr ÷ 12 |
| Farmers market habit | $433 | $100/wk × 4.3 |
| Marin Country Mart (2x/mo) | $1,000 | $500/visit × 2 |
| Acupuncture (biweekly) | $260 | $120/session × 2.2 |
| **THE MARIN NUMBER** | **$21,110/mo** | |
| **Annual** | **$253,320/yr** | |

And that is BEFORE car payments, insurance, clothing, utilities, property maintenance, vacations beyond Tahoe, the second kid's school, the second dog, or the other parent's therapist. Scale accordingly.

Context lines for the card:
- "The Marin Number is $21,110 this month"
- "That is $253,320/year to live the Marin lifestyle"
- "This does not include your Rivian payment"
- Percentage of median household income: ~175% (median Marin HHI ~$145K means the full lifestyle costs 1.75x what the median household earns)

The number updates as the underlying indices change. When eggs spike, The Marin Number goes up. When gas drops, it goes down. The ski season line stays flat because Ikon Pass prices are set annually.

Seasonal costs (ski, summer camp) are amortized monthly for a smooth number. An alternative: show them in the months they're incurred for a spikier, more honest chart.

Data sources: All sourced from the other indices already defined in this spec, plus:
- Dog costs: manual research, updated annually
- Therapist rates: manual research, updated annually
- Ski pass pricing: Ikon Pass website, updated annually each spring
- Summer camp: manual research, updated annually
- Country club dues: manual research or public filings, updated annually
- Wine country trips: estimated from tasting room fees (Napa avg $75/tasting, Sonoma 30-40% cheaper)
- Marin Country Mart: estimated from store pricing (Jenni Kayne sweaters ~$295, Farmshop brunch ~$120)
- Acupuncture: local studio rates, updated annually

Design notes:
- The static/annual items (ski, camp, club, dog, therapist, acupuncture) can be configured values in a JSON file, updated manually once a year
- The dynamic items (housing, groceries, coffee, wine, fitness, gas) pull from the live indices
- The Marin Number = sum of all, recomputed whenever any component updates
- Display as a single big number with a "+$X this month" delta and a sparkline

---

## Implementation Infrastructure

### Pattern for New Indices

Each new index follows the established gas price pattern (8 files):

1. Type definition: src/lib/types/{index}.ts
2. Server scraper: src/lib/server/scrapers/{index}.ts
3. Cron job: src/routes/api/cron/sync-{index}/+server.ts
4. API endpoint: src/routes/api/data/{index}/+server.ts
5. Client adapter: src/lib/api/marin/{index}.ts
6. Store: src/lib/stores/{index}.ts
7. Panel component: src/lib/components/panels/{Index}Panel.svelte
8. Config registration: src/lib/config/panels.ts (add to PANELS and DEFAULT_PANEL_ORDER)

Storage: Vercel Blob (marin-{index}.json)
Cache: 300s max-age, 600s stale-while-revalidate (consistent with existing endpoints)

### Cron Schedule Summary

| Index | Cadence | Method | Auth Required |
|-------|---------|--------|---------------|
| Bare Essentials (grocery) | Weekly | Instacart scrape | No |
| Cappuccino Index | Weekly | Playwright → Toast pages | No |
| Wine Index | Weekly | PlumpJack Shopify API | No |
| Fitness Drop-in | Monthly | Playwright + studio websites | No |
| Private School | Monthly (check), annual (changes) | HTML scrape of school sites | No |
| Marin Driveway | Monthly (check), annual (changes) | CA DMV data.ca.gov API | No |
| Gas Prices | 6x/day | Google Places API | Yes (API key) |
| Housing | Monthly | Redfin TSV (already exists) | No |
| Table Stakes | Every 15-60 min (post-merger) | Resy API | No |

### Vercel Blob Keys

- marin-housing.json (existing)
- marin-gas-prices.json (existing)
- marin-grocery-basket.json (new)
- marin-cappuccino.json (new)
- marin-wine-index.json (new)
- marin-fitness.json (new)
- marin-school-tuition.json (new)
- marin-driveway.json (new)
- marin-table-stakes.json (new, post-merger)
- marin-composite.json (new, computed from above)

## Next Steps

1. Review this spec with Stuart
2. Prioritize which indices to build first (recommend: Bare Essentials + Cappuccino Index as first pair, since they exercise the Instacart and Playwright scraping patterns)
3. Design the panel UI (compact cards with sparklines, consistent with existing panels)
4. Build the infrastructure (type defs, cron jobs, blob storage) for the first pair
5. Ship and iterate

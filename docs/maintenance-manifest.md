# Marin Monitor Maintenance Manifest

A checklist of all hardcoded values that need periodic updating. Run through this quarterly, or when a scraper starts returning stale data.

## Monthly Spot-Checks

| Item | File | Current Value | Where to Verify |
|------|------|--------------|-----------------|
| Firehouse Coffee cappuccino | `scripts/sync-cappuccino.mjs` | $5.50 | firehousecoffeeandtea.com/menu |
| Fox & Kit cappuccino | `scripts/sync-cappuccino.mjs` | $5.50 | DoorDash or visit |
| Philz pour-over | `scripts/sync-cappuccino.mjs` | $5.75 | philzcoffee.order.online |
| Grocery reference prices (12 items) | `src/lib/config/grocery-basket.ts` | $8.99-$78.49 | Instacart search for each item |
| Dog walker rates | Thumbtack scraper | ~$30/walk | thumbtack.com/ca/san-rafael/dog-walking |
| Rivian R1S lease | Rivian scraper | $899/mo | rivian.com/r1s |

## Quarterly Reviews

| Item | File | Values | Where to Verify |
|------|------|--------|-----------------|
| Fitness drop-in prices (16 studios) | `src/lib/config/fitness.ts` | $25-$55 | Each studio website or call |
| Composite baselines | `src/lib/config/composite.ts` | $1,153-$8,566 | Derived from live indices |
| Marin Number static items | `src/lib/config/composite.ts` | $260-$1,500 | See annual section below |

## Annual Updates (Critical)

### Spring (Feb-March): School Tuition
**File:** `src/lib/config/schools.ts`

| School | Current | Check URL |
|--------|---------|-----------|
| Branson School | $61,740 ($71,290 total) | branson.org/admissions/affording-branson |
| San Domenico | $66,950 / $83,450 boarding | sandomenico.org/admissions/tuition-affordability |
| Marin Academy | $64,750 | ma.org/admissions/affording-ma |
| Marin Country Day | $49,535 | mcds.org/admission/affording-mcds |
| MP&MS | $49,900 | mpms.org/admission/affording-mpms |
| Marin Horizon | $47,590 | marinhorizon.org/admissions/tuition-affordability |
| Marin Montessori | $42,690 | marinmontessori.org/admissions/tuition-and-tuition-assistance |

### Spring: Summer Camp Prices
**File:** Scraped from marinfamilies.com, fallback in composite config
- Check: marinfamilies.com/camps for current season pricing
- Update `STATIC_MARIN_NUMBER_ITEMS` camp monthly if scraper can't reach site

### August-September: Ski Passes
**File:** Scraped from ikonpass.com, fallback in composite config
- Check: ikonpass.com/en/shop-passes for new season pricing
- Current: Adult $1,399, Child $399

### September: Census Income Data
**File:** `src/lib/config/schools.ts`
- `MEDIAN_HOUSEHOLD_INCOME`: currently $145,000
- `INCOME_YEAR`: currently '2024'
- Check: data.census.gov — American Community Survey, Marin County

### End of Year: DMV Vehicle Data
**File:** `src/lib/config/driveway.ts`
- `FALLBACK_DATA_YEAR`: currently 2024
- All fallback make counts and fuel breakdowns
- Check: data.ca.gov API for new annual data release

## Static Marin Number Items

These are in `src/lib/config/composite.ts` and should be reviewed annually:

| Item | Current Monthly | Can Be Live? | Notes |
|------|----------------|-------------|-------|
| Rivian R1S payment | $1,100 | Yes (scraper) | rivian.com/r1s |
| The Dog | $1,500 | Yes (Thumbtack scraper) | Includes walker 3x/wk |
| Therapist (weekly) | $1,400 | Possible (Psychology Today, hard) | $350/session x 4 |
| Ski season | $600 | Yes (Ikon scraper) | $7,200/yr amortized |
| Summer camp (2 kids) | $1,200 | Yes (Marin Families scraper) | 8 weeks x median/wk x 2 |
| Country club | $1,250 | No (private/confidential) | $15,000/yr amortized |
| Wine country trips | $750 | No (behavioral estimate) | 12-15 trips/yr |
| Farmers market | $500 | No (behavioral estimate) | ~$115/wk |
| Marin Country Mart | $1,000 | No (behavioral estimate) | $500 x 2/mo |
| Acupuncture | $300 | Possible (practitioner websites) | $135/session biweekly |

## Coordinates (Only If Business Moves)

- Coffee shops: `src/lib/config/coffee.ts` (12 locations)
- Fitness studios: `src/lib/config/fitness.ts` (16 locations)
- Schools: `src/lib/config/schools.ts` (7 locations)

Verify via Google Maps if a pin looks wrong on the map.

## Scraping URLs (Monitor for Breakage)

If a scraper starts returning 0 results, check if the target URL changed:
- Toast shop URLs: `src/lib/config/coffee.ts` (8 URLs)
- School tuition pages: `src/lib/config/schools.ts` (7 URLs)
- PlumpJack collections: `src/lib/config/wine.ts` (5 collection handles)
- Instacart search: `src/lib/config/grocery-basket.ts` (12 search terms)

## Tailscale Auth Key

- **Expires:** ~2026-06-27 (90 days from creation)
- **Impact:** Wine, Grocery, Cappuccino, Ikon, Dog Walker scrapers will fail
- **Renew at:** login.tailscale.com/admin/settings/keys
- **Set secret:** `gh secret set TAILSCALE_AUTHKEY --repo East-Peak/marin-monitor`

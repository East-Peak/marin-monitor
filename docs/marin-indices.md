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

## Next Steps

1. Decide whether the first panel is a grocery basket only or grocery plus premium bottle tracking.
2. Define the exact v1 basket items and which stores count as the source of truth.
3. Pick the collection method for v1: manual, export script, or selective scraping.
4. Add a small checked-in data file and one simple panel before building any broader index framework.

# Traffic Provider Evaluation (511 + TomTom vs Mapbox)

Date: 2026-02-27

## Goal

Evaluate which congestion source should pair with `511` events for Marin map overlays where we show only "bad traffic" conditions.

## Key Findings

1. `511` should remain the event/incident backbone (closures, crashes, lane blocks, work zones).
2. Both TomTom and Mapbox can support "bad-only" congestion overlays.
3. TomTom appears stronger for directly querying absolute speed vs free-flow at points/segments.
4. Mapbox appears stronger for style-driven congestion categories (`heavy`, `severe`) directly in vector traffic data.

## Data Collection Model (How Data Is Gathered)

- TomTom states traffic data is collected from anonymous connected vehicle systems, PNDs, and mobile phones.
- Mapbox states traffic is derived from de-identified telemetry from device/SDK sensor data and partner signals.

Inference: both are probe-based traffic systems with broad mobile and vehicle inputs, not only dedicated navigation units.

## Fit for "Show Only Bad Traffic"

- `511`: filter by event `severity` (`MAJOR`, `SEVERE`) and event type (closure/incident).
- TomTom: compute delay ratio from `currentSpeed/freeFlowSpeed` and render only above threshold.
- Mapbox: render only segments with `congestion in {heavy, severe}` or `closed=yes`.

## Recommended Architecture

1. Primary layer: `511` severe incidents/work zones (high confidence and explicit operational events).
2. Congestion layer: run a short A/B pilot with TomTom + Mapbox in parallel.
3. Keep only one congestion vendor after pilot, based on observed Marin signal quality and cost.

## Pilot Metrics (What to Compare)

For 7 days, sample known Marin corridors (US-101, Sir Francis Drake, Tiburon Blvd, Shoreline Hwy):

- Coverage: percent of corridor segments with non-null data
- Timeliness: median refresh lag
- Sensitivity: fraction flagged as "bad traffic"
- Precision proxy: overlap with 511 severe events in space/time
- UI quality: readability and stability at county zoom levels

## Tooling Added

- Script: `scripts/evaluate-traffic-sources.mjs`
- Run: `npm run traffic:evaluate`
- Env vars:
  - `VITE_511_API_KEY`
  - `VITE_TOMTOM_API_KEY`
  - `VITE_MAPBOX_TOKEN`

The evaluator prints JSON with side-by-side samples for the same Marin points.

## Sources

- 511 Open Data (Traffic): <https://511.org/open-data/traffic>
- 511 Traffic specification (WZDx): <https://511.org/sites/default/files/pdfs/511%20SF%20Bay%20Open%20Data%20Specification%20-%20Traffic_0.pdf>
- TomTom Flow Segment Data API: <https://developer.tomtom.com/traffic-api/documentation/tomtom-maps/traffic-flow/flow-segment-data>
- TomTom incident details API: <https://developer.tomtom.com/traffic-api/documentation/traffic-incidents/incident-details>
- TomTom data-source FAQ: <https://developer.tomtom.com/knowledgebase/move-portal/data-source-and-quality/where-do-you-get-your-traffic-data-from-which-devices-/>
- Mapbox Traffic v1 tileset: <https://docs.mapbox.com/data/tilesets/reference/mapbox-traffic-v1/>
- Mapbox Traffic Data docs: <https://docs.mapbox.com/data/traffic/guides/data/>
- Mapbox telemetry overview: <https://www.mapbox.com/telemetry>

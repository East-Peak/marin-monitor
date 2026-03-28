# Strava Explore

This is the local discovery job for expanding Marin segment coverage beyond the hand-curated featured list.

## What It Does

- scans Marin bounding boxes with Strava's segment explore API
- recursively splits dense tiles to catch more candidates
- enriches each discovered ID with `/segments/{id}`
- scores and filters for meaningful Marin segments
- writes a generated export to `data/strava-explore.generated.json`

The current featured UI list in `src/lib/config/strava.ts` stays hand-curated. This explore output is meant for review and promotion, not direct overwrite.

## Local Env

The script reads these values from `.env.strava-explore.local`:

- `STRAVA_CLIENT_ID`
- `STRAVA_CLIENT_SECRET`
- `STRAVA_REFRESH_TOKEN`

This file is ignored by git.

If you need to refresh the local file from Vercel on this machine:

```bash
vercel env pull .env.strava-explore.local --environment=production -y
```

## Run

```bash
npm run strava:explore
```

Useful flags:

```bash
npm run strava:explore -- --tile-limit=12 --segment-limit=40
npm run strava:explore -- --max-depth=4 --min-gap-ms=10000
```

## Output

The generated file includes:

- all enriched discovered candidates
- threshold pass/fail flags
- quality reasons and a simple score
- recommended featured segments for ride and run

Use that output to decide what should move into `src/lib/config/strava.ts`.

# Fairfax media bulletin transcriptions

Hand-verified transcriptions of two full Fairfax PD weekly media bulletins, the
ground truth for extraction tests and the T5 live accuracy gate.

| File                      | WP doc | WP title                           | PDF md5 (revision)                 | Pages | Incidents |
| ------------------------- | ------ | ---------------------------------- | ---------------------------------- | ----- | --------- |
| `bulletin-2026-09-16.tsv` | 42429  | Press log Sep 16th thru 22nd, 2026 | `ed6499205ab87dfae05044825b13b66e` | 8     | 124       |
| `bulletin-2026-09-09.tsv` | 42395  | Press log Sep 9th thru15th, 2026   | `b2e3fe3548d7abaf77c0d93e9e5884fc` | 8     | 124       |

- **Method (2026-09-29):** pages rendered at 130 dpi and transcribed twice,
  independently (two different models); the transcriptions were
  byte-identical for both bulletins. Every row on all 16 pages was then
  checked by hand against the page images (header, time, call type, incident
  number, officer-initiated, disposition, page span). No corrections were
  needed.
- **Format:** `#header <start> <end> <issued> <pages>`, then one TSV row per
  incident in document order: `incidentNo time callType officerInitiated
disposition startPage endPage`. `callType` and `disposition` are exactly as
  printed; `endPage` is where the disposition appears (entries may continue
  across a page break, e.g. `2609170031`).
- **Deliberately omitted:** locations and narratives. The pages describe
  private people's situations at residential addresses, every page is stamped
  "controlled document — do not duplicate", and this repository is public.

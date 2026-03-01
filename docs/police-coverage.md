# Marin Public Safety Coverage

Last updated: February 28, 2026

This is the working coverage map for official municipal and county law-enforcement sources used by Marin Monitor.

## Coverage map

| Area / town                       | Primary law-enforcement agency | Official source surface                             | Current ingestion status | Notes                                                                                          |
| --------------------------------- | ------------------------------ | --------------------------------------------------- | ------------------------ | ---------------------------------------------------------------------------------------------- |
| Unincorporated Marin / West Marin | Marin County Sheriff's Office  | Reported-crime open data, booking log, sheriff site | Live                     | Covers sheriff jurisdiction in unincorporated Marin, including West Marin communities.         |
| Larkspur                          | Central Marin Police Authority | CMPA Nixle alerts + police logs page                | Live                     | Official Nixle alerts are live; police logs on CMPA site remain in-person only.                |
| Corte Madera                      | Central Marin Police Authority | CMPA Nixle alerts + police logs page                | Live                     | Official Nixle alerts are live; police logs on CMPA site remain in-person only.                |
| San Anselmo                       | Central Marin Police Authority | CMPA Nixle alerts + police logs page                | Live                     | Official Nixle alerts are live; police logs on CMPA site remain in-person only.                |
| Fairfax                           | Fairfax Police Department      | Weekly press-log PDFs                               | Live                     | Official PDF feed; currently document-level only.                                              |
| Mill Valley                       | Mill Valley Police Department  | Weekly calls-for-service PDFs                       | Live                     | Official PDF feed; currently document-level only.                                              |
| Ross                              | Ross Police Department         | Monthly statistics PDFs                             | Live                     | Official PDF feed; currently document-level only.                                              |
| Tiburon                           | Tiburon Police Department      | CivicAlerts police stats + police releases          | Live                     | Machine-readable HTML; currently town-level placement in dashboard.                            |
| Belvedere                         | Belvedere Police Department    | Town posts + police department page                 | Live                     | Official Belvedere public-safety town posts are live; no dedicated recurring police log found. |
| Sausalito                         | Sausalito Police Department    | Nixle alerts + calls-for-service page               | Live                     | Nixle alerts are live; the calls-for-service page remains blocked to unattended fetches.       |
| San Rafael                        | San Rafael Police Department   | Nixle alerts + arrest-log page                      | Live                     | Nixle alerts are live; arrest-log HTML is reachable but does not expose actual entries.        |
| Novato                            | Novato Police Department       | Nixle alerts + crime-map page                       | Live                     | Nixle alerts are live; Community Crime Map remains a separate vendor/API decision.             |

## Source notes

- Sheriff jurisdiction: official sheriff reporting guidance explicitly limits online reporting to incidents in unincorporated Marin County and excludes incorporated city limits.
- Central Marin Police Authority: official site states it serves Larkspur, Corte Madera, and San Anselmo. Its public police-log page still points residents to in-person viewing, but the agency’s official Nixle feed is usable.
- Ross / Fairfax / Mill Valley: official municipal sites expose police PDFs directly enough for static ingestion.
- Tiburon: official CivicAlerts pages expose article titles, posted dates, and article bodies in HTML, so these are usable without OCR.
- Belvedere exists as its own department, but the current police department page does not expose a clear recurring blotter or stats feed; the dashboard currently uses official town public-safety posts instead.
- Sausalito, San Rafael, Novato, and Central Marin all expose public Nixle alert feeds that are accessible without login and suitable for official alert ingestion.

## Immediate next targets

1. Improve Central Marin town attachment beyond explicit town-name mentions so more CMPA alerts pin cleanly without false precision.
2. Add OCR or structured extraction for Fairfax, Mill Valley, and Ross PDFs so they become incident-level rather than document-level.
3. Revisit San Rafael’s arrest-log surface only if a structured endpoint appears; otherwise treat Nixle as the primary official alert source.
4. Decide whether a Community Crime Map integration is still worth doing for Novato now that official Nixle coverage is live.

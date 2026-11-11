# Load test

Run on 2026-11-03 against a local Postgres 16 with 5,000 vendors, 50,000 leads, 99,780 lead categories, 1,74,691 unlocks, 6,98,764 messages and 43,499 reviews (`scripts/load-seed.sql`). Median of six runs; target under 300 ms.

| Page | Query | Median ms | Rows |
| --- | --- | ---: | ---: |
| Listing | venues in Mohali, page 1 | 4.2 | 24 |
| Listing | count for the same | 1.3 | 1 |
| Listing | filter: Under 200 guests | 2.6 | 3 |
| Listing | sorted by rating | 3.7 | 24 |
| Listing | 4+ rated only | 3.5 | 24 |
| Profile | vendor by slug | 1.3 | 1 |
| Profile | reviews | 0.8 | 14 |
| Profile | similar vendors | 5.3 | 4 |
| Profile | demand note | 12.7 | 1 |
| Search | "banquet" | 30.5 | 0 |
| Search | "load vendor 42" | 7 | 12 |
| Ideas | gallery page | 6.2 | 0 |
| Vendor dashboard | leads to unlock | 47.4 | 200 |
| Vendor inbox | conversations | 3.8 | 57 |
| Conversation | messages | 0.7 | 4 |
| Vendor insights | 30 days | 32.7 | 1 |
| Bride inbox | conversations | 105.9 | 23 |
| Ops data | Vendors, page 1 | 10.1 | 50 |
| Ops data | Vendors, searched and filtered | 11.5 | 0 |
| Ops data | Leads, page 1 | 16.6 | 50 |
| Ops data | Leads, searched and filtered | 72.4 | 50 |
| Ops data | Lead categories, page 1 | 90.5 | 50 |
| Ops data | Lead categories, searched and filtered | 62.3 | 50 |
| Ops data | Conversations, page 1 | 109.7 | 50 |
| Ops data | Conversations, searched and filtered | 79.3 | 50 |
| Ops data | Reviews, page 1 | 34.9 | 50 |
| Ops data | Reviews, searched and filtered | 137.6 | 50 |
| Ask Olready | search_vendors tool | 3.2 | 1 |
| Ask Olready | price_guide tool | 61.2 | 1 |

Every query is under target.

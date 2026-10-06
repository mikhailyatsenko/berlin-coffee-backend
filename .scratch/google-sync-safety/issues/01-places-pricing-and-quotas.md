# Places API (New) pricing and quota facts for the Google sync

Type: research
Status: resolved
Blocked by:

## Question

What do the current official Google Maps Platform docs say about:

1. Which SKU a Place Details (New) request with field mask `id,businessStatus,regularOpeningHours.weekdayDescriptions,internationalPhoneNumber,websiteUri` is billed under, and that SKU's free monthly allowance. Would splitting the mask (e.g. dropping or isolating a field) move most requests to a cheaper SKU with a bigger free allowance?
2. Whether the free allowance is per SKU per billing account per calendar month, and when it resets (timezone).
3. Which responses are billed (404, 429, 4xx/5xx errors).
4. How to set a hard cap in Google Cloud: which quota on Places API (New) limits Place Details per day (or per minute), whether that quota also limits Text Search (used for free by `findGoogleIdsForSuggestion` with field mask `places.id`), and what the API returns once the cap is hit.
5. Whether there is any way to read the number of billable Place Details requests used this month (Metrics, Billing reports, an API), and how fresh it is.

Cite primary sources (developers.google.com/maps docs, pricing pages) with dates.

## Answer

Checked 2026-10-06 against developers.google.com / docs.cloud.google.com pages last updated 2026-10-05.

1. The sync's mask is billed as one **Place Details Enterprise** event per request (billed at the highest field SKU; hours, phone and website are Enterprise). Free cap 1,000/month, then $20.00/1000 (from 100k: $16). The current doc is correct. Splitting can't make the Enterprise fields cheaper: `id` alone is IDs Only (unlimited free) and `businessStatus` alone is Pro (5,000 free, $17/1000). Splitting only helps if the Enterprise pass runs less often.
2. Free usage is per SKU, summed over all projects on the billing account, per calendar month. It resets on the 1st at **00:00 US Pacific** (about 09:00 Berlin).
3. Billed: OK, and **NOT_FOUND (404 Place ID not found)**. The reporting docs call it billable for Places, although the SKU page says "successful request". INVALID_REQUEST with an invalid value is billed too. Not billed: 429 (OVER_QUERY_LIMIT/RESOURCE_EXHAUSTED), REQUEST_DENIED, malformed requests. 5xx counts against quota, and the docs don't say whether it's billed.
4. Places API (New) has a separate quota per method per project, so a cap on Place Details does not limit Text Search. A per-day cap is possible "depending on the API", resets at midnight Pacific, and isn't exact (allow a buffer). Once the cap is hit the API returns HTTP 429. **No public doc lists Places API (New) quota names, or says whether a per-day quota exists for GetPlace (or only per-minute). Check in the console.** Budgets never cap.
5. Billable usage by SKU is in the GMP console and Cloud Billing reports, with up to 48 h lag. The Quotas page is real-time but "not a source of truth for billing". Metrics and Cloud Monitoring (`maps.googleapis.com/service/request_count`) give request counts per method and response code, which work as a proxy. No Maps API exposes billable events. The script's own ledger stays the real-time count.

Full findings: branch `research/places-pricing-and-quotas`, file `.scratch/google-sync-safety/research/places-pricing-and-quotas.md`.

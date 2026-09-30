Status: needs-triage

## Problem

The frontend's Filters panel (`Features (meets all selected)`) renders one pill per
distinct `availableAdditionalInfoTags` string, straight from the raw Google Places
"additional info" data, with no normalization. A live count on https://3welle.com
found ~145 distinct tags, alphabetically listed, and real near-duplicate pairs
that split the same real-world feature across two labels — selecting one misses
Places tagged with the other:

- "Bar on site" / "Bar onsite"
- "Cash only" / "Cash-only"
- "Checks" / "Cheques"
- "Cosy" / "Cozy"
- "Family friendly" / "Family-friendly"
- "Happy hour drinks" / "Happy-hour drinks"
- "Happy hour food" / "Happy-hour food"
- "In-store pick-up" / "In-store pickup"
- "On-site services" / "Onsite services"
- "Transgender safe space" / "Transgender safespace"
- "Wheelchair accessible entrance" / "Wheelchair-accessible entrance"
- "Wheelchair accessible seating" / "Wheelchair-accessible seating"

Parking alone is fragmented across ~10 near-synonymous tags (On-site parking,
Free multi-storey car park, Free of charge street parking, Free parking lot,
Free street parking, Paid multi-storey car park, Paid parking garage, Paid
parking lot, Paid street parking, Plenty of parking, Valet parking,
Wheelchair-accessible car park) — not necessarily all true duplicates of each
other, but worth a second look for further splitting.

This list was found by eyeballing the live panel, not by a programmatic
diff — there may be more near-duplicate pairs than the ones listed above.

## Why

Found while resolving [Filters and search UX](../../../berlincoffeemap/.scratch/ui-ux-audit/issues/06-filters-and-search-ux.md)
on berlincoffeemap's UI/UX audit map (`.scratch/ui-ux-audit/map.md`). The
frontend ticket's own fix (a search box + "common features" collapsing in the
Features list) helps discoverability but does nothing for the duplicate-tag
problem — two pills that should be one filter stay two pills either way.

## What the frontend needs

Each real-world feature (e.g. "accepts cash only", "has a bar on site") to be
covered by exactly one tag string in `availableAdditionalInfoTags`, so a Guest
selecting it doesn't silently miss Places tagged with a spelling variant.

## Open questions (not decided on the frontend side)

- Which spelling/form is canonical for each duplicate pair (e.g. "Cash-only"
  vs. "Cash only") — no preference was set during the audit.
- Whether this is a one-off data migration (rewrite existing Place documents to
  merge tags) or needs an ongoing normalization step in whatever pipeline writes
  `additionalInfo` from Google Places data, so future syncs don't reintroduce
  duplicates.
- Whether the ~10 parking-related tags are true duplicates of each other or
  distinct-enough facts (e.g. "free" vs. "paid", "street" vs. "garage") that
  should stay separate — needs a domain call, not assumed here.
- Full inventory: the pairs above came from a manual read of the live panel: a
  full duplicate/near-duplicate audit of all ~145 tags hasn't been done.

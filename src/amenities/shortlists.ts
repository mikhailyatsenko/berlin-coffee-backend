/**
 * The Shortlists of a Neighborhood: the id, the order and the Amenities of
 * each. A Place makes a Shortlist when it has all of its Amenities, each one
 * through its synonyms (see synonyms.ts). The frontend owns the titles, the
 * anchors and the card questions.
 *
 * Amenities are canonical names, spelled as Google lists them in
 * availableAdditionalInfoTags. To add a Shortlist (Kids, Vegan), add a row and
 * the id to the ShortlistId enum in the schema.
 */
export const SHORTLISTS = [
  { id: "work", amenities: ["Good for working on laptop", "Wi-Fi"] },
  { id: "dogFriendly", amenities: ["Dogs allowed"] },
  { id: "outdoorSeating", amenities: ["Outdoor seating"] },
  { id: "breakfastBrunch", amenities: ["Breakfast"] },
] as const;

/** Places on a Shortlist's `places`; `total` counts them all. */
export const SHORTLIST_PLACES_LIMIT = 5;

/** A Place needs at least this Average rating to make a Shortlist. */
export const SHORTLIST_MIN_RATING = 4;

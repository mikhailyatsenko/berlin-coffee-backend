/**
 * Amenities Google spells in more than one way. Each group lists every
 * spelling of one Amenity, the canonical name first: the spelling on the most
 * Places (the count after each name). A name in no group stands for itself.
 *
 * Built from the 145 names of availableAdditionalInfoTags against production,
 * checked on 2026-09-26. Re-check when a Google import brings new names.
 * Close but different Amenities stay apart: Good for kids / Family-friendly,
 * Quick bite / Quick visit, Paid Wi-Fi / Wi-Fi, Dessert / Great dessert.
 */
const SYNONYM_GROUPS: readonly (readonly string[])[] = [
  ["Wi-Fi", "Free Wi-Fi"], // 153, 149
  ["Cozy", "Cosy"], // 221, 105
  ["Breakfast", "Brunch"], // 292, 112
  ["Dogs allowed", "Dogs allowed outside", "Dogs allowed inside"], // 173, 59, 52
  ["Takeout", "Takeaway"], // 241, 119
  ["Restroom", "Toilet"], // 170, 103
  ["Family-friendly", "Family friendly"], // 90, 52
  ["College students", "University students"], // 89, 45
  ["Transgender safespace", "Transgender safe space"], // 69, 48
  ["Gender-neutral restroom", "Gender-neutral toilets"], // 62, 34
  ["Onsite services", "On-site services"], // 62, 29
  ["Curbside pickup", "Kerbside pickup"], // 50, 36
  ["Bar onsite", "Bar on site"], // 48, 23
  ["Hard liquor", "Spirits"], // 36, 11
  ["In-store pickup", "In-store pick-up"], // 17, 14
  ["Cash-only", "Cash only"], // 10, 4
  ["Checks", "Cheques"], // 3, 2
  ["Happy hour food", "Happy-hour food"], // 9, 2
  // A tie: the spelling that wins for Happy hour food.
  ["Happy hour drinks", "Happy-hour drinks"], // 4, 4
  ["Wheelchair accessible entrance", "Wheelchair-accessible entrance"], // 132, 66
  ["Wheelchair accessible seating", "Wheelchair-accessible seating"], // 103, 59
  // A tie: the spelling that matches Restroom.
  ["Wheelchair accessible restroom", "Wheelchair-accessible toilet"], // 25, 25
  ["Wheelchair accessible parking lot", "Wheelchair-accessible car park"], // 19, 18
  ["Free street parking", "Free of charge street parking"], // 30, 19
  ["Paid parking garage", "Paid multi-storey car park"], // 8, 3
  ["Usually plenty of parking", "Plenty of parking"], // 13, 10
  [
    "Usually somewhat difficult to find a space",
    "Somewhat difficult to find a space",
  ], // 24, 7
  ["Usually difficult to find a space", "Difficult to find a space"], // 11, 8
  // A tie: the plural, as Google spells most of its names.
  ["Sports", "Sport"], // 1, 1
];

const groupOf = new Map<string, readonly string[]>(
  SYNONYM_GROUPS.flatMap((group) => group.map((name) => [name, group])),
);

/** Every spelling of the Amenity `name` stands for, `name` included. */
export function amenitySpellings(name: string): readonly string[] {
  return groupOf.get(name) ?? [name];
}

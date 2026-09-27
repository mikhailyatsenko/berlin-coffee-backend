/**
 * Berlin geography for publishing a Place suggestion: coordinates must fall
 * inside the city, and the Neighborhood must be one of its twelve Bezirke,
 * spelled the way Places already store them (`normalizeNeighborhood`,
 * CONTEXT.md: Neighborhood).
 */

export const BERLIN_BOUNDS = {
  minLat: 52.33,
  maxLat: 52.68,
  minLng: 13.08,
  maxLng: 13.77,
} as const;

export function isInsideBerlin(lat: number, lng: number): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= BERLIN_BOUNDS.minLat &&
    lat <= BERLIN_BOUNDS.maxLat &&
    lng >= BERLIN_BOUNDS.minLng &&
    lng <= BERLIN_BOUNDS.maxLng
  );
}

/** Berlin's twelve Bezirke, spelled as Places already store the Neighborhood. */
export const BERLIN_NEIGHBORHOODS = [
  "Mitte",
  "Friedrichshain-Kreuzberg",
  "Pankow",
  "Charlottenburg-Wilmersdorf",
  "Spandau",
  "Steglitz-Zehlendorf",
  "Tempelhof-Schöneberg",
  "Neukölln",
  "Treptow-Köpenick",
  "Marzahn-Hellersdorf",
  "Lichtenberg",
  "Reinickendorf",
] as const;

export function isBerlinNeighborhood(value: string): boolean {
  return (BERLIN_NEIGHBORHOODS as readonly string[]).includes(value);
}

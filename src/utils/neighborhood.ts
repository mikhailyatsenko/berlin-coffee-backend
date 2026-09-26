/**
 * The slug `friedrichshain-kreuzberg` becomes `Friedrichshain-Kreuzberg`, the
 * spelling stored on a Place. Absent or empty input is returned as it came.
 */
export function normalizeNeighborhood(input?: string[]): string[] | undefined {
  if (!input || input.length === 0) return input;
  return input.map((neighborhood) =>
    neighborhood
      .trim()
      .split("-")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join("-"),
  );
}

import type { Characteristic } from "../graphql/generated/types.js";

/** The Characteristics a Review marked, in the order its record lists them. */
export function markedCharacteristics(
  characteristics: Partial<Record<Characteristic, boolean>> | null | undefined,
): Characteristic[] {
  const record = characteristics ?? {};
  // Object.keys widens to string[]; the record's keys are Characteristics.
  return (Object.keys(record) as Characteristic[]).filter((key) => record[key]);
}

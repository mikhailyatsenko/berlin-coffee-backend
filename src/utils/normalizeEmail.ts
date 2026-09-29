/**
 * The canonical form of an email address: every write and every lookup goes
 * through it, so the same address typed in another case is the same User.
 */
export const normalizeEmail = (email: string): string =>
  email.trim().toLowerCase();

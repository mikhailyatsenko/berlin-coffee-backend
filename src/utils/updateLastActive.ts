import User, { IUser } from "../models/User.js";

export const LAST_ACTIVE_DEBOUNCE_MS = 60 * 1000;

interface UpdateLastActiveOptions {
  /** Write even if `lastActive` is recent, as on sign-in. */
  force?: boolean;
}

/**
 * Records that the User was active, at most once per minute. The write is
 * conditional on the stored value, so parallel requests don't all write, and a
 * failure is logged rather than failing the request it rides on.
 */
export async function updateLastActive(
  user: IUser | null | undefined,
  options?: UpdateLastActiveOptions,
) {
  if (!user) {
    return;
  }

  const now = new Date();
  const staleBefore = new Date(now.getTime() - LAST_ACTIVE_DEBOUNCE_MS);
  const force = Boolean(options?.force);

  if (!force && user.lastActive && user.lastActive > staleBefore) {
    return;
  }

  const filter = force
    ? { _id: user._id }
    : {
        _id: user._id,
        $or: [{ lastActive: null }, { lastActive: { $lte: staleBefore } }],
      };

  try {
    await User.updateOne(filter, { $set: { lastActive: now } });
    user.lastActive = now;
  } catch (error) {
    console.error(`Failed to update lastActive for User ${user.id}:`, error);
  }
}

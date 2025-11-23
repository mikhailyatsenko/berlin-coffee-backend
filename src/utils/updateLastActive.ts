import { IUser } from "../models/User.js";

export const LAST_ACTIVE_DEBOUNCE_MS = 60 * 1000;

interface UpdateLastActiveOptions {
    force?: boolean;
    debounceMs?: number;
}

export async function updateLastActive(
    user: IUser | null | undefined,
    options?: UpdateLastActiveOptions,
) {
    if (!user) {
        return;
    }

    const now = new Date();
    const debounceMs = options?.debounceMs ?? LAST_ACTIVE_DEBOUNCE_MS;
    const shouldForce = Boolean(options?.force);

    const shouldUpdate =
        shouldForce ||
        !user.lastActive ||
        now.getTime() - user.lastActive.getTime() >= debounceMs;

    if (!shouldUpdate) {
        return;
    }

    user.lastActive = now;
    await user.save({ validateBeforeSave: false });
}


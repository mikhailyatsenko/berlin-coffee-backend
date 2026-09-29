import type { Request, Response } from "express";
import type { IUser } from "../models/User.js";
import type { GuestContext } from "../utils/guestAuth.js";
import { unauthenticated } from "./errors.js";

export interface Context {
  user?: IUser | null;
  /** Absent for signed-in users: an account always wins over guest headers. */
  guest?: GuestContext;
  req?: Request;
  res: Response;
}

/**
 * The guard for operations that mean nothing without a User. `context.user` is
 * already the loaded User document, so there is nothing to look up again.
 */
export function requireUser(context: Context): IUser {
  if (!context.user) throw unauthenticated();
  return context.user;
}

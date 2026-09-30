import type { Request, Response } from "express";

export type Cookies = { jwt?: string; refreshToken?: string };

/** A response that records what the server does to the auth cookies. */
export function fakeResponse() {
  const set: Cookies = {};
  const cleared: string[] = [];
  const res = {
    cookie: (name: keyof Cookies, value: string) => {
      set[name] = value;
    },
    clearCookie: (name: string) => {
      cleared.push(name);
    },
  } as unknown as Response;
  return { res, set, cleared };
}

/** A request carrying only these cookies. */
export const fakeRequest = (cookies: Cookies) =>
  ({ cookies, headers: {}, get: () => undefined }) as unknown as Request;

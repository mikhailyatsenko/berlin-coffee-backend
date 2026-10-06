/**
 * A fake Google Place Details for Google sync tests: replaces the global
 * `fetch`, answers per Google Place ID and records every call. Same approach
 * as the Text Search fake in the Place suggestion tests.
 *
 * Call useFakeGoogle() at the top level of the test file; it restores the
 * real `fetch` after the tests. An ID nobody set up answers 404, like Google.
 */
import { after } from "node:test";

type Answer = { status: number; body?: unknown } | "hang";

export interface GoogleCall {
  url: string;
  /** The Google Place ID taken from the URL path. */
  googleId: string;
  apiKey: string | undefined;
  fieldMask: string | undefined;
}

export function useFakeGoogle() {
  const answers = new Map<string, Answer>();
  const calls: GoogleCall[] = [];

  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    const headers = (init?.headers ?? {}) as Record<string, string>;
    const googleId = decodeURIComponent(new URL(url).pathname.split("/").pop()!);
    calls.push({
      url,
      googleId,
      apiKey: headers["X-Goog-Api-Key"],
      fieldMask: headers["X-Goog-FieldMask"],
    });
    const answer = answers.get(googleId) ?? { status: 404 };
    if (answer === "hang") return new Promise<Response>(() => {});
    const { status, body = {} } = answer;
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
      text: async () => JSON.stringify(body),
    } as Response;
  }) as typeof fetch;

  after(() => {
    globalThis.fetch = originalFetch;
  });

  return {
    calls,
    /** Google answers 200 with this Place body (its `id` defaults to `googleId`). */
    place(googleId: string, body: Record<string, unknown> = {}) {
      answers.set(googleId, { status: 200, body: { id: googleId, ...body } });
    },
    /** Google answers this status (404, 429, 500…) with an error body. */
    status(googleId: string, status: number) {
      answers.set(googleId, { status, body: { error: { code: status } } });
    },
    /** Google never answers: the run hangs mid-flight, like a killed process. */
    hang(googleId: string) {
      answers.set(googleId, "hang");
    },
    reset() {
      answers.clear();
      calls.length = 0;
    },
  };
}

import { OPENCODE_PASSWORD, OPENCODE_URL } from "./config";

/** Basic-auth headers for the opencode v2 API (empty when no password is set). */
export function ocAuthHeaders(): Record<string, string> {
  if (!OPENCODE_PASSWORD) return {};
  return {
    authorization: "Basic " + Buffer.from(`opencode:${OPENCODE_PASSWORD}`).toString("base64"),
  };
}

/** URLSearchParams carrying opencode v2's `location[directory]` filter. */
export function locationParams(directory?: string | null): URLSearchParams {
  const q = new URLSearchParams();
  if (directory) q.set("location[directory]", directory);
  return q;
}

export function ocUrl(path: string, query?: URLSearchParams): string {
  const base = path.startsWith("/") ? path : `/${path}`;
  const qs = query && query.toString() ? `?${query.toString()}` : "";
  return OPENCODE_URL + base + qs;
}

export async function ocFetch(
  path: string,
  init: RequestInit = {},
  query?: URLSearchParams,
): Promise<Response> {
  const headers = new Headers(init.headers ?? {});
  for (const [k, v] of Object.entries(ocAuthHeaders())) headers.set(k, v);
  return fetch(ocUrl(path, query), { ...init, headers, redirect: "manual" });
}

export async function ocJson<T = any>(
  path: string,
  init: RequestInit = {},
  query?: URLSearchParams,
): Promise<T> {
  const res = await ocFetch(path, init, query);
  const text = await res.text();
  let body: any = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { raw: text };
  }
  if (!res.ok) {
    const message =
      body?.message ?? body?.error?.message ?? body?.error ?? `opencode ${res.status}`;
    throw new Error(String(message));
  }
  return body as T;
}

/** Unwrap v2's `{ location, data }` envelope. */
export async function ocData<T = any>(
  path: string,
  init: RequestInit = {},
  query?: URLSearchParams,
): Promise<T> {
  const body = await ocJson<any>(path, init, query);
  return (body && typeof body === "object" && "data" in body ? body.data : body) as T;
}

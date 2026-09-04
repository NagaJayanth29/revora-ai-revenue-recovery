/**
 * Client fetch for live REVORA data — never use HTTP/browser cache.
 * Also dispatches/listens for post-mutation refresh.
 */
export async function fetchLive<T = unknown>(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<T> {
  const res = await fetch(input, {
    ...init,
    cache: "no-store",
    headers: {
      ...(init?.headers || {}),
      "Cache-Control": "no-cache",
    },
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(
      (data && typeof data === "object" && "error" in data && String((data as { error: string }).error)) ||
        `Request failed (${res.status})`
    );
  }
  return data as T;
}

export const REVORA_DATA_CHANGED = "revora:data-changed";

export function notifyRevoraDataChanged(detail?: Record<string, unknown>) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(REVORA_DATA_CHANGED, { detail }));
}

export function onRevoraDataChanged(handler: () => void) {
  if (typeof window === "undefined") return () => {};
  const fn = () => handler();
  window.addEventListener(REVORA_DATA_CHANGED, fn);
  window.addEventListener("focus", fn);
  return () => {
    window.removeEventListener(REVORA_DATA_CHANGED, fn);
    window.removeEventListener("focus", fn);
  };
}

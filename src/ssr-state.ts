/**
 * State serialization helpers for SSR.
 *
 * The server renders with its own signal instances; the client must
 * recreate the same initial values before hydrating. The convenient path
 * is the `state` option of `renderToString(Async)` / `hydrate`, which
 * reads and restores signal values automatically. These two functions
 * are the manual building blocks (e.g. for custom restore logic around
 * URLs or localStorage).
 */

/**
 * Serialize application state for embedding in a page.
 *
 * "<" is escaped so a hostile string can never break out of the
 * surrounding <script> tag.
 */
export function serializeState<T extends object>(state: T): string {
  return JSON.stringify(state).replace(/</g, "\\u003c");
}

/**
 * Read state serialized by `serializeState` from a page element.
 *
 * Returns null when the element is missing or the JSON is malformed -
 * callers decide the fallback.
 */
export function deserializeState<T = Record<string, unknown>>(
  element: Element | null,
): T | null {
  if (!element) return null;
  try {
    return JSON.parse(element.textContent ?? "") as T;
  } catch {
    return null;
  }
}

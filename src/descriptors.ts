/**
 * Plugin descriptor brand symbols, in a leaf module so the SSR renderer
 * and the hydration module can detect descriptors without importing the
 * plugin modules (which would create import cycles). @internal
 */

/** @internal each() descriptor brand. */
export const EACH = Symbol("each");

/** @internal match()/when() descriptor brand. */
export const MATCH = Symbol("match");

/** @internal memo() descriptor brand. */
export const MEMO = Symbol("memo");

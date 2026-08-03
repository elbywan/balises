/**
 * SSR marker constants shared between the SSR renderer (src/ssr.ts) and
 * the client hydration logic (Template.hydrate).
 *
 * Content slots are emitted as:
 *   <!--b--> <content> <!--/b-->
 *
 * where `<!--b-->` separates the dynamic content from the preceding
 * static text (preventing text-node merging) and `<!--/b-->` is the
 * slot's anchor comment - it sits at the same position as the client
 * prototype's binding marker, so `insertBefore(anchor)` semantics match.
 *
 * `each()` rows are separated by `<!--k-->` boundary markers.
 */

/** @internal Data of the content-open marker comment. */
export const SSR_OPEN = "b";

/** @internal Data of the content-close (anchor) marker comment. */
export const SSR_CLOSE = "/b";

/** @internal Data of the each-row boundary marker comment. */
export const SSR_ROW = "k";

/**
 * Registry of template internals (strings + values) for the SSR renderer
 * and the hydration module, kept out of the core class surface.
 * @internal
 */
export const ssrTemplateData = new WeakMap<
  object,
  [TemplateStringsArray, unknown[]]
>();

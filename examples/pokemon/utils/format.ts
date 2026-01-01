/**
 * Formatting Utilities
 *
 * Common string formatting and display helpers.
 */

/**
 * Capitalize the first letter of a string.
 * Example: "bulbasaur" → "Bulbasaur"
 */
export function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Format a hyphenated name for display.
 * Example: "vine-whip" → "Vine Whip"
 */
export function formatName(s: string): string {
  return s
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

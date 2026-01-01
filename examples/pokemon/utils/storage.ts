/**
 * LocalStorage Utilities
 *
 * Provides type-safe persistence for app state including favorites,
 * language preferences, and battle roster.
 */

import type { FavoritePokemon } from "../types.js";

// ============================================================================
// CONSTANTS
// ============================================================================

/** LocalStorage keys used by the app */
export const STORAGE_KEYS = {
  FAVORITES: "pokemon-favorites",
  LANGUAGE: "pokemon-language",
  ROSTER: "pokemon-roster",
} as const;

/** Default roster Pokemon IDs (mix of popular Pokemon across generations) */
export const DEFAULT_ROSTER_IDS: readonly number[] = [
  // Gen 1 Starters & Classics
  1, 4, 7, 25, 6, 9, 3, 131, 143, 149,
  // Gen 1 Favorites
  94, 130, 65, 59, 76, 103, 112, 123,
  // Gen 2-3
  196, 197, 212, 214, 229, 230, 248, 257,
  // Gen 4
  445, 448, 466, 468, 473, 475, 477, 479,
];

/** Maximum number of Pokemon allowed in the roster */
export const MAX_ROSTER_SIZE = 60;

// ============================================================================
// FAVORITES
// ============================================================================

/** Type guard to validate FavoritePokemon structure */
function isValidFavorite(item: unknown): item is FavoritePokemon {
  return (
    typeof item === "object" &&
    item !== null &&
    typeof (item as FavoritePokemon).id === "number" &&
    typeof (item as FavoritePokemon).name === "string" &&
    typeof (item as FavoritePokemon).sprite === "string"
  );
}

/** Load favorites from localStorage with validation */
export function loadFavorites(): FavoritePokemon[] {
  try {
    const saved = localStorage.getItem(STORAGE_KEYS.FAVORITES);
    if (saved) {
      const parsed: unknown = JSON.parse(saved);
      if (Array.isArray(parsed)) {
        return parsed.filter(isValidFavorite);
      }
    }
  } catch (e) {
    console.warn("Failed to load favorites:", e);
  }
  return [];
}

// ============================================================================
// ROSTER
// ============================================================================

/** Load roster from localStorage with validation, returns default roster if invalid */
export function loadRoster(): number[] {
  try {
    const saved = localStorage.getItem(STORAGE_KEYS.ROSTER);
    if (saved) {
      const parsed: unknown = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length > 0) {
        const validIds = parsed.filter(
          (item): item is number =>
            typeof item === "number" && Number.isInteger(item) && item > 0,
        );
        if (validIds.length > 0) {
          return validIds;
        }
      }
    }
  } catch (e) {
    console.warn("Failed to load roster:", e);
  }
  return [...DEFAULT_ROSTER_IDS];
}

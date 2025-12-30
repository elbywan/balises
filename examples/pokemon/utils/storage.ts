/**
 * LocalStorage helper utilities for persistent data
 */

import type { FavoritePokemon } from "../types.js";

const STORAGE_KEYS = {
  FAVORITES: "pokemon-favorites",
  LANGUAGE: "pokemon-language",
} as const;

/**
 * Save favorites to localStorage
 */
export function saveFavorites(favorites: FavoritePokemon[]): void {
  try {
    localStorage.setItem(STORAGE_KEYS.FAVORITES, JSON.stringify(favorites));
  } catch (e) {
    console.error("Failed to save favorites:", e);
  }
}

/**
 * Load favorites from localStorage
 */
export function loadFavorites(): FavoritePokemon[] {
  try {
    const saved = localStorage.getItem(STORAGE_KEYS.FAVORITES);
    if (saved) {
      return JSON.parse(saved);
    }
  } catch (e) {
    console.error("Failed to load favorites:", e);
  }
  return [];
}

/**
 * Save language preference to localStorage
 */
export function saveLanguage(language: string): void {
  try {
    localStorage.setItem(STORAGE_KEYS.LANGUAGE, language);
  } catch (e) {
    console.error("Failed to save language:", e);
  }
}

/**
 * Load language preference from localStorage
 */
export function loadLanguage(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEYS.LANGUAGE);
  } catch (e) {
    console.error("Failed to load language:", e);
    return null;
  }
}

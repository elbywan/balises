/**
 * PokeAPI access for the SSR example.
 *
 * The same endpoints as the pokemon example (api/v2) are used; requests
 * happen at build time inside async generators, so the shipped page
 * contains the fetched data while the client hydrates without refetching.
 */

export interface Pokemon {
  id: number;
  name: string;
  types: string[];
  sprite: string;
  stats: {
    hp: number;
    attack: number;
    defense: number;
    specialAttack: number;
    specialDefense: number;
    speed: number;
  };
}

export interface PokemonDetail extends Pokemon {
  flavor: string;
}

/** Roster ids, matching the original pokemon example. */
export const ROSTER_IDS: readonly number[] = [
  // Gen 1 Starters & Classics
  1, 4, 7, 25, 6, 9, 3, 131, 143, 149,
  // Gen 1 Favorites
  94, 130, 65, 59, 76, 103, 112, 123,
  // Gen 2-3
  196, 197, 212, 214, 229, 230, 248, 257,
  // Gen 4
  445, 448, 466, 468, 473, 475, 477, 479,
];

const BASE_URL = "https://pokeapi.co/api/v2";

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`PokeAPI request failed (${response.status}): ${url}`);
  }
  return (await response.json()) as T;
}

interface RawPokemon {
  id: number;
  name: string;
  sprites: { front_default: string | null };
  types: { type: { name: string } }[];
  stats: { base_stat: number; stat: { name: string } }[];
}

interface RawSpecies {
  flavor_text_entries: { language: { name: string }; flavor_text: string }[];
}

/** Fetch one Pokémon (name, sprite, types, base stats). */
export async function fetchPokemon(id: number): Promise<Pokemon> {
  const data = await fetchJson<RawPokemon>(`${BASE_URL}/pokemon/${id}`);
  const stat = (name: string) =>
    data.stats.find((s) => s.stat.name === name)?.base_stat ?? 0;
  return {
    id: data.id,
    name: data.name,
    types: data.types.map((t) => t.type.name),
    sprite:
      data.sprites.front_default ??
      `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${id}.png`,
    stats: {
      hp: stat("hp"),
      attack: stat("attack"),
      defense: stat("defense"),
      specialAttack: stat("special-attack"),
      specialDefense: stat("special-defense"),
      speed: stat("speed"),
    },
  };
}

/** Fetch the English flavor text for a Pokémon. */
export async function fetchSpecies(id: number): Promise<{ flavor: string }> {
  const data = await fetchJson<RawSpecies>(`${BASE_URL}/pokemon-species/${id}`);
  const entry = data.flavor_text_entries.find((e) => e.language.name === "en");
  // Flavor text is split across lines with form feeds; normalize.
  return { flavor: (entry?.flavor_text ?? "").replace(/[\f\n\r]+/g, " ") };
}

/** Fetch the full roster in parallel. */
export async function fetchRoster(): Promise<Pokemon[]> {
  return Promise.all(ROSTER_IDS.map((id) => fetchPokemon(id)));
}

/** Type filter chips derived from the fetched roster (stable order). */
export function deriveTypes(roster: Pokemon[]): string[] {
  const types = new Set<string>();
  for (const p of roster) for (const t of p.types) types.add(t);
  return [...types].sort();
}

/** Stat rows for the detail panel: [stat key, display label]. */
export const STAT_LABELS: [keyof Pokemon["stats"], string][] = [
  ["hp", "HP"],
  ["attack", "Attack"],
  ["defense", "Defense"],
  ["specialAttack", "Sp. Atk"],
  ["specialDefense", "Sp. Def"],
  ["speed", "Speed"],
];

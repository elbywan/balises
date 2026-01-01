/**
 * Move Data - Pokemon battle moves organized by type
 *
 * This file contains all move definitions extracted from the battle service.
 * Uses factory functions to reduce boilerplate.
 */

import type { Move, PokemonType, MoveEffect } from "../types.js";
import { formatName } from "../utils/format.js";

// =============================================================================
// Move Factory Functions
// =============================================================================

/** Create a basic move with common defaults */
function move(
  name: string,
  type: PokemonType,
  power: number,
  pp: number,
  category: "physical" | "special",
  options: { accuracy?: number; effect?: MoveEffect } = {},
): Move {
  const base: Move = {
    name,
    displayName: formatName(name),
    type,
    power,
    accuracy: options.accuracy ?? 100,
    pp,
    maxPp: pp,
    category,
  };
  if (options.effect) {
    base.effect = options.effect;
  }
  return base;
}

/** Create a status move (no damage) */
function statusMove(
  name: string,
  type: PokemonType,
  pp: number,
  effect: MoveEffect,
  accuracy = 100,
): Move {
  return {
    name,
    displayName: formatName(name),
    type,
    power: 0,
    accuracy,
    pp,
    maxPp: pp,
    category: "status",
    effect,
  };
}

// =============================================================================
// Effect Factories
// =============================================================================

/** Status condition effect (burn, paralyze, poison) */
const status = (
  condition: "burn" | "paralyze" | "poison",
  chance: number,
): MoveEffect => ({
  type: "status_condition",
  target: "opponent",
  condition,
  chance,
});

/** Stat change effect */
const statChange = (
  target: "self" | "opponent",
  stat: "attack" | "defense" | "speed",
  stages: number,
): MoveEffect => ({
  type: "stat_change",
  target,
  stat,
  stages,
});

/** Heal effect (heals % of damage dealt) */
const heal = (healPercent: number): MoveEffect => ({
  type: "heal",
  target: "self",
  healPercent,
});

// =============================================================================
// Type Moves
// =============================================================================

export const TYPE_MOVES: Record<PokemonType, Move[]> = {
  normal: [
    move("tackle", "normal", 40, 35, "physical"),
    move("quick-attack", "normal", 40, 30, "physical"),
    move("body-slam", "normal", 85, 15, "physical", {
      effect: status("paralyze", 30),
    }),
    move("hyper-beam", "normal", 150, 5, "special", { accuracy: 90 }),
  ],

  fire: [
    move("ember", "fire", 40, 25, "special", { effect: status("burn", 10) }),
    move("fire-punch", "fire", 75, 15, "physical", {
      effect: status("burn", 10),
    }),
    move("flamethrower", "fire", 90, 15, "special", {
      effect: status("burn", 10),
    }),
    move("fire-blast", "fire", 110, 5, "special", {
      accuracy: 85,
      effect: status("burn", 10),
    }),
  ],

  water: [
    move("water-gun", "water", 40, 25, "special"),
    move("bubble-beam", "water", 65, 20, "special"),
    move("surf", "water", 90, 15, "special"),
    move("hydro-pump", "water", 110, 5, "special", { accuracy: 80 }),
  ],

  electric: [
    move("thunder-shock", "electric", 40, 30, "special", {
      effect: status("paralyze", 10),
    }),
    move("spark", "electric", 65, 20, "physical", {
      effect: status("paralyze", 30),
    }),
    move("thunderbolt", "electric", 90, 15, "special", {
      effect: status("paralyze", 10),
    }),
    move("thunder", "electric", 110, 10, "special", {
      accuracy: 70,
      effect: status("paralyze", 30),
    }),
  ],

  grass: [
    move("vine-whip", "grass", 45, 25, "physical"),
    move("razor-leaf", "grass", 55, 25, "physical", { accuracy: 95 }),
    move("energy-ball", "grass", 90, 10, "special"),
    move("solar-beam", "grass", 120, 10, "special"),
  ],

  ice: [
    move("powder-snow", "ice", 40, 25, "special"),
    move("ice-punch", "ice", 75, 15, "physical"),
    move("ice-beam", "ice", 90, 10, "special"),
    move("blizzard", "ice", 110, 5, "special", { accuracy: 70 }),
  ],

  fighting: [
    move("karate-chop", "fighting", 50, 25, "physical"),
    move("brick-break", "fighting", 75, 15, "physical"),
    move("close-combat", "fighting", 120, 5, "physical"),
    move("focus-blast", "fighting", 120, 5, "special", { accuracy: 70 }),
  ],

  poison: [
    move("poison-sting", "poison", 15, 35, "physical", {
      effect: status("poison", 30),
    }),
    move("sludge", "poison", 65, 20, "special", {
      effect: status("poison", 30),
    }),
    move("sludge-bomb", "poison", 90, 10, "special", {
      effect: status("poison", 30),
    }),
    move("gunk-shot", "poison", 120, 5, "physical", {
      accuracy: 80,
      effect: status("poison", 30),
    }),
  ],

  ground: [
    move("mud-slap", "ground", 20, 10, "special"),
    move("dig", "ground", 80, 10, "physical"),
    move("earthquake", "ground", 100, 10, "physical"),
    move("earth-power", "ground", 90, 10, "special"),
  ],

  flying: [
    move("gust", "flying", 40, 35, "special"),
    move("wing-attack", "flying", 60, 35, "physical"),
    move("air-slash", "flying", 75, 15, "special", { accuracy: 95 }),
    move("hurricane", "flying", 110, 10, "special", { accuracy: 70 }),
  ],

  psychic: [
    move("confusion", "psychic", 50, 25, "special"),
    move("psybeam", "psychic", 65, 20, "special"),
    move("psychic", "psychic", 90, 10, "special"),
    move("future-sight", "psychic", 120, 10, "special"),
  ],

  bug: [
    move("fury-cutter", "bug", 40, 20, "physical", { accuracy: 95 }),
    move("x-scissor", "bug", 80, 15, "physical"),
    move("bug-buzz", "bug", 90, 10, "special"),
    move("megahorn", "bug", 120, 10, "physical", { accuracy: 85 }),
  ],

  rock: [
    move("rock-throw", "rock", 50, 15, "physical", { accuracy: 90 }),
    move("rock-slide", "rock", 75, 10, "physical", { accuracy: 90 }),
    move("stone-edge", "rock", 100, 5, "physical", { accuracy: 80 }),
    move("power-gem", "rock", 80, 20, "special"),
  ],

  ghost: [
    move("lick", "ghost", 30, 30, "physical", {
      effect: status("paralyze", 30),
    }),
    move("shadow-punch", "ghost", 60, 20, "physical"),
    move("shadow-ball", "ghost", 80, 15, "special"),
    move("phantom-force", "ghost", 90, 10, "physical"),
  ],

  dragon: [
    move("dragon-rage", "dragon", 40, 10, "special"),
    move("dragon-breath", "dragon", 60, 20, "special", {
      effect: status("paralyze", 30),
    }),
    move("dragon-claw", "dragon", 80, 15, "physical"),
    move("draco-meteor", "dragon", 130, 5, "special", { accuracy: 90 }),
  ],

  dark: [
    move("bite", "dark", 60, 25, "physical"),
    move("crunch", "dark", 80, 15, "physical"),
    move("dark-pulse", "dark", 80, 15, "special"),
    move("foul-play", "dark", 95, 15, "physical"),
  ],

  steel: [
    move("metal-claw", "steel", 50, 35, "physical", { accuracy: 95 }),
    move("iron-head", "steel", 80, 15, "physical"),
    move("flash-cannon", "steel", 80, 10, "special"),
    move("meteor-mash", "steel", 90, 10, "physical", { accuracy: 90 }),
  ],

  fairy: [
    move("fairy-wind", "fairy", 40, 30, "special"),
    move("draining-kiss", "fairy", 50, 10, "special", { effect: heal(75) }),
    move("dazzling-gleam", "fairy", 80, 10, "special"),
    move("moonblast", "fairy", 95, 15, "special"),
  ],
};

// =============================================================================
// Utility Moves (available to all Pokemon)
// =============================================================================

export const UTILITY_MOVES: Move[] = [
  statusMove("growl", "normal", 40, statChange("opponent", "attack", -1)),
  statusMove("leer", "normal", 30, statChange("opponent", "defense", -1)),
  statusMove("swords-dance", "normal", 20, statChange("self", "attack", 2)),
  statusMove("agility", "psychic", 30, statChange("self", "speed", 2)),
];

// =============================================================================
// Type Effectiveness Chart
// =============================================================================

/**
 * Type effectiveness chart for damage calculation
 * Values: 2 = super effective, 0.5 = not very effective, 0 = immune
 */
export const TYPE_CHART: Partial<
  Record<PokemonType, Partial<Record<PokemonType, number>>>
> = {
  normal: { rock: 0.5, ghost: 0, steel: 0.5 },
  fire: {
    fire: 0.5,
    water: 0.5,
    grass: 2,
    ice: 2,
    bug: 2,
    rock: 0.5,
    dragon: 0.5,
    steel: 2,
  },
  water: { fire: 2, water: 0.5, grass: 0.5, ground: 2, rock: 2, dragon: 0.5 },
  electric: {
    water: 2,
    electric: 0.5,
    grass: 0.5,
    ground: 0,
    flying: 2,
    dragon: 0.5,
  },
  grass: {
    fire: 0.5,
    water: 2,
    grass: 0.5,
    poison: 0.5,
    ground: 2,
    flying: 0.5,
    bug: 0.5,
    rock: 2,
    dragon: 0.5,
    steel: 0.5,
  },
  ice: {
    fire: 0.5,
    water: 0.5,
    grass: 2,
    ice: 0.5,
    ground: 2,
    flying: 2,
    dragon: 2,
    steel: 0.5,
  },
  fighting: {
    normal: 2,
    ice: 2,
    poison: 0.5,
    flying: 0.5,
    psychic: 0.5,
    bug: 0.5,
    rock: 2,
    ghost: 0,
    dark: 2,
    steel: 2,
    fairy: 0.5,
  },
  poison: {
    grass: 2,
    poison: 0.5,
    ground: 0.5,
    rock: 0.5,
    ghost: 0.5,
    steel: 0,
    fairy: 2,
  },
  ground: {
    fire: 2,
    electric: 2,
    grass: 0.5,
    poison: 2,
    flying: 0,
    bug: 0.5,
    rock: 2,
    steel: 2,
  },
  flying: {
    electric: 0.5,
    grass: 2,
    fighting: 2,
    bug: 2,
    rock: 0.5,
    steel: 0.5,
  },
  psychic: { fighting: 2, poison: 2, psychic: 0.5, dark: 0, steel: 0.5 },
  bug: {
    fire: 0.5,
    grass: 2,
    fighting: 0.5,
    poison: 0.5,
    flying: 0.5,
    psychic: 2,
    ghost: 0.5,
    dark: 2,
    steel: 0.5,
    fairy: 0.5,
  },
  rock: {
    fire: 2,
    ice: 2,
    fighting: 0.5,
    ground: 0.5,
    flying: 2,
    bug: 2,
    steel: 0.5,
  },
  ghost: { normal: 0, psychic: 2, ghost: 2, dark: 0.5 },
  dragon: { dragon: 2, steel: 0.5, fairy: 0 },
  dark: { fighting: 0.5, psychic: 2, ghost: 2, dark: 0.5, fairy: 0.5 },
  steel: {
    fire: 0.5,
    water: 0.5,
    electric: 0.5,
    ice: 2,
    rock: 2,
    steel: 0.5,
    fairy: 2,
  },
  fairy: {
    fire: 0.5,
    fighting: 2,
    poison: 0.5,
    dragon: 2,
    dark: 2,
    steel: 0.5,
  },
};

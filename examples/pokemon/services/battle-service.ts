import type {
  Pokemon,
  BattlePokemon,
  Move,
  PokemonType,
  EffectResult,
} from "../types.js";
import { TYPE_CHART, TYPE_MOVES, UTILITY_MOVES } from "../data/moves.js";

/** Fraction of max HP dealt as status damage (burn/poison) */
const STATUS_DAMAGE_FRACTION = 16;

export class BattleService {
  /**
   * Calculate type effectiveness multiplier
   */
  getTypeEffectiveness(
    attackType: PokemonType,
    defenderTypes: PokemonType[],
  ): number {
    let multiplier = 1;
    for (const defType of defenderTypes) {
      const effectiveness = TYPE_CHART[attackType]?.[defType];
      if (effectiveness !== undefined) {
        multiplier *= effectiveness;
      }
    }
    return multiplier;
  }

  /**
   * Calculate damage from an attack
   */
  calculateDamage(
    attacker: BattlePokemon,
    defender: BattlePokemon,
    move: Move,
  ): { damage: number; effectiveness: number; critical: boolean } {
    if (move.category === "status") {
      return { damage: 0, effectiveness: 1, critical: false };
    }

    // Check accuracy
    if (Math.random() * 100 > move.accuracy) {
      return { damage: 0, effectiveness: 1, critical: false };
    }

    const level = attacker.level;
    const power = move.power;

    // Get attack and defense stats based on move category
    let attack: number;
    let defense: number;
    if (move.category === "physical") {
      attack =
        attacker.baseStats.attack *
        this.getStatModifier(attacker.statModifiers.attack);
      defense =
        defender.baseStats.defense *
        this.getStatModifier(defender.statModifiers.defense);
      // Burn reduces physical attack
      if (attacker.statusCondition === "burn") {
        attack *= 0.5;
      }
    } else {
      attack = attacker.baseStats.specialAttack;
      defense = defender.baseStats.specialDefense;
    }

    // Type effectiveness
    const effectiveness = this.getTypeEffectiveness(move.type, defender.types);

    // Critical hit (6.25% chance, 1.5x damage)
    const critical = Math.random() < 0.0625;
    const critMultiplier = critical ? 1.5 : 1;

    // STAB (Same Type Attack Bonus)
    const stab = attacker.types.includes(move.type) ? 1.5 : 1;

    // Random factor (85-100%)
    const random = 0.85 + Math.random() * 0.15;

    // Damage formula (simplified version of the official formula)
    const baseDamage =
      (((2 * level) / 5 + 2) * power * (attack / defense)) / 50 + 2;
    const damage = Math.floor(
      baseDamage * stab * effectiveness * critMultiplier * random,
    );

    return { damage: Math.max(1, damage), effectiveness, critical };
  }

  /**
   * Convert stat modifier stages to multiplier
   */
  getStatModifier(stages: number): number {
    if (stages >= 0) {
      return (2 + stages) / 2;
    }
    return 2 / (2 - stages);
  }

  /**
   * Calculate effective speed for turn order (includes paralysis penalty)
   */
  getEffectiveSpeed(pokemon: BattlePokemon): number {
    return (
      pokemon.baseStats.speed *
      this.getStatModifier(pokemon.statModifiers.speed) *
      (pokemon.statusCondition === "paralyze" ? 0.5 : 1)
    );
  }

  /**
   * Apply status condition damage at end of turn
   */
  applyStatusDamage(pokemon: BattlePokemon): number {
    if (
      pokemon.statusCondition === "burn" ||
      pokemon.statusCondition === "poison"
    ) {
      const damage = Math.floor(pokemon.maxHp / STATUS_DAMAGE_FRACTION);
      return damage;
    }
    return 0;
  }

  /**
   * Check if Pokemon can act (not paralyzed/sleeping)
   */
  canAct(pokemon: BattlePokemon): { canAct: boolean; reason?: string } {
    if (pokemon.statusCondition === "paralyze") {
      if (Math.random() < 0.25) {
        return { canAct: false, reason: "is fully paralyzed!" };
      }
    }
    if (pokemon.statusCondition === "sleep") {
      if (pokemon.sleepTurns && pokemon.sleepTurns > 0) {
        return { canAct: false, reason: "is fast asleep." };
      }
    }
    return { canAct: true };
  }

  /**
   * Apply move effect
   */
  applyMoveEffect(
    move: Move,
    attacker: BattlePokemon,
    defender: BattlePokemon,
    damage: number,
  ): EffectResult {
    const effect = move.effect;
    if (!effect) return { effectApplied: false, data: null };

    // Check if effect triggers (based on chance)
    if (effect.chance && Math.random() * 100 > effect.chance) {
      return { effectApplied: false, data: null };
    }

    const target = effect.target === "self" ? attacker : defender;

    switch (effect.type) {
      case "heal": {
        if (effect.healPercent) {
          const healAmount = Math.floor((damage * effect.healPercent) / 100);
          attacker.currentHp = Math.min(
            attacker.maxHp,
            attacker.currentHp + healAmount,
          );
          return {
            effectApplied: true,
            data: { type: "heal", pokemon: attacker.displayName },
          };
        }
        break;
      }
      case "stat_change": {
        if (effect.stat && effect.stages) {
          const oldValue = target.statModifiers[effect.stat];
          const newValue = Math.max(-6, Math.min(6, oldValue + effect.stages));
          target.statModifiers[effect.stat] = newValue;

          return {
            effectApplied: newValue !== oldValue,
            data: {
              type: "stat_change",
              pokemon: target.displayName,
              stat: effect.stat,
              stages: effect.stages,
              changed: newValue !== oldValue,
            },
          };
        }
        break;
      }
      case "status_condition": {
        if (effect.condition && !target.statusCondition) {
          target.statusCondition = effect.condition;
          if (effect.condition === "sleep") {
            target.sleepTurns = Math.floor(Math.random() * 3) + 1;
          }
          return {
            effectApplied: true,
            data: {
              type: "status_condition",
              pokemon: target.displayName,
              condition: effect.condition,
            },
          };
        }
        break;
      }
    }

    return { effectApplied: false, data: null };
  }

  /**
   * Get AI move selection based on difficulty
   */
  selectAIMove(
    attacker: BattlePokemon,
    defender: BattlePokemon,
    difficulty: "easy" | "normal" | "hard",
  ): Move {
    const availableMoves = attacker.moves.filter((m) => m.pp > 0);
    if (availableMoves.length === 0) {
      // Struggle - last resort
      return {
        name: "struggle",
        displayName: "Struggle",
        localizedNames: {},
        type: "normal",
        power: 50,
        accuracy: 100,
        pp: 999,
        maxPp: 999,
        category: "physical",
      };
    }

    if (difficulty === "easy") {
      // Random move
      return availableMoves[Math.floor(Math.random() * availableMoves.length)]!;
    }

    // Calculate expected damage for each move
    const moveScores = availableMoves.map((move) => {
      if (move.category === "status") {
        // Status moves get lower priority
        return { move, score: 30 };
      }
      const { damage, effectiveness } = this.calculateDamage(
        attacker,
        defender,
        move,
      );
      let score = damage * effectiveness;

      // Bonus for moves that could KO
      if (damage >= defender.currentHp) {
        score *= 1.5;
      }

      return { move, score };
    });

    if (difficulty === "normal") {
      // Sometimes pick optimal, sometimes random
      if (Math.random() < 0.7) {
        moveScores.sort((a, b) => b.score - a.score);
        return moveScores[0]!.move;
      }
      return availableMoves[Math.floor(Math.random() * availableMoves.length)]!;
    }

    // Hard: Always pick best move
    moveScores.sort((a, b) => b.score - a.score);
    return moveScores[0]!.move;
  }

  /**
   * Convert a Pokemon from API to BattlePokemon
   */
  createBattlePokemon(
    pokemon: Pokemon,
    level: number,
    isPlayer: boolean,
  ): BattlePokemon {
    const types = pokemon.types.map((t) => t.type.name as PokemonType);

    // Get base stats
    const stats = {
      hp: pokemon.stats.find((s) => s.stat.name === "hp")?.base_stat ?? 50,
      attack:
        pokemon.stats.find((s) => s.stat.name === "attack")?.base_stat ?? 50,
      defense:
        pokemon.stats.find((s) => s.stat.name === "defense")?.base_stat ?? 50,
      specialAttack:
        pokemon.stats.find((s) => s.stat.name === "special-attack")
          ?.base_stat ?? 50,
      specialDefense:
        pokemon.stats.find((s) => s.stat.name === "special-defense")
          ?.base_stat ?? 50,
      speed:
        pokemon.stats.find((s) => s.stat.name === "speed")?.base_stat ?? 50,
    };

    // Calculate HP based on level
    const maxHp = Math.floor(((2 * stats.hp + 31) * level) / 100 + level + 10);

    // Generate moveset
    const moves = this.generateMoveset(types, level);

    return {
      id: pokemon.id,
      name: pokemon.name,
      displayName: pokemon.name.charAt(0).toUpperCase() + pokemon.name.slice(1),
      localizedNames: {},
      sprite:
        pokemon.sprites.other?.["official-artwork"]?.front_default ||
        pokemon.sprites.front_default,
      spriteBack: pokemon.sprites.back_default,
      cryUrl: pokemon.cries?.latest,
      speciesUrl: pokemon.species.url,
      types,
      baseStats: stats,
      currentHp: maxHp,
      maxHp,
      moves,
      level,
      statModifiers: { attack: 0, defense: 0, speed: 0 },
      statusCondition: null,
      isPlayer,
    };
  }

  /**
   * Generate a moveset for a Pokemon based on its types
   */
  generateMoveset(types: PokemonType[], level: number): Move[] {
    const moves: Move[] = [];
    const primaryType = types[0] || "normal";
    const secondaryType = types[1];

    // Get primary type moves (2 moves)
    const primaryMoves = [...(TYPE_MOVES[primaryType] || TYPE_MOVES.normal)];
    // Filter by level (higher level = access to stronger moves)
    const availablePrimary = primaryMoves.filter((_, i) => {
      const requiredLevel = (i + 1) * 15;
      return level >= requiredLevel;
    });
    // Pick 2 random moves from available
    this.shuffleArray(availablePrimary);
    moves.push(...availablePrimary.slice(0, 2));

    // Get secondary type move if exists
    if (secondaryType && TYPE_MOVES[secondaryType]) {
      const secondaryMoves = [...TYPE_MOVES[secondaryType]];
      const availableSecondary = secondaryMoves.filter((_, i) => {
        const requiredLevel = (i + 1) * 15;
        return level >= requiredLevel;
      });
      if (availableSecondary.length > 0) {
        moves.push(
          availableSecondary[
            Math.floor(Math.random() * availableSecondary.length)
          ]!,
        );
      }
    }

    // Add a utility move
    if (moves.length < 4) {
      const utility =
        UTILITY_MOVES[Math.floor(Math.random() * UTILITY_MOVES.length)]!;
      moves.push({ ...utility });
    }

    // Fill remaining slots with normal type moves
    while (moves.length < 4) {
      const normalMoves = TYPE_MOVES.normal.filter(
        (m) => !moves.some((existing) => existing.name === m.name),
      );
      if (normalMoves.length > 0) {
        moves.push({
          ...normalMoves[Math.floor(Math.random() * normalMoves.length)]!,
        });
      } else {
        break;
      }
    }

    // Deep copy moves to ensure independent PP tracking and add localizedNames
    return moves.slice(0, 4).map((m) => ({ ...m, localizedNames: {} }));
  }

  /**
   * Fisher-Yates shuffle
   */
  private shuffleArray<T>(array: T[]): void {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j]!, array[i]!];
    }
  }

  /**
   * Check if a team is defeated
   */
  isTeamDefeated(team: BattlePokemon[]): boolean {
    return team.every((p) => p.currentHp <= 0);
  }

  /**
   * Get next available Pokemon in team
   */
  getNextAvailablePokemon(team: BattlePokemon[], currentIndex: number): number {
    for (let i = 0; i < team.length; i++) {
      if (i !== currentIndex && team[i]!.currentHp > 0) {
        return i;
      }
    }
    return -1;
  }
}

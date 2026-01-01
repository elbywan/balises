import { html, each, store } from "../../src/index.js";
import type {
  Pokemon,
  BattleState,
  BattlePokemon,
  BattleLogEntry,
  Move,
  EffectResultData,
} from "./types.js";
import { PokemonService } from "./services/pokemon-service.js";
import { BattleService } from "./services/battle-service.js";
import { audioService } from "./services/audio-service.js";
import { TeamSelect } from "./components/team-select.js";
import { HealthBar } from "./components/health-bar.js";
import { MovePanel } from "./components/move-button.js";
import { BattleLog } from "./components/battle-log.js";
import { TeamSlot } from "./components/team-slot.js";
import { LANGUAGES, getDefaultLanguage } from "./utils/language.js";
import {
  getBattleTranslations,
  formatMessage,
  type BattleTranslations,
} from "./utils/battle-translations.js";

// ============================================================================
// CONSTANTS
// ============================================================================

/** Pokemon IDs to load for team selection */
const AVAILABLE_POKEMON_IDS = [
  // Starters + Classics
  1, 4, 7, 25, 6, 9, 3, 131, 143, 149,
  // Gen 1 favorites
  94, 130, 65, 59, 76, 103, 112, 123,
  // Gen 2-3
  196, 197, 212, 214, 229, 230, 248, 257,
  // Gen 4
  445, 448, 466, 468, 473, 475, 477, 479,
];

/** Default level for player Pokemon */
const PLAYER_LEVEL = 50;

/** Level adjustments by difficulty */
const DIFFICULTY_LEVELS: Record<BattleState["difficulty"], number> = {
  easy: 45,
  normal: 50,
  hard: 55,
};

/** Maximum entries in battle log */
const MAX_LOG_ENTRIES = 50;

/** Animation durations (ms) */
const TIMING = {
  actionMessage: 1200,
  battleStart: 1500,
  shortDelay: 300,
  mediumDelay: 700,
  longDelay: 800,
  faintMessage: 1000,
  victoryMessage: 2000,
} as const;

/** Initial/reset state for battle */
const INITIAL_BATTLE_STATE: Omit<
  BattleState,
  "availablePokemon" | "teamSize" | "difficulty"
> = {
  phase: "splash",
  playerTeam: [],
  enemyTeam: [],
  activePlayerPokemon: 0,
  activeEnemyPokemon: 0,
  battleLog: [],
  currentTurn: 1,
  isPlayerTurn: true,
  isAnimating: false,
  selectedMove: null,
  winner: null,
  selectedForTeam: [],
  actionMessage: null,
  actionMessageType: null,
};

// ============================================================================
// BATTLE COMPONENT
// ============================================================================

/**
 * Pokemon Battle Game - A turn-based battle simulation featuring:
 * - Team selection with multiple Pokemon
 * - Turn-based combat with type effectiveness
 * - AI opponent with difficulty levels
 * - Status conditions and stat modifiers
 * - Localized messages in 8 languages
 */
export class PokemonBattleElement extends HTMLElement {
  // ---------------------------------------------------------------------------
  // State & Services
  // ---------------------------------------------------------------------------

  #state = store<
    BattleState & {
      isMuted: boolean;
      language: string;
      loadingError: string | null;
    }
  >({
    phase: "splash",
    playerTeam: [],
    enemyTeam: [],
    activePlayerPokemon: 0,
    activeEnemyPokemon: 0,
    battleLog: [],
    currentTurn: 1,
    isPlayerTurn: true,
    isAnimating: false,
    selectedMove: null,
    winner: null,
    availablePokemon: [],
    selectedForTeam: [],
    teamSize: 3,
    difficulty: "normal",
    actionMessage: null,
    actionMessageType: null,
    isMuted: false,
    language: getDefaultLanguage(),
    loadingError: null,
  });

  #dispose: (() => void) | null = null;
  #pokemonService = new PokemonService();
  #battleService = new BattleService();
  #logIdCounter = 0;
  #animationTimeout: ReturnType<typeof setTimeout> | null = null;
  #messageTimeout: ReturnType<typeof setTimeout> | null = null;
  #audioInitialized = false;
  #battleSessionId = 0;

  // ---------------------------------------------------------------------------
  // Getters & Helpers
  // ---------------------------------------------------------------------------

  /** Get current translations */
  get #t(): BattleTranslations {
    return getBattleTranslations(this.#state.language);
  }

  /** Get active player Pokemon */
  get #playerPokemon(): BattlePokemon | null {
    return this.#state.playerTeam[this.#state.activePlayerPokemon] ?? null;
  }

  /** Get active enemy Pokemon */
  get #enemyPokemon(): BattlePokemon | null {
    return this.#state.enemyTeam[this.#state.activeEnemyPokemon] ?? null;
  }

  /** Get localized Pokemon name */
  #pokemonName(pokemon: BattlePokemon | null | undefined): string {
    if (!pokemon) return "";
    return pokemon.localizedNames[this.#state.language] ?? pokemon.displayName;
  }

  /** Get localized move name */
  #moveName(move: Move): string {
    return move.localizedNames?.[this.#state.language] ?? move.displayName;
  }

  // ---------------------------------------------------------------------------
  // Audio
  // ---------------------------------------------------------------------------

  #initAudio(): void {
    if (!this.#audioInitialized) {
      audioService.init();
      this.#audioInitialized = true;
    }
  }

  // ---------------------------------------------------------------------------
  // Action Messages
  // ---------------------------------------------------------------------------

  /** Show an action message overlay */
  #showActionMessage(
    message: string,
    type: BattleState["actionMessageType"] = "info",
    duration: number = TIMING.actionMessage,
  ): Promise<void> {
    const sessionId = this.#battleSessionId;
    return new Promise((resolve) => {
      this.#state.actionMessage = message;
      this.#state.actionMessageType = type;

      if (this.#messageTimeout) clearTimeout(this.#messageTimeout);
      this.#messageTimeout = setTimeout(() => {
        if (this.#battleSessionId === sessionId) {
          this.#state.actionMessage = null;
          this.#state.actionMessageType = null;
        }
        resolve();
      }, duration);
    });
  }

  /** Create a delay */
  #delay(ms: number): Promise<void> {
    return new Promise((resolve) => {
      this.#animationTimeout = setTimeout(resolve, ms);
    });
  }

  // ---------------------------------------------------------------------------
  // Localization Loading
  // ---------------------------------------------------------------------------

  /** Load localized names for battle Pokemon in parallel */
  async #loadLocalizedNames(lang: string): Promise<void> {
    const allPokemon = [...this.#state.playerTeam, ...this.#state.enemyTeam];
    const promises: Promise<void>[] = [];

    for (const pokemon of allPokemon) {
      // Load Pokemon name
      if (!pokemon.localizedNames[lang]) {
        promises.push(
          this.#pokemonService
            .getLocalizedName(pokemon.speciesUrl, lang, pokemon.displayName)
            .then((name) => {
              pokemon.localizedNames[lang] = name;
            }),
        );
      }
      // Load move names
      for (const move of pokemon.moves) {
        if (!move.localizedNames) move.localizedNames = {};
        if (!move.localizedNames[lang]) {
          promises.push(
            this.#pokemonService
              .getMoveLocalizedName(move.name, lang, move.displayName)
              .then((name) => {
                move.localizedNames![lang] = name;
              }),
          );
        }
      }
    }

    await Promise.all(promises);
    this.#triggerTeamReactivity();
  }

  /** Load localized names for available Pokemon (team selection) */
  async #loadAvailablePokemonNames(lang: string): Promise<void> {
    const promises: Promise<void>[] = [];

    for (const p of this.#state.availablePokemon) {
      if (!p.localizedNames[lang]) {
        promises.push(
          this.#pokemonService
            .getLocalizedName(p.species.url, lang, p.displayName)
            .then((name) => {
              p.localizedNames[lang] = name;
            }),
        );
      }
    }

    if (promises.length > 0) {
      await Promise.all(promises);
      this.#state.availablePokemon = [...this.#state.availablePokemon];
    }
  }

  // ---------------------------------------------------------------------------
  // Effect Translation
  // ---------------------------------------------------------------------------

  /** Translate effect result data to localized message */
  #translateEffectResult(
    data: EffectResultData,
    pokemonName: string,
  ): string | null {
    if (!data) return null;
    const t = this.#t;

    switch (data.type) {
      case "heal":
        return formatMessage(t.stats.restoredHealth, { pokemon: pokemonName });

      case "stat_change": {
        if (!data.changed) {
          const template =
            data.stages > 0 ? t.stats.cantGoHigher : t.stats.cantGoLower;
          return formatMessage(template, {
            pokemon: pokemonName,
            stat: data.stat,
          });
        }
        const sharply = Math.abs(data.stages) > 1 ? "Sharply" : "";
        const direction = data.stages > 0 ? "Rose" : "Fell";
        const key =
          `${data.stat}${direction}${sharply}` as keyof typeof t.stats;
        const template = t.stats[key];
        return template
          ? formatMessage(template, { pokemon: pokemonName })
          : null;
      }

      case "status_condition": {
        const conditionMap: Record<string, keyof typeof t.status> = {
          burn: "burned",
          paralyze: "paralyzed",
          poison: "poisoned",
          sleep: "asleep",
        };
        const key = conditionMap[data.condition];
        return key
          ? formatMessage(t.status[key], { pokemon: pokemonName })
          : null;
      }
    }
  }

  // ---------------------------------------------------------------------------
  // State Helpers
  // ---------------------------------------------------------------------------

  /** Trigger reactivity for both teams */
  #triggerTeamReactivity(): void {
    this.#state.playerTeam = [...this.#state.playerTeam];
    this.#state.enemyTeam = [...this.#state.enemyTeam];
  }

  /** Add an entry to the battle log */
  #addLogEntry(message: string, type: BattleLogEntry["type"]): void {
    const newEntries = [
      ...this.#state.battleLog,
      { id: ++this.#logIdCounter, message, type, timestamp: Date.now() },
    ];
    this.#state.battleLog = newEntries.slice(-MAX_LOG_ENTRIES);

    // Scroll log to bottom
    requestAnimationFrame(() => {
      const logContent = this.querySelector(".battle-log-content");
      if (logContent) logContent.scrollTop = logContent.scrollHeight;
    });
  }

  /** Clear all pending timeouts */
  #clearTimeouts(): void {
    if (this.#animationTimeout) {
      clearTimeout(this.#animationTimeout);
      this.#animationTimeout = null;
    }
    if (this.#messageTimeout) {
      clearTimeout(this.#messageTimeout);
      this.#messageTimeout = null;
    }
  }

  /** Reset battle state for restart */
  #resetBattleState(): void {
    this.#battleSessionId++;
    this.#clearTimeouts();
    audioService.stopMusic();
    Object.assign(this.#state, INITIAL_BATTLE_STATE);
  }

  // ---------------------------------------------------------------------------
  // Turn Execution
  // ---------------------------------------------------------------------------

  /** Execute a turn for any Pokemon (player or enemy) */
  async #executeTurn(
    attacker: BattlePokemon,
    defender: BattlePokemon,
    move: Move,
    isPlayer: boolean,
  ): Promise<void> {
    const t = this.#t;
    const attackerName = this.#pokemonName(attacker);
    const defenderName = this.#pokemonName(defender);

    // Check if can act (status conditions)
    const canAct = this.#battleService.canAct(attacker);
    if (!canAct.canAct) {
      const statusMsg =
        attacker.statusCondition === "sleep"
          ? formatMessage(t.status.isFastAsleep, { pokemon: attackerName })
          : formatMessage(t.status.isParalyzed, { pokemon: attackerName });
      this.#addLogEntry(statusMsg, "effect");

      if (attacker.statusCondition === "sleep" && attacker.sleepTurns) {
        attacker.sleepTurns--;
        if (attacker.sleepTurns <= 0) {
          attacker.statusCondition = null;
          this.#addLogEntry(
            formatMessage(t.status.wokeUp, { pokemon: attackerName }),
            "effect",
          );
        }
      }
      return;
    }

    // Use move
    move.pp--;
    const usedMsg = formatMessage(t.actions.used, {
      pokemon: attackerName,
      move: this.#moveName(move),
    });
    this.#addLogEntry(usedMsg, "action");
    await this.#showActionMessage(usedMsg, "action", TIMING.longDelay);

    audioService.playSfx("attack");
    await this.#delay(TIMING.shortDelay);

    // Calculate and apply damage
    const { damage, effectiveness, critical } =
      this.#battleService.calculateDamage(attacker, defender, move);

    if (damage === 0 && move.category !== "status") {
      const noEffectKey = isPlayer ? "noEffectEnemy" : "noEffect";
      this.#addLogEntry(
        effectiveness === 0 ? t.actions[noEffectKey] : t.actions.missed,
        "info",
      );
    } else if (damage > 0) {
      audioService.playSfx("hit");
      defender.currentHp = Math.max(0, defender.currentHp - damage);
      this.#triggerTeamReactivity();

      // Log damage modifiers
      if (critical) {
        audioService.playSfx("critical");
        this.#addLogEntry(t.actions.criticalHit, "damage");
        await this.#showActionMessage(
          t.actions.criticalHit,
          "damage",
          TIMING.mediumDelay,
        );
      }
      if (effectiveness > 1) {
        audioService.playSfx("superEffective");
        this.#addLogEntry(t.actions.superEffective, "damage");
        await this.#showActionMessage(
          t.actions.superEffective,
          "damage",
          TIMING.mediumDelay,
        );
      } else if (effectiveness > 0 && effectiveness < 1) {
        audioService.playSfx("notVeryEffective");
        this.#addLogEntry(t.actions.notVeryEffective, "info");
      }

      this.#addLogEntry(
        formatMessage(t.actions.tookDamage, { pokemon: defenderName, damage }),
        "damage",
      );
    }

    // Apply move effect
    const effectResult = this.#battleService.applyMoveEffect(
      move,
      attacker,
      defender,
      damage,
    );
    if (effectResult.data) {
      this.#playEffectSound(move);
      const targetName =
        move.effect?.target === "self" ? attackerName : defenderName;
      const effectMsg = this.#translateEffectResult(
        effectResult.data,
        targetName,
      );
      if (effectMsg) this.#addLogEntry(effectMsg, "effect");
      this.#triggerTeamReactivity();
    }

    // Handle faint
    if (defender.currentHp <= 0) {
      await this.#handleFaint(defender, isPlayer);
    }
  }

  /** Play sound effect for move effect */
  #playEffectSound(move: Move): void {
    const effect = move.effect;
    if (!effect) return;

    switch (effect.type) {
      case "heal":
        audioService.playSfx("heal");
        break;
      case "stat_change":
        audioService.playSfx(
          effect.stages && effect.stages > 0 ? "statUp" : "statDown",
        );
        break;
      case "status_condition":
        audioService.playSfx("statusCondition");
        break;
    }
  }

  /** Handle Pokemon fainting */
  async #handleFaint(
    pokemon: BattlePokemon,
    wasPlayerAttacking: boolean,
  ): Promise<void> {
    const t = this.#t;
    const name = this.#pokemonName(pokemon);

    audioService.playSfx("faint");
    this.#addLogEntry(
      formatMessage(t.actions.fainted, { pokemon: name }),
      "faint",
    );
    await this.#showActionMessage(
      formatMessage(t.actions.fainted, { pokemon: name }),
      "damage",
      TIMING.faintMessage,
    );
    await this.#delay(TIMING.shortDelay);

    if (wasPlayerAttacking) {
      // Enemy fainted - auto switch to next
      const nextIndex = this.#battleService.getNextAvailablePokemon(
        this.#state.enemyTeam,
        this.#state.activeEnemyPokemon,
      );
      if (nextIndex >= 0) {
        this.#state.activeEnemyPokemon = nextIndex;
        const nextPokemon = this.#state.enemyTeam[nextIndex];
        const nextName = this.#pokemonName(nextPokemon);
        this.#addLogEntry(
          formatMessage(t.actions.enemySentOut, { pokemon: nextName }),
          "info",
        );
        await this.#showActionMessage(
          formatMessage(t.actions.enemySentOut, { pokemon: nextName }),
          "info",
          TIMING.faintMessage,
        );
      }
    } else {
      // Player's Pokemon fainted - prompt switch
      const nextIndex = this.#battleService.getNextAvailablePokemon(
        this.#state.playerTeam,
        this.#state.activePlayerPokemon,
      );
      if (nextIndex >= 0) {
        this.#state.phase = "switching";
      }
    }
  }

  /** Apply end-of-turn status damage */
  async #applyEndOfTurnEffects(): Promise<void> {
    const t = this.#t;

    for (const { team, index, isPlayer } of [
      {
        team: this.#state.playerTeam,
        index: this.#state.activePlayerPokemon,
        isPlayer: true,
      },
      {
        team: this.#state.enemyTeam,
        index: this.#state.activeEnemyPokemon,
        isPlayer: false,
      },
    ]) {
      const pokemon = team[index];
      if (!pokemon || pokemon.currentHp <= 0) continue;

      const statusDamage = this.#battleService.applyStatusDamage(pokemon);
      if (statusDamage > 0) {
        pokemon.currentHp = Math.max(0, pokemon.currentHp - statusDamage);
        this.#triggerTeamReactivity();

        const name = this.#pokemonName(pokemon);
        const statusMsg =
          pokemon.statusCondition === "burn"
            ? formatMessage(t.status.hurtByBurn, { pokemon: name })
            : formatMessage(t.status.hurtByPoison, { pokemon: name });
        this.#addLogEntry(statusMsg, "damage");

        if (pokemon.currentHp <= 0) {
          await this.#handleFaint(pokemon, !isPlayer);
        }
      }
    }
  }

  /** Check if battle has ended */
  async #checkBattleEnd(): Promise<boolean> {
    const sessionId = this.#battleSessionId;
    const t = this.#t;

    if (this.#battleService.isTeamDefeated(this.#state.enemyTeam)) {
      audioService.stopMusic();
      await this.#showActionMessage(
        t.gameOver.victory,
        "heal",
        TIMING.victoryMessage,
      );
      if (this.#battleSessionId !== sessionId) return true;
      await audioService.playVictoryMusic();
      if (this.#battleSessionId !== sessionId) return true;
      this.#state.phase = "victory";
      this.#state.winner = "player";
      return true;
    }

    if (this.#battleService.isTeamDefeated(this.#state.playerTeam)) {
      audioService.stopMusic();
      await this.#showActionMessage(
        t.gameOver.defeat,
        "damage",
        TIMING.victoryMessage,
      );
      if (this.#battleSessionId !== sessionId) return true;
      audioService.playSfx("defeat");
      this.#state.phase = "game_over";
      this.#state.winner = "enemy";
      return true;
    }

    return false;
  }

  // ---------------------------------------------------------------------------
  // Event Handlers
  // ---------------------------------------------------------------------------

  #startGame = (): void => {
    this.#initAudio();
    audioService.playMusic("team-select");
    this.#state.phase = "team_select";
  };

  #toggleMute = (): void => {
    this.#initAudio();
    this.#state.isMuted = audioService.toggleMute();
  };

  #changeLanguage = (lang: string): void => {
    this.#state.language = lang;
    localStorage.setItem("pokemon-language", lang);
    if (this.#state.phase === "team_select" || this.#state.phase === "splash") {
      this.#loadAvailablePokemonNames(lang);
    } else {
      this.#loadLocalizedNames(lang);
    }
  };

  #togglePokemonSelection = (id: number): void => {
    const index = this.#state.selectedForTeam.indexOf(id);
    if (index >= 0) {
      this.#state.selectedForTeam = this.#state.selectedForTeam.filter(
        (pid) => pid !== id,
      );
    } else if (this.#state.selectedForTeam.length < this.#state.teamSize) {
      this.#state.selectedForTeam = [...this.#state.selectedForTeam, id];
    }
  };

  #changeDifficulty = (difficulty: BattleState["difficulty"]): void => {
    this.#state.difficulty = difficulty;
  };

  #startBattle = async (): Promise<void> => {
    this.#initAudio();
    this.#state.isAnimating = true;

    // Create player team
    const playerTeam = this.#state.selectedForTeam
      .map((id) => this.#state.availablePokemon.find((p) => p.id === id))
      .filter((p): p is Pokemon => !!p)
      .map((p) =>
        this.#battleService.createBattlePokemon(p, PLAYER_LEVEL, true),
      );
    this.#state.playerTeam = playerTeam;

    // Create enemy team
    const usedIds = new Set(this.#state.selectedForTeam);
    const availableForEnemy = this.#state.availablePokemon.filter(
      (p) => !usedIds.has(p.id),
    );
    const enemyLevel = DIFFICULTY_LEVELS[this.#state.difficulty];

    const enemyTeam: BattlePokemon[] = [];
    for (
      let i = 0;
      i < this.#state.teamSize && availableForEnemy.length > 0;
      i++
    ) {
      const randomIndex = Math.floor(Math.random() * availableForEnemy.length);
      const pokemon = availableForEnemy.splice(randomIndex, 1)[0]!;
      enemyTeam.push(
        this.#battleService.createBattlePokemon(pokemon, enemyLevel, false),
      );
    }
    this.#state.enemyTeam = enemyTeam;

    // Load localized names
    await this.#loadLocalizedNames(this.#state.language);

    // Initialize battle state
    this.#state.activePlayerPokemon = 0;
    this.#state.activeEnemyPokemon = 0;
    this.#state.currentTurn = 1;
    this.#state.isPlayerTurn = true;
    this.#state.battleLog = [];
    this.#state.winner = null;
    this.#state.phase = "battle";
    this.#state.isAnimating = false;

    // Start battle
    await audioService.startBattleMusic();

    const player = playerTeam[0];
    const enemy = enemyTeam[0];
    if (player?.cryUrl) audioService.playPokemonCry(player.cryUrl);

    const battleStartMsg = formatMessage(this.#t.battle.battleStart, {
      player: this.#pokemonName(player),
      enemy: this.#pokemonName(enemy),
    });
    this.#addLogEntry(battleStartMsg, "info");
    await this.#showActionMessage(battleStartMsg, "info", TIMING.battleStart);
  };

  #selectMove = async (moveIndex: number): Promise<void> => {
    if (this.#state.isAnimating || !this.#state.isPlayerTurn) return;

    const player = this.#playerPokemon;
    const enemy = this.#enemyPokemon;
    if (!player || !enemy) return;

    const move = player.moves[moveIndex];
    if (!move || move.pp <= 0) return;

    audioService.playSfx("select");
    this.#state.isAnimating = true;

    // Determine turn order based on effective speed
    const playerSpeed = this.#battleService.getEffectiveSpeed(player);
    const enemySpeed = this.#battleService.getEffectiveSpeed(enemy);
    const playerFirst = playerSpeed >= enemySpeed;

    // Execute turns
    if (playerFirst) {
      await this.#executeTurn(player, enemy, move, true);
      if (!(await this.#checkBattleEnd())) {
        await this.#delay(TIMING.longDelay);
        const aiMove = this.#battleService.selectAIMove(
          enemy,
          player,
          this.#state.difficulty,
        );
        const moveInMoves = enemy.moves.find((m) => m.name === aiMove.name);
        if (moveInMoves)
          await this.#executeTurn(enemy, player, moveInMoves, false);
        await this.#checkBattleEnd();
      }
    } else {
      const aiMove = this.#battleService.selectAIMove(
        enemy,
        player,
        this.#state.difficulty,
      );
      const moveInMoves = enemy.moves.find((m) => m.name === aiMove.name);
      if (moveInMoves)
        await this.#executeTurn(enemy, player, moveInMoves, false);
      if (!(await this.#checkBattleEnd())) {
        await this.#delay(TIMING.longDelay);
        await this.#executeTurn(player, enemy, move, true);
        await this.#checkBattleEnd();
      }
    }

    // End of turn effects
    await this.#applyEndOfTurnEffects();
    await this.#checkBattleEnd();

    this.#state.currentTurn++;
    this.#state.isAnimating = false;
  };

  #switchPokemon = (index: number): void => {
    if (this.#state.isAnimating) return;

    const pokemon = this.#state.playerTeam[index];
    if (
      !pokemon ||
      pokemon.currentHp <= 0 ||
      index === this.#state.activePlayerPokemon
    ) {
      return;
    }

    audioService.playSfx("switch");
    const oldPokemon = this.#playerPokemon;
    this.#state.activePlayerPokemon = index;

    this.#addLogEntry(
      formatMessage(this.#t.actions.switchedOut, {
        old: this.#pokemonName(oldPokemon),
        new: this.#pokemonName(pokemon),
      }),
      "info",
    );

    if (pokemon.cryUrl) audioService.playPokemonCry(pokemon.cryUrl);
    if (this.#state.phase === "switching") this.#state.phase = "battle";
  };

  #restartGame = (): void => {
    this.#resetBattleState();
  };

  // ---------------------------------------------------------------------------
  // Pokemon Loading
  // ---------------------------------------------------------------------------

  async #loadAvailablePokemon(): Promise<void> {
    try {
      this.#state.loadingError = null;
      const pokemon = await Promise.all(
        AVAILABLE_POKEMON_IDS.map((id) =>
          this.#pokemonService.fetchPokemon(id),
        ),
      );
      this.#state.availablePokemon = pokemon.filter(
        (p): p is Pokemon => p !== null,
      );
      await this.#loadAvailablePokemonNames(this.#state.language);
    } catch (error) {
      console.error("Failed to load Pokemon:", error);
      this.#state.loadingError =
        "Failed to load Pokemon data. Please check your connection and try again.";
    }
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  connectedCallback(): void {
    // Preload music assets early
    audioService.preloadMusic();

    this.#loadAvailablePokemon();

    const { fragment, dispose } = html`
      <div class="pokemon-battle">
        ${this.#renderHeader()} ${() => this.#renderPhase()}
      </div>
    `.render();

    this.#dispose = dispose;
    this.appendChild(fragment);
  }

  disconnectedCallback(): void {
    this.#clearTimeouts();
    audioService.stopMusic();
    audioService.dispose();
    this.#dispose?.();
  }

  // ---------------------------------------------------------------------------
  // Render Methods
  // ---------------------------------------------------------------------------

  #renderHeader() {
    return html`
      <div class="battle-header">
        <h2>${() => this.#t.title}</h2>
        <div class="header-controls">
          ${() =>
            this.#state.phase === "battle"
              ? html`<span class="turn-counter"
                  >${() => this.#t.turn} ${() => this.#state.currentTurn}</span
                >`
              : null}
          <select
            class="language-select"
            @change=${(e: Event) =>
              this.#changeLanguage((e.target as HTMLSelectElement).value)}
          >
            ${() =>
              LANGUAGES.map(
                (lang) => html`
                  <option
                    value=${lang.code}
                    selected=${lang.code === this.#state.language ? true : null}
                  >
                    ${lang.label}
                  </option>
                `,
              )}
          </select>
          <button
            class="audio-toggle"
            @click=${this.#toggleMute}
            title=${() => (this.#state.isMuted ? this.#t.unmute : this.#t.mute)}
          >
            ${() => (this.#state.isMuted ? "🔇" : "🔊")}
          </button>
        </div>
      </div>
    `;
  }

  #renderPhase() {
    switch (this.#state.phase) {
      case "splash":
        return this.#renderSplash();
      case "team_select":
        return this.#renderTeamSelect();
      case "battle":
      case "switching":
        return this.#renderBattle();
      case "victory":
        return this.#renderGameOver(true);
      case "game_over":
        return this.#renderGameOver(false);
      default:
        return null;
    }
  }

  #renderSplash() {
    const isLoading = () =>
      this.#state.availablePokemon.length === 0 && !this.#state.loadingError;
    const hasError = () => this.#state.loadingError !== null;

    return html`
      <div class="splash-screen">
        <div class="splash-content">
          <div class="splash-logo">
            <img
              src="https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/25.png"
              alt="Pikachu"
              class="splash-pokemon"
            />
          </div>
          <p class="splash-subtitle">${() => this.#t.splash.subtitle}</p>
          ${() =>
            hasError()
              ? html`
                  <p class="splash-error">${this.#state.loadingError}</p>
                  <button
                    class="splash-start-btn"
                    @click=${() => this.#loadAvailablePokemon()}
                  >
                    Retry
                  </button>
                `
              : isLoading()
                ? html`<p class="splash-loading">Loading Pokemon...</p>`
                : html`
                    <button class="splash-start-btn" @click=${this.#startGame}>
                      ${() => this.#t.splash.start}
                    </button>
                  `}
        </div>
      </div>
    `;
  }

  #renderTeamSelect() {
    return TeamSelect({
      state: this.#state,
      translations: () => this.#t,
      onTogglePokemon: this.#togglePokemonSelection,
      onStartBattle: this.#startBattle,
      onChangeDifficulty: this.#changeDifficulty,
      getPokemonName: (pokemon) =>
        pokemon.localizedNames[this.#state.language] ?? pokemon.displayName,
    });
  }

  #renderBattle() {
    const getPlayerPokemon = () => this.#playerPokemon;
    const getEnemyPokemon = () => this.#enemyPokemon;

    return html`
      <div class="battle-arena">
        ${this.#renderActionOverlay()}

        <!-- Enemy Side -->
        <div class="battle-side enemy-side">
          ${HealthBar({
            pokemon: getEnemyPokemon,
            isEnemy: true,
            getName: () => this.#pokemonName(getEnemyPokemon()),
          })}
          <div class="pokemon-sprite enemy">
            <img
              src=${() => getEnemyPokemon()?.sprite || ""}
              alt=${() => this.#pokemonName(getEnemyPokemon())}
              class=${() => (this.#state.isAnimating ? "shake" : "")}
            />
          </div>
        </div>

        <!-- Player Side -->
        <div class="battle-side player-side">
          <div class="pokemon-sprite player">
            <img
              src=${() => getPlayerPokemon()?.sprite || ""}
              alt=${() => this.#pokemonName(getPlayerPokemon())}
              class=${() => (this.#state.isAnimating ? "shake" : "")}
            />
          </div>
          ${HealthBar({
            pokemon: getPlayerPokemon,
            isEnemy: false,
            getName: () => this.#pokemonName(getPlayerPokemon()),
          })}
        </div>
      </div>

      <div class="battle-controls">
        ${() =>
          this.#state.phase === "switching"
            ? this.#renderSwitchPrompt()
            : this.#renderActionPanel()}
      </div>

      ${BattleLog({ entries: () => this.#state.battleLog })}
    `;
  }

  #renderActionOverlay() {
    return html`
      ${() =>
        this.#state.actionMessage
          ? html`
              <div
                class="action-message-overlay"
                data-type=${this.#state.actionMessageType ?? "info"}
              >
                <div class="action-message">${this.#state.actionMessage}</div>
              </div>
            `
          : null}
    `;
  }

  #renderSwitchPrompt() {
    return html`
      <div class="switch-prompt">
        <p>${() => this.#t.battle.choosePokemon}</p>
        <div class="team-slots switch-mode">
          ${each(
            () => this.#state.playerTeam,
            (p) => p.id,
            (pokemon) => {
              const getIndex = () =>
                this.#state.playerTeam.findIndex((p) => p.id === pokemon.id);
              const isActive = () =>
                this.#state.playerTeam[this.#state.activePlayerPokemon]?.id ===
                pokemon.id;
              return TeamSlot({
                pokemon,
                isActive,
                onClick: () => this.#switchPokemon(getIndex()),
                showHpText: true,
              });
            },
          )}
        </div>
      </div>
    `;
  }

  #renderActionPanel() {
    return html`
      <div class="action-panel">
        <div class="main-actions">
          ${MovePanel({
            moves: () => this.#playerPokemon?.moves ?? [],
            disabled: () =>
              this.#state.isAnimating || !this.#state.isPlayerTurn,
            onSelectMove: this.#selectMove,
            getMoveName: (move) => this.#moveName(move),
          })}
        </div>
      </div>

      <div class="team-display">
        <div class="team-label">${() => this.#t.battle.yourTeam}</div>
        <div class="team-slots">
          ${each(
            () => this.#state.playerTeam,
            (p) => p.id,
            (pokemon) => {
              const getIndex = () =>
                this.#state.playerTeam.findIndex((p) => p.id === pokemon.id);
              const isActive = () =>
                this.#state.playerTeam[this.#state.activePlayerPokemon]?.id ===
                pokemon.id;
              return TeamSlot({
                pokemon,
                isActive,
                onClick: () => this.#switchPokemon(getIndex()),
                disabled: () => this.#state.isAnimating,
              });
            },
          )}
        </div>
        <div class="team-label">${() => this.#t.battle.enemyTeam}</div>
        <div class="team-slots enemy">
          ${each(
            () => this.#state.enemyTeam,
            (p) => p.id,
            (pokemon) => {
              const isActive = () =>
                this.#state.enemyTeam[this.#state.activeEnemyPokemon]?.id ===
                pokemon.id;
              return TeamSlot({ pokemon, isActive });
            },
          )}
        </div>
      </div>
    `;
  }

  #renderGameOver(isVictory: boolean) {
    const t = this.#t.gameOver;
    return html`
      <div class="game-over ${isVictory ? "victory" : "defeat"}">
        <h2>${() => (isVictory ? t.victory : t.defeat)}</h2>
        <p>${() => (isVictory ? t.victoryMessage : t.defeatMessage)}</p>
        <button class="restart-btn" @click=${this.#restartGame}>
          ${() => (isVictory ? t.playAgain : t.tryAgain)}
        </button>
      </div>
    `;
  }
}

customElements.define("x-pokemon-battle", PokemonBattleElement);

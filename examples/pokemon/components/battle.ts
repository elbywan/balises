/**
 * Battle Component - Pokemon battle game functionality
 * Refactored from PokemonBattleElement to be a function component
 */

import { html as baseHtml, type ReadonlySignal } from "../../../src/index.js";
import eachPlugin, { each } from "../../../src/each.js";
import matchPlugin, { match } from "../../../src/match.js";
import { DEFAULT_ROSTER_IDS } from "../utils/storage.js";

const html = baseHtml.with(eachPlugin, matchPlugin);
import type {
  Pokemon,
  BattleState,
  BattlePokemon,
  BattleLogEntry,
  Move,
  EffectResultData,
  SharedAppState,
} from "../types.js";
import { PokemonService } from "../services/pokemon-service.js";
import { BattleService } from "../services/battle-service.js";
import { audioService } from "../services/audio-service.js";
import { TeamSelect } from "./team-select.js";
import { HealthBar } from "./health-bar.js";
import { MovePanel } from "./move-button.js";
import { BattleLog } from "./battle-log.js";
import { TeamSlot } from "./team-slot.js";
import { LANGUAGES } from "../utils/language.js";
import {
  getBattleTranslations,
  formatMessage,
  type BattleTranslations,
} from "../utils/battle-translations.js";

// ============================================================================
// CONSTANTS
// ============================================================================

const PLAYER_LEVEL = 50;

const DIFFICULTY_LEVELS: Record<BattleState["difficulty"], number> = {
  easy: 45,
  normal: 50,
  hard: 55,
};

const MAX_LOG_ENTRIES = 50;

const TIMING = {
  actionMessage: 1200,
  battleStart: 1500,
  shortDelay: 300,
  mediumDelay: 700,
  longDelay: 800,
  faintMessage: 1000,
  victoryMessage: 2000,
} as const;

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
// TYPES
// ============================================================================

export interface BattleComponentState extends BattleState {
  isMuted: boolean;
  loadingError: string | null;
}

export interface BattleProps {
  state: BattleComponentState;
  sharedState: SharedAppState;
  pokemonService: PokemonService;
  onLanguageChange: (lang: string) => void;
  getRootElement: () => HTMLElement | null;
  // Bridge props for cross-tab integration
  viewInPokedex: (pokemonId: number) => void;
  // Roster props
  removeFromRoster: (pokemonId: number) => boolean;
  resetRoster: () => void;
}

// ============================================================================
// BATTLE COMPONENT
// ============================================================================

export function Battle(props: BattleProps) {
  const {
    state,
    sharedState,
    pokemonService,
    onLanguageChange,
    getRootElement,
    viewInPokedex,
    removeFromRoster,
    resetRoster,
  } = props;

  const battleService = new BattleService();
  let logIdCounter = 0;
  let animationTimeout: ReturnType<typeof setTimeout> | null = null;
  let messageTimeout: ReturnType<typeof setTimeout> | null = null;
  let battleSessionId = 0;

  // ---------------------------------------------------------------------------
  // Getters & Helpers
  // ---------------------------------------------------------------------------

  const getTranslations = (): BattleTranslations =>
    getBattleTranslations(sharedState.language);

  const getPlayerPokemon = (): BattlePokemon | null =>
    state.playerTeam[state.activePlayerPokemon] ?? null;

  const getEnemyPokemon = (): BattlePokemon | null =>
    state.enemyTeam[state.activeEnemyPokemon] ?? null;

  const getPokemonName = (
    pokemon: BattlePokemon | null | undefined,
  ): string => {
    if (!pokemon) return "";
    return pokemon.localizedNames[sharedState.language] ?? pokemon.displayName;
  };

  const getMoveName = (move: Move): string => {
    return move.localizedNames?.[sharedState.language] ?? move.displayName;
  };

  // ---------------------------------------------------------------------------
  // Audio
  // ---------------------------------------------------------------------------

  const initAudio = (): void => {
    audioService.init();
  };

  // ---------------------------------------------------------------------------
  // Action Messages
  // ---------------------------------------------------------------------------

  const showActionMessage = (
    message: string,
    type: BattleState["actionMessageType"] = "info",
    duration: number = TIMING.actionMessage,
  ): Promise<void> => {
    const sessionId = battleSessionId;
    return new Promise((resolve) => {
      state.actionMessage = message;
      state.actionMessageType = type;

      if (messageTimeout) clearTimeout(messageTimeout);
      messageTimeout = setTimeout(() => {
        if (battleSessionId === sessionId) {
          state.actionMessage = null;
          state.actionMessageType = null;
        }
        resolve();
      }, duration);
    });
  };

  const delay = (ms: number): Promise<void> => {
    return new Promise((resolve) => {
      animationTimeout = setTimeout(resolve, ms);
    });
  };

  // ---------------------------------------------------------------------------
  // Localization Loading
  // ---------------------------------------------------------------------------

  const loadLocalizedNames = async (lang: string): Promise<void> => {
    const allPokemon = [...state.playerTeam, ...state.enemyTeam];
    const promises: Promise<void>[] = [];

    for (const pokemon of allPokemon) {
      if (!pokemon.localizedNames[lang]) {
        promises.push(
          pokemonService
            .getLocalizedName(pokemon.speciesUrl, lang, pokemon.displayName)
            .then((name) => {
              pokemon.localizedNames[lang] = name;
            }),
        );
      }
      for (const move of pokemon.moves) {
        if (!move.localizedNames) move.localizedNames = {};
        if (!move.localizedNames[lang]) {
          promises.push(
            pokemonService
              .getMoveLocalizedName(move.name, lang, move.displayName)
              .then((name) => {
                move.localizedNames![lang] = name;
              }),
          );
        }
      }
    }

    await Promise.all(promises);
    triggerTeamReactivity();
  };

  const loadAvailablePokemonNames = async (lang: string): Promise<void> => {
    const promises: Promise<void>[] = [];

    for (const p of state.availablePokemon) {
      if (!p.localizedNames[lang]) {
        promises.push(
          pokemonService
            .getLocalizedName(p.species.url, lang, p.displayName)
            .then((name) => {
              p.localizedNames[lang] = name;
            }),
        );
      }
    }

    if (promises.length > 0) {
      await Promise.all(promises);
      state.availablePokemon = [...state.availablePokemon];
    }
  };

  // ---------------------------------------------------------------------------
  // Effect Translation
  // ---------------------------------------------------------------------------

  const translateEffectResult = (
    data: EffectResultData,
    pokemonName: string,
  ): string | null => {
    if (!data) return null;
    const t = getTranslations();

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
  };

  // ---------------------------------------------------------------------------
  // State Helpers
  // ---------------------------------------------------------------------------

  const triggerTeamReactivity = (): void => {
    state.playerTeam = [...state.playerTeam];
    state.enemyTeam = [...state.enemyTeam];
  };

  const addLogEntry = (message: string, type: BattleLogEntry["type"]): void => {
    const newEntries = [
      ...state.battleLog,
      { id: ++logIdCounter, message, type, timestamp: Date.now() },
    ];
    state.battleLog = newEntries.slice(-MAX_LOG_ENTRIES);

    requestAnimationFrame(() => {
      const root = getRootElement();
      const logContent = root?.querySelector(".battle-log-content");
      if (logContent) logContent.scrollTop = logContent.scrollHeight;
    });
  };

  const clearTimeouts = (): void => {
    if (animationTimeout) {
      clearTimeout(animationTimeout);
      animationTimeout = null;
    }
    if (messageTimeout) {
      clearTimeout(messageTimeout);
      messageTimeout = null;
    }
  };

  const resetBattleState = (): void => {
    battleSessionId++;
    clearTimeouts();
    audioService.stopMusic();
    Object.assign(state, INITIAL_BATTLE_STATE);
  };

  // ---------------------------------------------------------------------------
  // Turn Execution
  // ---------------------------------------------------------------------------

  const executeTurn = async (
    attacker: BattlePokemon,
    defender: BattlePokemon,
    move: Move,
    isPlayer: boolean,
  ): Promise<void> => {
    const t = getTranslations();
    const attackerName = getPokemonName(attacker);
    const defenderName = getPokemonName(defender);

    const canAct = battleService.canAct(attacker);
    if (!canAct.canAct) {
      const statusMsg =
        attacker.statusCondition === "sleep"
          ? formatMessage(t.status.isFastAsleep, { pokemon: attackerName })
          : formatMessage(t.status.isParalyzed, { pokemon: attackerName });
      addLogEntry(statusMsg, "effect");

      if (attacker.statusCondition === "sleep" && attacker.sleepTurns) {
        attacker.sleepTurns--;
        if (attacker.sleepTurns <= 0) {
          attacker.statusCondition = null;
          addLogEntry(
            formatMessage(t.status.wokeUp, { pokemon: attackerName }),
            "effect",
          );
        }
      }
      return;
    }

    move.pp--;
    const usedMsg = formatMessage(t.actions.used, {
      pokemon: attackerName,
      move: getMoveName(move),
    });
    addLogEntry(usedMsg, "action");
    await showActionMessage(usedMsg, "action", TIMING.longDelay);

    audioService.playSfx("attack");
    await delay(TIMING.shortDelay);

    const { damage, effectiveness, critical } = battleService.calculateDamage(
      attacker,
      defender,
      move,
    );

    if (damage === 0 && move.category !== "status") {
      const noEffectKey = isPlayer ? "noEffectEnemy" : "noEffect";
      addLogEntry(
        effectiveness === 0 ? t.actions[noEffectKey] : t.actions.missed,
        "info",
      );
    } else if (damage > 0) {
      audioService.playSfx("hit");
      defender.currentHp = Math.max(0, defender.currentHp - damage);
      triggerTeamReactivity();

      if (critical) {
        audioService.playSfx("critical");
        addLogEntry(t.actions.criticalHit, "damage");
        await showActionMessage(
          t.actions.criticalHit,
          "damage",
          TIMING.mediumDelay,
        );
      }
      if (effectiveness > 1) {
        audioService.playSfx("superEffective");
        addLogEntry(t.actions.superEffective, "damage");
        await showActionMessage(
          t.actions.superEffective,
          "damage",
          TIMING.mediumDelay,
        );
      } else if (effectiveness > 0 && effectiveness < 1) {
        audioService.playSfx("notVeryEffective");
        addLogEntry(t.actions.notVeryEffective, "info");
      }

      addLogEntry(
        formatMessage(t.actions.tookDamage, { pokemon: defenderName, damage }),
        "damage",
      );
    }

    const effectResult = battleService.applyMoveEffect(
      move,
      attacker,
      defender,
      damage,
    );
    if (effectResult.data) {
      playEffectSound(move);
      const targetName =
        move.effect?.target === "self" ? attackerName : defenderName;
      const effectMsg = translateEffectResult(effectResult.data, targetName);
      if (effectMsg) addLogEntry(effectMsg, "effect");
      triggerTeamReactivity();
    }

    if (defender.currentHp <= 0) {
      await handleFaint(defender, isPlayer);
    }
  };

  const playEffectSound = (move: Move): void => {
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
  };

  const handleFaint = async (
    pokemon: BattlePokemon,
    wasPlayerAttacking: boolean,
  ): Promise<void> => {
    const t = getTranslations();
    const name = getPokemonName(pokemon);

    audioService.playSfx("faint");
    addLogEntry(formatMessage(t.actions.fainted, { pokemon: name }), "faint");
    await showActionMessage(
      formatMessage(t.actions.fainted, { pokemon: name }),
      "damage",
      TIMING.faintMessage,
    );
    await delay(TIMING.shortDelay);

    if (wasPlayerAttacking) {
      const nextIndex = battleService.getNextAvailablePokemon(
        state.enemyTeam,
        state.activeEnemyPokemon,
      );
      if (nextIndex >= 0) {
        state.activeEnemyPokemon = nextIndex;
        const nextPokemon = state.enemyTeam[nextIndex];
        const nextName = getPokemonName(nextPokemon);
        addLogEntry(
          formatMessage(t.actions.enemySentOut, { pokemon: nextName }),
          "info",
        );
        await showActionMessage(
          formatMessage(t.actions.enemySentOut, { pokemon: nextName }),
          "info",
          TIMING.faintMessage,
        );
      }
    } else {
      const nextIndex = battleService.getNextAvailablePokemon(
        state.playerTeam,
        state.activePlayerPokemon,
      );
      if (nextIndex >= 0) {
        state.phase = "switching";
      }
    }
  };

  const applyEndOfTurnEffects = async (): Promise<void> => {
    const t = getTranslations();

    for (const { team, index, isPlayer } of [
      {
        team: state.playerTeam,
        index: state.activePlayerPokemon,
        isPlayer: true,
      },
      {
        team: state.enemyTeam,
        index: state.activeEnemyPokemon,
        isPlayer: false,
      },
    ]) {
      const pokemon = team[index];
      if (!pokemon || pokemon.currentHp <= 0) continue;

      const statusDamage = battleService.applyStatusDamage(pokemon);
      if (statusDamage > 0) {
        pokemon.currentHp = Math.max(0, pokemon.currentHp - statusDamage);
        triggerTeamReactivity();

        const name = getPokemonName(pokemon);
        const statusMsg =
          pokemon.statusCondition === "burn"
            ? formatMessage(t.status.hurtByBurn, { pokemon: name })
            : formatMessage(t.status.hurtByPoison, { pokemon: name });
        addLogEntry(statusMsg, "damage");

        if (pokemon.currentHp <= 0) {
          await handleFaint(pokemon, !isPlayer);
        }
      }
    }
  };

  const checkBattleEnd = async (): Promise<boolean> => {
    const sessionId = battleSessionId;
    const t = getTranslations();

    if (battleService.isTeamDefeated(state.enemyTeam)) {
      audioService.stopMusic();
      await showActionMessage(
        t.gameOver.victory,
        "heal",
        TIMING.victoryMessage,
      );
      if (battleSessionId !== sessionId) return true;
      await audioService.playVictoryMusic();
      if (battleSessionId !== sessionId) return true;
      state.phase = "victory";
      state.winner = "player";
      return true;
    }

    if (battleService.isTeamDefeated(state.playerTeam)) {
      audioService.stopMusic();
      await showActionMessage(
        t.gameOver.defeat,
        "damage",
        TIMING.victoryMessage,
      );
      if (battleSessionId !== sessionId) return true;
      audioService.playSfx("defeat");
      state.phase = "game_over";
      state.winner = "enemy";
      return true;
    }

    return false;
  };

  // ---------------------------------------------------------------------------
  // Event Handlers
  // ---------------------------------------------------------------------------

  const startGame = (): void => {
    initAudio();
    audioService.playMusic("team-select");
    state.phase = "team_select";
  };

  const toggleMute = (): void => {
    initAudio();
    state.isMuted = audioService.toggleMute();
  };

  const changeLanguage = (lang: string): void => {
    onLanguageChange(lang);
    if (state.phase === "team_select" || state.phase === "splash") {
      loadAvailablePokemonNames(lang);
    } else {
      loadLocalizedNames(lang);
    }
  };

  const togglePokemonSelection = (id: number): void => {
    const index = state.selectedForTeam.indexOf(id);
    if (index >= 0) {
      state.selectedForTeam = state.selectedForTeam.filter((pid) => pid !== id);
    } else if (state.selectedForTeam.length < state.teamSize) {
      state.selectedForTeam = [...state.selectedForTeam, id];
    }
  };

  const changeDifficulty = (difficulty: BattleState["difficulty"]): void => {
    state.difficulty = difficulty;
  };

  const startBattle = async (): Promise<void> => {
    initAudio();
    state.isAnimating = true;

    const playerTeam = state.selectedForTeam
      .map((id) => state.availablePokemon.find((p) => p.id === id))
      .filter((p): p is Pokemon => !!p)
      .map((p) => battleService.createBattlePokemon(p, PLAYER_LEVEL, true));
    state.playerTeam = playerTeam;

    const usedIds = new Set(state.selectedForTeam);
    const availableForEnemy = state.availablePokemon.filter(
      (p) => !usedIds.has(p.id),
    );
    const enemyLevel = DIFFICULTY_LEVELS[state.difficulty];

    const enemyTeam: BattlePokemon[] = [];
    for (let i = 0; i < state.teamSize && availableForEnemy.length > 0; i++) {
      const randomIndex = Math.floor(Math.random() * availableForEnemy.length);
      const pokemon = availableForEnemy.splice(randomIndex, 1)[0]!;
      enemyTeam.push(
        battleService.createBattlePokemon(pokemon, enemyLevel, false),
      );
    }
    state.enemyTeam = enemyTeam;

    await loadLocalizedNames(sharedState.language);

    state.activePlayerPokemon = 0;
    state.activeEnemyPokemon = 0;
    state.currentTurn = 1;
    state.isPlayerTurn = true;
    state.battleLog = [];
    state.winner = null;
    state.phase = "battle";
    state.isAnimating = false;

    await audioService.startBattleMusic();

    const player = playerTeam[0];
    const enemy = enemyTeam[0];
    if (player?.cryUrl) audioService.playPokemonCry(player.cryUrl);

    const t = getTranslations();
    const battleStartMsg = formatMessage(t.battle.battleStart, {
      player: getPokemonName(player),
      enemy: getPokemonName(enemy),
    });
    addLogEntry(battleStartMsg, "info");
    await showActionMessage(battleStartMsg, "info", TIMING.battleStart);
  };

  const selectMove = async (moveIndex: number): Promise<void> => {
    if (state.isAnimating || !state.isPlayerTurn) return;

    const player = getPlayerPokemon();
    const enemy = getEnemyPokemon();
    if (!player || !enemy) return;

    const move = player.moves[moveIndex];
    if (!move || move.pp <= 0) return;

    audioService.playSfx("select");
    state.isAnimating = true;

    const playerSpeed = battleService.getEffectiveSpeed(player);
    const enemySpeed = battleService.getEffectiveSpeed(enemy);
    const playerFirst = playerSpeed >= enemySpeed;

    if (playerFirst) {
      await executeTurn(player, enemy, move, true);
      if (!(await checkBattleEnd())) {
        // Only let enemy attack if they didn't faint from player's attack
        if (enemy.currentHp > 0) {
          await delay(TIMING.longDelay);
          const aiMove = battleService.selectAIMove(
            enemy,
            player,
            state.difficulty,
          );
          const moveInMoves = enemy.moves.find((m) => m.name === aiMove.name);
          if (moveInMoves) await executeTurn(enemy, player, moveInMoves, false);
          await checkBattleEnd();
        }
      }
    } else {
      const aiMove = battleService.selectAIMove(
        enemy,
        player,
        state.difficulty,
      );
      const moveInMoves = enemy.moves.find((m) => m.name === aiMove.name);
      if (moveInMoves) await executeTurn(enemy, player, moveInMoves, false);
      if (!(await checkBattleEnd())) {
        // Only let player attack if they didn't faint from enemy's attack
        if (player.currentHp > 0) {
          await delay(TIMING.longDelay);
          await executeTurn(player, enemy, move, true);
          await checkBattleEnd();
        }
      }
    }

    await applyEndOfTurnEffects();
    await checkBattleEnd();

    state.currentTurn++;
    state.isAnimating = false;
  };

  const switchPokemon = (index: number): void => {
    if (state.isAnimating) return;

    const pokemon = state.playerTeam[index];
    if (
      !pokemon ||
      pokemon.currentHp <= 0 ||
      index === state.activePlayerPokemon
    ) {
      return;
    }

    audioService.playSfx("switch");
    const oldPokemon = getPlayerPokemon();
    state.activePlayerPokemon = index;

    const t = getTranslations();
    addLogEntry(
      formatMessage(t.actions.switchedOut, {
        old: getPokemonName(oldPokemon),
        new: getPokemonName(pokemon),
      }),
      "info",
    );

    if (pokemon.cryUrl) audioService.playPokemonCry(pokemon.cryUrl);
    if (state.phase === "switching") state.phase = "battle";
  };

  const restartGame = (): void => {
    resetBattleState();
  };

  // ---------------------------------------------------------------------------
  // Pokemon Loading
  // ---------------------------------------------------------------------------

  const loadAvailablePokemon = async (): Promise<void> => {
    try {
      state.loadingError = null;
      // Use roster IDs from shared state instead of hardcoded list
      const rosterIds = sharedState.rosterIds;
      const pokemon = await Promise.all(
        rosterIds.map((id) => pokemonService.fetchPokemon(id)),
      );
      state.availablePokemon = pokemon.filter((p): p is Pokemon => p !== null);

      // Pre-select favorites if available
      const favoriteIds = sharedState.favorites.map((f) => f.id);
      const availableIds = new Set(state.availablePokemon.map((p) => p.id));
      const matchingFavorites = favoriteIds.filter((id) =>
        availableIds.has(id),
      );
      if (matchingFavorites.length > 0) {
        state.selectedForTeam = matchingFavorites.slice(0, state.teamSize);
      }

      await loadAvailablePokemonNames(sharedState.language);
    } catch (error) {
      console.error("Failed to load Pokemon:", error);
      state.loadingError =
        "Failed to load Pokemon data. Please check your connection and try again.";
    }
  };

  // Initialize
  audioService.preloadMusic();
  setTimeout(() => loadAvailablePokemon(), 0);

  // ---------------------------------------------------------------------------
  // Render Methods
  // ---------------------------------------------------------------------------

  const renderHeader = () => {
    const t = () => getTranslations();
    return html`
      <div class="battle-header">
        <h2>${() => t().title}</h2>
        <div class="header-controls">
          ${() =>
            state.phase === "battle"
              ? html`<span class="turn-counter"
                  >${() => t().turn} ${() => state.currentTurn}</span
                >`
              : null}
          <select
            class="language-select"
            @change=${(e: Event) =>
              changeLanguage((e.target as HTMLSelectElement).value)}
          >
            ${() =>
              LANGUAGES.map(
                (lang) => html`
                  <option
                    value=${lang.code}
                    selected=${lang.code === sharedState.language ? true : null}
                  >
                    ${lang.label}
                  </option>
                `,
              )}
          </select>
          <button
            class="audio-toggle"
            @click=${toggleMute}
            title=${() => (state.isMuted ? t().unmute : t().mute)}
          >
            ${() => (state.isMuted ? "🔇" : "🔊")}
          </button>
        </div>
      </div>
    `;
  };

  const renderPhase = () => {
    // Using match() for state-machine-like phase rendering
    // Each branch is cached and reused when revisited
    return match(() => state.phase, {
      splash: () => renderSplash(),
      team_select: () => renderTeamSelect(),
      battle: () => renderBattle(),
      switching: () => renderBattle(),
      victory: () => renderGameOver(true),
      game_over: () => renderGameOver(false),
    });
  };

  const renderSplash = () => {
    const t = () => getTranslations();
    const isLoading = () =>
      state.availablePokemon.length === 0 && !state.loadingError;
    const hasError = () => state.loadingError !== null;

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
          <p class="splash-subtitle">${() => t().splash.subtitle}</p>
          ${() =>
            hasError()
              ? html`
                  <p class="splash-error">${state.loadingError}</p>
                  <button
                    class="splash-start-btn"
                    @click=${() => loadAvailablePokemon()}
                  >
                    Retry
                  </button>
                `
              : isLoading()
                ? html`<p class="splash-loading">Loading Pokemon...</p>`
                : html`
                    <button class="splash-start-btn" @click=${startGame}>
                      ${() => t().splash.start}
                    </button>
                  `}
        </div>
      </div>
    `;
  };

  const defaultRosterIdsSet = new Set(DEFAULT_ROSTER_IDS);

  const renderTeamSelect = () => {
    const handleResetRoster = () => {
      resetRoster();
      // Reload available Pokemon after roster reset
      loadAvailablePokemon();
    };

    return TeamSelect({
      state,
      translations: getTranslations,
      onTogglePokemon: togglePokemonSelection,
      onStartBattle: startBattle,
      onChangeDifficulty: changeDifficulty,
      getPokemonName: (pokemon) =>
        pokemon.localizedNames[sharedState.language] ?? pokemon.displayName,
      onViewInPokedex: viewInPokedex,
      onRemoveFromRoster: removeFromRoster,
      onResetRoster: handleResetRoster,
      rosterCount: () => sharedState.rosterIds.length,
      defaultRosterIds: defaultRosterIdsSet,
    });
  };

  const renderBattle = () => {
    return html`
      <div class="battle-arena">
        ${renderActionOverlay()}

        <div class="battle-side enemy-side">
          ${HealthBar({
            pokemon: getEnemyPokemon,
            isEnemy: true,
            getName: () => getPokemonName(getEnemyPokemon()),
          })}
          <div class="pokemon-sprite enemy">
            <img
              src=${() => getEnemyPokemon()?.sprite || ""}
              alt=${() => getPokemonName(getEnemyPokemon())}
              class=${() => (state.isAnimating ? "shake" : "")}
            />
          </div>
        </div>

        <div class="battle-side player-side">
          <div class="pokemon-sprite player">
            <img
              src=${() => getPlayerPokemon()?.sprite || ""}
              alt=${() => getPokemonName(getPlayerPokemon())}
              class=${() => (state.isAnimating ? "shake" : "")}
            />
          </div>
          ${HealthBar({
            pokemon: getPlayerPokemon,
            isEnemy: false,
            getName: () => getPokemonName(getPlayerPokemon()),
          })}
        </div>
      </div>

      <div class="battle-controls">
        ${() =>
          state.phase === "switching"
            ? renderSwitchPrompt()
            : renderActionPanel()}
      </div>

      ${BattleLog({ entries: () => state.battleLog })}
    `;
  };

  const renderActionOverlay = () => {
    return html`
      ${() =>
        state.actionMessage
          ? html`
              <div
                class="action-message-overlay"
                data-type=${state.actionMessageType ?? "info"}
              >
                <div class="action-message">${state.actionMessage}</div>
              </div>
            `
          : null}
    `;
  };

  const renderSwitchPrompt = () => {
    const t = () => getTranslations();
    return html`
      <div class="switch-prompt">
        <p>${() => t().battle.choosePokemon}</p>
        <div class="team-slots switch-mode">
          ${each(
            () => state.playerTeam,
            (p) => p.id,
            (pokemonSignal: ReadonlySignal<BattlePokemon>) => {
              const pokemon = pokemonSignal.value;
              const getIndex = () =>
                state.playerTeam.findIndex((p) => p.id === pokemon.id);
              const isActive = () =>
                state.playerTeam[state.activePlayerPokemon]?.id === pokemon.id;
              return TeamSlot({
                pokemon,
                isActive,
                onClick: () => switchPokemon(getIndex()),
                showHpText: true,
              });
            },
          )}
        </div>
      </div>
    `;
  };

  const renderActionPanel = () => {
    const t = () => getTranslations();
    return html`
      <div class="action-panel">
        <div class="main-actions">
          ${MovePanel({
            moves: () => getPlayerPokemon()?.moves ?? [],
            disabled: () => state.isAnimating || !state.isPlayerTurn,
            onSelectMove: selectMove,
            getMoveName: (move) => getMoveName(move),
          })}
        </div>
      </div>

      <div class="team-display">
        <div class="team-label">${() => t().battle.yourTeam}</div>
        <div class="team-slots">
          ${each(
            () => state.playerTeam,
            (p) => p.id,
            (pokemonSignal: ReadonlySignal<BattlePokemon>) => {
              const pokemon = pokemonSignal.value;
              const getIndex = () =>
                state.playerTeam.findIndex((p) => p.id === pokemon.id);
              const isActive = () =>
                state.playerTeam[state.activePlayerPokemon]?.id === pokemon.id;
              return TeamSlot({
                pokemon,
                isActive,
                onClick: () => switchPokemon(getIndex()),
                disabled: () => state.isAnimating,
              });
            },
          )}
        </div>
        <div class="team-label">${() => t().battle.enemyTeam}</div>
        <div class="team-slots enemy">
          ${each(
            () => state.enemyTeam,
            (p) => p.id,
            (pokemonSignal: ReadonlySignal<BattlePokemon>) => {
              const pokemon = pokemonSignal.value;
              const isActive = () =>
                state.enemyTeam[state.activeEnemyPokemon]?.id === pokemon.id;
              return TeamSlot({ pokemon, isActive });
            },
          )}
        </div>
      </div>
    `;
  };

  const renderGameOver = (isVictory: boolean) => {
    const t = () => getTranslations().gameOver;
    return html`
      <div class="game-over ${isVictory ? "victory" : "defeat"}">
        <h2>${() => (isVictory ? t().victory : t().defeat)}</h2>
        <p>${() => (isVictory ? t().victoryMessage : t().defeatMessage)}</p>
        <button class="restart-btn" @click=${restartGame}>
          ${() => (isVictory ? t().playAgain : t().tryAgain)}
        </button>
      </div>
    `;
  };

  // Main render
  return html`
    <div class="pokemon-battle">${renderHeader()} ${renderPhase()}</div>
  `;
}

/**
 * Battle UI translations for i18n support
 */

export interface BattleTranslations {
  // Header
  title: string;
  turn: string;
  mute: string;
  unmute: string;

  // Splash screen
  splash: {
    subtitle: string;
    start: string;
  };

  // Team selection
  teamSelect: {
    title: string;
    info: string;
    selected: string;
    difficulty: string;
    easy: string;
    normal: string;
    hard: string;
    startBattle: string;
    loading: string;
  };

  // Battle
  battle: {
    vs: string;
    battleStart: string;
    yourTeam: string;
    enemyTeam: string;
    choosePokemon: string;
  };

  // Moves and actions
  actions: {
    used: string;
    missed: string;
    noEffect: string;
    noEffectEnemy: string;
    superEffective: string;
    notVeryEffective: string;
    criticalHit: string;
    tookDamage: string;
    fainted: string;
    switchedOut: string;
    sentOut: string;
    enemySentOut: string;
  };

  // Status conditions
  status: {
    burned: string;
    paralyzed: string;
    poisoned: string;
    asleep: string;
    wokeUp: string;
    hurtByBurn: string;
    hurtByPoison: string;
    isParalyzed: string;
    isFastAsleep: string;
  };

  // Stats
  stats: {
    attackRose: string;
    attackRoseSharply: string;
    attackFell: string;
    attackFellSharply: string;
    defenseRose: string;
    defenseRoseSharply: string;
    defenseFell: string;
    defenseFellSharply: string;
    speedRose: string;
    speedRoseSharply: string;
    speedFell: string;
    speedFellSharply: string;
    cantGoHigher: string;
    cantGoLower: string;
    restoredHealth: string;
  };

  // Game over
  gameOver: {
    victory: string;
    victoryMessage: string;
    defeat: string;
    defeatMessage: string;
    playAgain: string;
    tryAgain: string;
  };
}

const translations: Record<string, BattleTranslations> = {
  en: {
    title: "Pokemon Battle",
    turn: "Turn",
    mute: "Mute",
    unmute: "Unmute",
    splash: {
      subtitle: "A Reactive Battle Experience",
      start: "Start Game",
    },
    teamSelect: {
      title: "Choose Your Team",
      info: "Select {count} Pokemon for your team",
      selected: "{current}/{total} selected",
      difficulty: "Difficulty",
      easy: "Easy",
      normal: "Normal",
      hard: "Hard",
      startBattle: "Start Battle!",
      loading: "Loading Pokemon...",
    },
    battle: {
      vs: "vs",
      battleStart: "Battle Start! {player} vs {enemy}!",
      yourTeam: "Your Team:",
      enemyTeam: "Enemy Team:",
      choosePokemon: "Choose a Pokemon to send out:",
    },
    actions: {
      used: "{pokemon} used {move}!",
      missed: "The attack missed!",
      noEffect: "It doesn't affect you...",
      noEffectEnemy: "It doesn't affect the enemy...",
      superEffective: "It's super effective!",
      notVeryEffective: "It's not very effective...",
      criticalHit: "A critical hit!",
      tookDamage: "{pokemon} took {damage} damage!",
      fainted: "{pokemon} fainted!",
      switchedOut: "{old} was switched out for {new}!",
      sentOut: "Go! {pokemon}!",
      enemySentOut: "Enemy sent out {pokemon}!",
    },
    status: {
      burned: "{pokemon} was burned!",
      paralyzed: "{pokemon} was paralyzed!",
      poisoned: "{pokemon} was poisoned!",
      asleep: "{pokemon} fell asleep!",
      wokeUp: "{pokemon} woke up!",
      hurtByBurn: "{pokemon} is hurt by its burn!",
      hurtByPoison: "{pokemon} is hurt by poison!",
      isParalyzed: "{pokemon} is paralyzed! It can't move!",
      isFastAsleep: "{pokemon} is fast asleep.",
    },
    stats: {
      attackRose: "{pokemon}'s Attack rose!",
      attackRoseSharply: "{pokemon}'s Attack rose sharply!",
      attackFell: "{pokemon}'s Attack fell!",
      attackFellSharply: "{pokemon}'s Attack fell sharply!",
      defenseRose: "{pokemon}'s Defense rose!",
      defenseRoseSharply: "{pokemon}'s Defense rose sharply!",
      defenseFell: "{pokemon}'s Defense fell!",
      defenseFellSharply: "{pokemon}'s Defense fell sharply!",
      speedRose: "{pokemon}'s Speed rose!",
      speedRoseSharply: "{pokemon}'s Speed rose sharply!",
      speedFell: "{pokemon}'s Speed fell!",
      speedFellSharply: "{pokemon}'s Speed fell sharply!",
      cantGoHigher: "{pokemon}'s {stat} can't go any higher!",
      cantGoLower: "{pokemon}'s {stat} can't go any lower!",
      restoredHealth: "{pokemon} restored health!",
    },
    gameOver: {
      victory: "Victory!",
      victoryMessage: "You defeated the enemy team!",
      defeat: "Defeat!",
      defeatMessage: "Your team was defeated...",
      playAgain: "Play Again",
      tryAgain: "Try Again",
    },
  },

  fr: {
    title: "Combat Pokemon",
    turn: "Tour",
    mute: "Muet",
    unmute: "Son",
    splash: {
      subtitle: "Une Experience de Combat Reactive",
      start: "Jouer",
    },
    teamSelect: {
      title: "Choisissez Votre Equipe",
      info: "Selectionnez {count} Pokemon pour votre equipe",
      selected: "{current}/{total} selectionnes",
      difficulty: "Difficulte",
      easy: "Facile",
      normal: "Normal",
      hard: "Difficile",
      startBattle: "Commencer le Combat!",
      loading: "Chargement des Pokemon...",
    },
    battle: {
      vs: "contre",
      battleStart: "Debut du combat! {player} contre {enemy}!",
      yourTeam: "Votre Equipe:",
      enemyTeam: "Equipe Ennemie:",
      choosePokemon: "Choisissez un Pokemon a envoyer:",
    },
    actions: {
      used: "{pokemon} utilise {move}!",
      missed: "L'attaque a rate!",
      noEffect: "Ca n'a aucun effet sur vous...",
      noEffectEnemy: "Ca n'a aucun effet sur l'ennemi...",
      superEffective: "C'est super efficace!",
      notVeryEffective: "Ce n'est pas tres efficace...",
      criticalHit: "Coup critique!",
      tookDamage: "{pokemon} a subi {damage} degats!",
      fainted: "{pokemon} est K.O.!",
      switchedOut: "{old} a ete remplace par {new}!",
      sentOut: "Go! {pokemon}!",
      enemySentOut: "L'ennemi envoie {pokemon}!",
    },
    status: {
      burned: "{pokemon} est brule!",
      paralyzed: "{pokemon} est paralyse!",
      poisoned: "{pokemon} est empoisonne!",
      asleep: "{pokemon} s'est endormi!",
      wokeUp: "{pokemon} s'est reveille!",
      hurtByBurn: "{pokemon} souffre de sa brulure!",
      hurtByPoison: "{pokemon} souffre du poison!",
      isParalyzed: "{pokemon} est paralyse! Il ne peut pas bouger!",
      isFastAsleep: "{pokemon} dort profondement.",
    },
    stats: {
      attackRose: "L'Attaque de {pokemon} augmente!",
      attackRoseSharply: "L'Attaque de {pokemon} augmente beaucoup!",
      attackFell: "L'Attaque de {pokemon} baisse!",
      attackFellSharply: "L'Attaque de {pokemon} baisse beaucoup!",
      defenseRose: "La Defense de {pokemon} augmente!",
      defenseRoseSharply: "La Defense de {pokemon} augmente beaucoup!",
      defenseFell: "La Defense de {pokemon} baisse!",
      defenseFellSharply: "La Defense de {pokemon} baisse beaucoup!",
      speedRose: "La Vitesse de {pokemon} augmente!",
      speedRoseSharply: "La Vitesse de {pokemon} augmente beaucoup!",
      speedFell: "La Vitesse de {pokemon} baisse!",
      speedFellSharply: "La Vitesse de {pokemon} baisse beaucoup!",
      cantGoHigher: "{stat} de {pokemon} ne peut plus augmenter!",
      cantGoLower: "{stat} de {pokemon} ne peut plus baisser!",
      restoredHealth: "{pokemon} recupere des PV!",
    },
    gameOver: {
      victory: "Victoire!",
      victoryMessage: "Vous avez vaincu l'equipe ennemie!",
      defeat: "Defaite!",
      defeatMessage: "Votre equipe a ete vaincue...",
      playAgain: "Rejouer",
      tryAgain: "Reessayer",
    },
  },

  de: {
    title: "Pokemon Kampf",
    turn: "Runde",
    mute: "Stumm",
    unmute: "Ton",
    splash: {
      subtitle: "Ein Reaktives Kampferlebnis",
      start: "Spiel Starten",
    },
    teamSelect: {
      title: "Wahle Dein Team",
      info: "Wahle {count} Pokemon fur dein Team",
      selected: "{current}/{total} ausgewahlt",
      difficulty: "Schwierigkeit",
      easy: "Leicht",
      normal: "Normal",
      hard: "Schwer",
      startBattle: "Kampf Starten!",
      loading: "Pokemon werden geladen...",
    },
    battle: {
      vs: "gegen",
      battleStart: "Kampf Start! {player} gegen {enemy}!",
      yourTeam: "Dein Team:",
      enemyTeam: "Gegnerisches Team:",
      choosePokemon: "Wahle ein Pokemon zum Einwechseln:",
    },
    actions: {
      used: "{pokemon} setzt {move} ein!",
      missed: "Die Attacke ging daneben!",
      noEffect: "Es hat keine Wirkung auf dich...",
      noEffectEnemy: "Es hat keine Wirkung auf den Gegner...",
      superEffective: "Das ist sehr effektiv!",
      notVeryEffective: "Das ist nicht sehr effektiv...",
      criticalHit: "Ein Volltreffer!",
      tookDamage: "{pokemon} erleidet {damage} Schaden!",
      fainted: "{pokemon} ist kampfunfahig!",
      switchedOut: "{old} wurde gegen {new} ausgewechselt!",
      sentOut: "Los! {pokemon}!",
      enemySentOut: "Der Gegner schickt {pokemon}!",
    },
    status: {
      burned: "{pokemon} erleidet Verbrennungen!",
      paralyzed: "{pokemon} ist paralysiert!",
      poisoned: "{pokemon} wurde vergiftet!",
      asleep: "{pokemon} ist eingeschlafen!",
      wokeUp: "{pokemon} ist aufgewacht!",
      hurtByBurn: "{pokemon} leidet unter seiner Verbrennung!",
      hurtByPoison: "{pokemon} leidet unter dem Gift!",
      isParalyzed: "{pokemon} ist paralysiert! Es kann sich nicht bewegen!",
      isFastAsleep: "{pokemon} schlaft tief und fest.",
    },
    stats: {
      attackRose: "Der Angriff von {pokemon} steigt!",
      attackRoseSharply: "Der Angriff von {pokemon} steigt stark!",
      attackFell: "Der Angriff von {pokemon} sinkt!",
      attackFellSharply: "Der Angriff von {pokemon} sinkt stark!",
      defenseRose: "Die Verteidigung von {pokemon} steigt!",
      defenseRoseSharply: "Die Verteidigung von {pokemon} steigt stark!",
      defenseFell: "Die Verteidigung von {pokemon} sinkt!",
      defenseFellSharply: "Die Verteidigung von {pokemon} sinkt stark!",
      speedRose: "Die Initiative von {pokemon} steigt!",
      speedRoseSharply: "Die Initiative von {pokemon} steigt stark!",
      speedFell: "Die Initiative von {pokemon} sinkt!",
      speedFellSharply: "Die Initiative von {pokemon} sinkt stark!",
      cantGoHigher: "{stat} von {pokemon} kann nicht weiter steigen!",
      cantGoLower: "{stat} von {pokemon} kann nicht weiter sinken!",
      restoredHealth: "{pokemon} hat KP wiederhergestellt!",
    },
    gameOver: {
      victory: "Sieg!",
      victoryMessage: "Du hast das gegnerische Team besiegt!",
      defeat: "Niederlage!",
      defeatMessage: "Dein Team wurde besiegt...",
      playAgain: "Nochmal Spielen",
      tryAgain: "Erneut Versuchen",
    },
  },

  es: {
    title: "Combate Pokemon",
    turn: "Turno",
    mute: "Silenciar",
    unmute: "Sonido",
    splash: {
      subtitle: "Una Experiencia de Combate Reactiva",
      start: "Iniciar Juego",
    },
    teamSelect: {
      title: "Elige Tu Equipo",
      info: "Selecciona {count} Pokemon para tu equipo",
      selected: "{current}/{total} seleccionados",
      difficulty: "Dificultad",
      easy: "Facil",
      normal: "Normal",
      hard: "Dificil",
      startBattle: "Iniciar Combate!",
      loading: "Cargando Pokemon...",
    },
    battle: {
      vs: "contra",
      battleStart: "Comienza el Combate! {player} contra {enemy}!",
      yourTeam: "Tu Equipo:",
      enemyTeam: "Equipo Enemigo:",
      choosePokemon: "Elige un Pokemon para enviar:",
    },
    actions: {
      used: "{pokemon} uso {move}!",
      missed: "El ataque fallo!",
      noEffect: "No te afecta...",
      noEffectEnemy: "No afecta al enemigo...",
      superEffective: "Es super efectivo!",
      notVeryEffective: "No es muy efectivo...",
      criticalHit: "Golpe critico!",
      tookDamage: "{pokemon} recibio {damage} de dano!",
      fainted: "{pokemon} se debilito!",
      switchedOut: "{old} fue cambiado por {new}!",
      sentOut: "Adelante! {pokemon}!",
      enemySentOut: "El enemigo envio a {pokemon}!",
    },
    status: {
      burned: "{pokemon} se quemo!",
      paralyzed: "{pokemon} esta paralizado!",
      poisoned: "{pokemon} fue envenenado!",
      asleep: "{pokemon} se durmio!",
      wokeUp: "{pokemon} desperto!",
      hurtByBurn: "{pokemon} sufre por su quemadura!",
      hurtByPoison: "{pokemon} sufre por el veneno!",
      isParalyzed: "{pokemon} esta paralizado! No puede moverse!",
      isFastAsleep: "{pokemon} esta profundamente dormido.",
    },
    stats: {
      attackRose: "El Ataque de {pokemon} subio!",
      attackRoseSharply: "El Ataque de {pokemon} subio mucho!",
      attackFell: "El Ataque de {pokemon} bajo!",
      attackFellSharply: "El Ataque de {pokemon} bajo mucho!",
      defenseRose: "La Defensa de {pokemon} subio!",
      defenseRoseSharply: "La Defensa de {pokemon} subio mucho!",
      defenseFell: "La Defensa de {pokemon} bajo!",
      defenseFellSharply: "La Defensa de {pokemon} bajo mucho!",
      speedRose: "La Velocidad de {pokemon} subio!",
      speedRoseSharply: "La Velocidad de {pokemon} subio mucho!",
      speedFell: "La Velocidad de {pokemon} bajo!",
      speedFellSharply: "La Velocidad de {pokemon} bajo mucho!",
      cantGoHigher: "{stat} de {pokemon} no puede subir mas!",
      cantGoLower: "{stat} de {pokemon} no puede bajar mas!",
      restoredHealth: "{pokemon} recupero salud!",
    },
    gameOver: {
      victory: "Victoria!",
      victoryMessage: "Derrotaste al equipo enemigo!",
      defeat: "Derrota!",
      defeatMessage: "Tu equipo fue derrotado...",
      playAgain: "Jugar de Nuevo",
      tryAgain: "Intentar de Nuevo",
    },
  },

  ja: {
    title: "ポケモンバトル",
    turn: "ターン",
    mute: "ミュート",
    unmute: "サウンド",
    splash: {
      subtitle: "リアクティブなバトル体験",
      start: "ゲームスタート",
    },
    teamSelect: {
      title: "チームを選ぼう",
      info: "チームに{count}匹のポケモンを選んでください",
      selected: "{current}/{total}匹選択中",
      difficulty: "難易度",
      easy: "やさしい",
      normal: "ふつう",
      hard: "むずかしい",
      startBattle: "バトルスタート!",
      loading: "ポケモンを読み込み中...",
    },
    battle: {
      vs: "VS",
      battleStart: "バトルスタート! {player} VS {enemy}!",
      yourTeam: "あなたのチーム:",
      enemyTeam: "相手のチーム:",
      choosePokemon: "くりだすポケモンを選んでください:",
    },
    actions: {
      used: "{pokemon}の{move}!",
      missed: "攻撃は外れた!",
      noEffect: "効果がないようだ...",
      noEffectEnemy: "相手には効果がないようだ...",
      superEffective: "効果はばつぐんだ!",
      notVeryEffective: "効果はいまひとつだ...",
      criticalHit: "急所に当たった!",
      tookDamage: "{pokemon}は{damage}のダメージを受けた!",
      fainted: "{pokemon}は倒れた!",
      switchedOut: "{old}を{new}に交代した!",
      sentOut: "行け! {pokemon}!",
      enemySentOut: "相手は{pokemon}をくりだした!",
    },
    status: {
      burned: "{pokemon}はやけどを負った!",
      paralyzed: "{pokemon}はまひした!",
      poisoned: "{pokemon}は毒をあびた!",
      asleep: "{pokemon}は眠ってしまった!",
      wokeUp: "{pokemon}は目を覚ました!",
      hurtByBurn: "{pokemon}はやけどのダメージを受けた!",
      hurtByPoison: "{pokemon}は毒のダメージを受けた!",
      isParalyzed: "{pokemon}はまひして動けない!",
      isFastAsleep: "{pokemon}はぐうぐう眠っている。",
    },
    stats: {
      attackRose: "{pokemon}のこうげきが上がった!",
      attackRoseSharply: "{pokemon}のこうげきがぐーんと上がった!",
      attackFell: "{pokemon}のこうげきが下がった!",
      attackFellSharply: "{pokemon}のこうげきがガクッと下がった!",
      defenseRose: "{pokemon}のぼうぎょが上がった!",
      defenseRoseSharply: "{pokemon}のぼうぎょがぐーんと上がった!",
      defenseFell: "{pokemon}のぼうぎょが下がった!",
      defenseFellSharply: "{pokemon}のぼうぎょがガクッと下がった!",
      speedRose: "{pokemon}のすばやさが上がった!",
      speedRoseSharply: "{pokemon}のすばやさがぐーんと上がった!",
      speedFell: "{pokemon}のすばやさが下がった!",
      speedFellSharply: "{pokemon}のすばやさがガクッと下がった!",
      cantGoHigher: "{pokemon}の{stat}はもう上がらない!",
      cantGoLower: "{pokemon}の{stat}はもう下がらない!",
      restoredHealth: "{pokemon}は体力を回復した!",
    },
    gameOver: {
      victory: "勝利!",
      victoryMessage: "相手のチームに勝った!",
      defeat: "敗北!",
      defeatMessage: "チームは全滅した...",
      playAgain: "もう一度",
      tryAgain: "再挑戦",
    },
  },

  ko: {
    title: "포켓몬 배틀",
    turn: "턴",
    mute: "음소거",
    unmute: "소리",
    splash: {
      subtitle: "리액티브 배틀 체험",
      start: "게임 시작",
    },
    teamSelect: {
      title: "팀을 선택하세요",
      info: "팀에 {count}마리의 포켓몬을 선택하세요",
      selected: "{current}/{total} 선택됨",
      difficulty: "난이도",
      easy: "쉬움",
      normal: "보통",
      hard: "어려움",
      startBattle: "배틀 시작!",
      loading: "포켓몬 로딩 중...",
    },
    battle: {
      vs: "VS",
      battleStart: "배틀 시작! {player} VS {enemy}!",
      yourTeam: "내 팀:",
      enemyTeam: "상대 팀:",
      choosePokemon: "내보낼 포켓몬을 선택하세요:",
    },
    actions: {
      used: "{pokemon}의 {move}!",
      missed: "공격이 빗나갔다!",
      noEffect: "효과가 없는 것 같다...",
      noEffectEnemy: "상대에게는 효과가 없는 것 같다...",
      superEffective: "효과가 굉장했다!",
      notVeryEffective: "효과가 별로인 것 같다...",
      criticalHit: "급소에 맞았다!",
      tookDamage: "{pokemon}은(는) {damage}의 데미지를 입었다!",
      fainted: "{pokemon}은(는) 쓰러졌다!",
      switchedOut: "{old}을(를) {new}(으)로 교체했다!",
      sentOut: "가랏! {pokemon}!",
      enemySentOut: "상대가 {pokemon}을(를) 내보냈다!",
    },
    status: {
      burned: "{pokemon}은(는) 화상을 입었다!",
      paralyzed: "{pokemon}은(는) 마비되었다!",
      poisoned: "{pokemon}은(는) 독에 걸렸다!",
      asleep: "{pokemon}은(는) 잠들어 버렸다!",
      wokeUp: "{pokemon}은(는) 눈을 떴다!",
      hurtByBurn: "{pokemon}은(는) 화상 데미지를 입었다!",
      hurtByPoison: "{pokemon}은(는) 독 데미지를 입었다!",
      isParalyzed: "{pokemon}은(는) 마비되어 움직일 수 없다!",
      isFastAsleep: "{pokemon}은(는) 깊이 잠들어 있다.",
    },
    stats: {
      attackRose: "{pokemon}의 공격이 올랐다!",
      attackRoseSharply: "{pokemon}의 공격이 크게 올랐다!",
      attackFell: "{pokemon}의 공격이 떨어졌다!",
      attackFellSharply: "{pokemon}의 공격이 크게 떨어졌다!",
      defenseRose: "{pokemon}의 방어가 올랐다!",
      defenseRoseSharply: "{pokemon}의 방어가 크게 올랐다!",
      defenseFell: "{pokemon}의 방어가 떨어졌다!",
      defenseFellSharply: "{pokemon}의 방어가 크게 떨어졌다!",
      speedRose: "{pokemon}의 스피드가 올랐다!",
      speedRoseSharply: "{pokemon}의 스피드가 크게 올랐다!",
      speedFell: "{pokemon}의 스피드가 떨어졌다!",
      speedFellSharply: "{pokemon}의 스피드가 크게 떨어졌다!",
      cantGoHigher: "{pokemon}의 {stat}은(는) 더 이상 오르지 않는다!",
      cantGoLower: "{pokemon}의 {stat}은(는) 더 이상 내려가지 않는다!",
      restoredHealth: "{pokemon}은(는) 체력을 회복했다!",
    },
    gameOver: {
      victory: "승리!",
      victoryMessage: "상대 팀을 이겼다!",
      defeat: "패배!",
      defeatMessage: "팀이 전멸했다...",
      playAgain: "다시 플레이",
      tryAgain: "다시 도전",
    },
  },

  it: {
    title: "Lotta Pokemon",
    turn: "Turno",
    mute: "Muto",
    unmute: "Suono",
    splash: {
      subtitle: "Un'Esperienza di Lotta Reattiva",
      start: "Inizia Gioco",
    },
    teamSelect: {
      title: "Scegli la Tua Squadra",
      info: "Seleziona {count} Pokemon per la tua squadra",
      selected: "{current}/{total} selezionati",
      difficulty: "Difficolta",
      easy: "Facile",
      normal: "Normale",
      hard: "Difficile",
      startBattle: "Inizia Lotta!",
      loading: "Caricamento Pokemon...",
    },
    battle: {
      vs: "contro",
      battleStart: "Inizia la Lotta! {player} contro {enemy}!",
      yourTeam: "La Tua Squadra:",
      enemyTeam: "Squadra Nemica:",
      choosePokemon: "Scegli un Pokemon da mandare in campo:",
    },
    actions: {
      used: "{pokemon} usa {move}!",
      missed: "L'attacco e andato a vuoto!",
      noEffect: "Non ti colpisce...",
      noEffectEnemy: "Non colpisce il nemico...",
      superEffective: "E superefficace!",
      notVeryEffective: "Non e molto efficace...",
      criticalHit: "Brutto colpo!",
      tookDamage: "{pokemon} subisce {damage} danni!",
      fainted: "{pokemon} e esausto!",
      switchedOut: "{old} e stato sostituito con {new}!",
      sentOut: "Vai! {pokemon}!",
      enemySentOut: "Il nemico manda {pokemon}!",
    },
    status: {
      burned: "{pokemon} si e scottato!",
      paralyzed: "{pokemon} e paralizzato!",
      poisoned: "{pokemon} e avvelenato!",
      asleep: "{pokemon} si e addormentato!",
      wokeUp: "{pokemon} si e svegliato!",
      hurtByBurn: "{pokemon} soffre per la scottatura!",
      hurtByPoison: "{pokemon} soffre per il veleno!",
      isParalyzed: "{pokemon} e paralizzato! Non puo muoversi!",
      isFastAsleep: "{pokemon} sta dormendo profondamente.",
    },
    stats: {
      attackRose: "L'Attacco di {pokemon} aumenta!",
      attackRoseSharply: "L'Attacco di {pokemon} aumenta molto!",
      attackFell: "L'Attacco di {pokemon} diminuisce!",
      attackFellSharply: "L'Attacco di {pokemon} diminuisce molto!",
      defenseRose: "La Difesa di {pokemon} aumenta!",
      defenseRoseSharply: "La Difesa di {pokemon} aumenta molto!",
      defenseFell: "La Difesa di {pokemon} diminuisce!",
      defenseFellSharply: "La Difesa di {pokemon} diminuisce molto!",
      speedRose: "La Velocita di {pokemon} aumenta!",
      speedRoseSharply: "La Velocita di {pokemon} aumenta molto!",
      speedFell: "La Velocita di {pokemon} diminuisce!",
      speedFellSharply: "La Velocita di {pokemon} diminuisce molto!",
      cantGoHigher: "{stat} di {pokemon} non puo aumentare!",
      cantGoLower: "{stat} di {pokemon} non puo diminuire!",
      restoredHealth: "{pokemon} ha recuperato salute!",
    },
    gameOver: {
      victory: "Vittoria!",
      victoryMessage: "Hai sconfitto la squadra nemica!",
      defeat: "Sconfitta!",
      defeatMessage: "La tua squadra e stata sconfitta...",
      playAgain: "Gioca Ancora",
      tryAgain: "Riprova",
    },
  },

  "zh-Hans": {
    title: "宝可梦对战",
    turn: "回合",
    mute: "静音",
    unmute: "声音",
    splash: {
      subtitle: "响应式对战体验",
      start: "开始游戏",
    },
    teamSelect: {
      title: "选择你的队伍",
      info: "为你的队伍选择{count}只宝可梦",
      selected: "已选择 {current}/{total}",
      difficulty: "难度",
      easy: "简单",
      normal: "普通",
      hard: "困难",
      startBattle: "开始对战!",
      loading: "正在加载宝可梦...",
    },
    battle: {
      vs: "对战",
      battleStart: "对战开始! {player} 对战 {enemy}!",
      yourTeam: "你的队伍:",
      enemyTeam: "敌方队伍:",
      choosePokemon: "选择要派出的宝可梦:",
    },
    actions: {
      used: "{pokemon}使用了{move}!",
      missed: "攻击未命中!",
      noEffect: "对你没有效果...",
      noEffectEnemy: "对敌人没有效果...",
      superEffective: "效果拔群!",
      notVeryEffective: "效果不太好...",
      criticalHit: "击中要害!",
      tookDamage: "{pokemon}受到了{damage}点伤害!",
      fainted: "{pokemon}倒下了!",
      switchedOut: "{old}被替换为{new}!",
      sentOut: "去吧! {pokemon}!",
      enemySentOut: "敌人派出了{pokemon}!",
    },
    status: {
      burned: "{pokemon}被烧伤了!",
      paralyzed: "{pokemon}麻痹了!",
      poisoned: "{pokemon}中毒了!",
      asleep: "{pokemon}睡着了!",
      wokeUp: "{pokemon}醒来了!",
      hurtByBurn: "{pokemon}受到了烧伤的伤害!",
      hurtByPoison: "{pokemon}受到了毒素的伤害!",
      isParalyzed: "{pokemon}因麻痹而无法行动!",
      isFastAsleep: "{pokemon}正在熟睡中。",
    },
    stats: {
      attackRose: "{pokemon}的攻击提高了!",
      attackRoseSharply: "{pokemon}的攻击大幅提高了!",
      attackFell: "{pokemon}的攻击降低了!",
      attackFellSharply: "{pokemon}的攻击大幅降低了!",
      defenseRose: "{pokemon}的防御提高了!",
      defenseRoseSharply: "{pokemon}的防御大幅提高了!",
      defenseFell: "{pokemon}的防御降低了!",
      defenseFellSharply: "{pokemon}的防御大幅降低了!",
      speedRose: "{pokemon}的速度提高了!",
      speedRoseSharply: "{pokemon}的速度大幅提高了!",
      speedFell: "{pokemon}的速度降低了!",
      speedFellSharply: "{pokemon}的速度大幅降低了!",
      cantGoHigher: "{pokemon}的{stat}已经无法再提高了!",
      cantGoLower: "{pokemon}的{stat}已经无法再降低了!",
      restoredHealth: "{pokemon}恢复了体力!",
    },
    gameOver: {
      victory: "胜利!",
      victoryMessage: "你打败了敌方队伍!",
      defeat: "失败!",
      defeatMessage: "你的队伍被打败了...",
      playAgain: "再玩一次",
      tryAgain: "重新挑战",
    },
  },
};

/**
 * Get translations for a given language code
 */
export function getBattleTranslations(lang: string): BattleTranslations {
  return translations[lang] ?? translations["en"]!;
}

/**
 * Format a translation string with placeholder values
 * Example: formatMessage("{pokemon} used {move}!", { pokemon: "Pikachu", move: "Thunder" })
 */
export function formatMessage(
  template: string,
  values: Record<string, string | number>,
): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) =>
    values[key] !== undefined ? String(values[key]) : `{${key}}`,
  );
}

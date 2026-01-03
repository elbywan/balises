/**
 * Pokedex UI translations for i18n support
 */

export interface PokedexTranslations {
  // Header
  title: string;

  // Search
  searchPlaceholder: string;

  // Navigation
  random: string;

  // Pokemon card actions
  toggleShiny: string;
  playCry: string;
  toggleFavorite: string;
  compareMode: string;
  addToRoster: string;
  removeFromRoster: string;
  rosterFull: string;
  addToTeam: string;
  removeFromTeam: string;
  inBattleTeam: string;
  goToBattle: string;

  // Stats
  stats: string;
  total: string;
  statNames: {
    hp: string;
    attack: string;
    defense: string;
    "special-attack": string;
    "special-defense": string;
    speed: string;
  };

  // Favorites
  favorites: string;
  noFavorites: string;
  removeFavorite: string;

  // Compare
  shuffleCompare: string;

  // Loading/Error
  loading: string;
  notFound: string;
}

const translations: Record<string, PokedexTranslations> = {
  en: {
    title: "Pokedex",
    searchPlaceholder: "Search Pokemon...",
    random: "Random",
    toggleShiny: "Toggle Shiny",
    playCry: "Play Cry",
    toggleFavorite: "Toggle Favorite",
    compareMode: "Compare Mode",
    addToRoster: "Add to Battle Roster",
    removeFromRoster: "Remove from Battle Roster",
    rosterFull: "Roster Full",
    addToTeam: "Add to Team",
    removeFromTeam: "Remove from Team",
    inBattleTeam: "In Battle Team",
    goToBattle: "Go to Battle",
    stats: "Stats",
    total: "Total",
    statNames: {
      hp: "HP",
      attack: "Attack",
      defense: "Defense",
      "special-attack": "Sp. Atk",
      "special-defense": "Sp. Def",
      speed: "Speed",
    },
    favorites: "Favorites",
    noFavorites: "No favorites yet",
    removeFavorite: "Remove from favorites",
    shuffleCompare: "Shuffle Compare",
    loading: "Loading...",
    notFound: "Pokemon not found",
  },

  fr: {
    title: "Pokedex",
    searchPlaceholder: "Rechercher un Pokemon...",
    random: "Aleatoire",
    toggleShiny: "Chromatique",
    playCry: "Ecouter le cri",
    toggleFavorite: "Ajouter aux favoris",
    compareMode: "Mode comparaison",
    addToRoster: "Ajouter au roster",
    removeFromRoster: "Retirer du roster",
    rosterFull: "Roster complet",
    addToTeam: "Ajouter a l'equipe",
    removeFromTeam: "Retirer de l'equipe",
    inBattleTeam: "Dans l'equipe de combat",
    goToBattle: "Aller au combat",
    stats: "Statistiques",
    total: "Total",
    statNames: {
      hp: "PV",
      attack: "Attaque",
      defense: "Defense",
      "special-attack": "Atq. Spe.",
      "special-defense": "Def. Spe.",
      speed: "Vitesse",
    },
    favorites: "Favoris",
    noFavorites: "Aucun favori",
    removeFavorite: "Retirer des favoris",
    shuffleCompare: "Changer la comparaison",
    loading: "Chargement...",
    notFound: "Pokemon introuvable",
  },

  de: {
    title: "Pokedex",
    searchPlaceholder: "Pokemon suchen...",
    random: "Zufallig",
    toggleShiny: "Schillernd",
    playCry: "Ruf abspielen",
    toggleFavorite: "Favorit umschalten",
    compareMode: "Vergleichsmodus",
    addToRoster: "Zum Kader hinzufugen",
    removeFromRoster: "Aus Kader entfernen",
    rosterFull: "Kader voll",
    addToTeam: "Zum Team hinzufugen",
    removeFromTeam: "Aus Team entfernen",
    inBattleTeam: "Im Kampfteam",
    goToBattle: "Zum Kampf",
    stats: "Statuswerte",
    total: "Gesamt",
    statNames: {
      hp: "KP",
      attack: "Angriff",
      defense: "Verteidigung",
      "special-attack": "Sp.-Ang.",
      "special-defense": "Sp.-Vert.",
      speed: "Initiative",
    },
    favorites: "Favoriten",
    noFavorites: "Keine Favoriten",
    removeFavorite: "Aus Favoriten entfernen",
    shuffleCompare: "Vergleich andern",
    loading: "Laden...",
    notFound: "Pokemon nicht gefunden",
  },

  es: {
    title: "Pokedex",
    searchPlaceholder: "Buscar Pokemon...",
    random: "Aleatorio",
    toggleShiny: "Variocolor",
    playCry: "Reproducir grito",
    toggleFavorite: "Agregar a favoritos",
    compareMode: "Modo comparacion",
    addToRoster: "Agregar al plantel",
    removeFromRoster: "Quitar del plantel",
    rosterFull: "Plantel lleno",
    addToTeam: "Agregar al equipo",
    removeFromTeam: "Quitar del equipo",
    inBattleTeam: "En el equipo de batalla",
    goToBattle: "Ir a la batalla",
    stats: "Estadisticas",
    total: "Total",
    statNames: {
      hp: "PS",
      attack: "Ataque",
      defense: "Defensa",
      "special-attack": "Atq. Esp.",
      "special-defense": "Def. Esp.",
      speed: "Velocidad",
    },
    favorites: "Favoritos",
    noFavorites: "Sin favoritos",
    removeFavorite: "Quitar de favoritos",
    shuffleCompare: "Cambiar comparacion",
    loading: "Cargando...",
    notFound: "Pokemon no encontrado",
  },

  it: {
    title: "Pokedex",
    searchPlaceholder: "Cerca Pokemon...",
    random: "Casuale",
    toggleShiny: "Cromatico",
    playCry: "Ascolta verso",
    toggleFavorite: "Aggiungi ai preferiti",
    compareMode: "Modalita confronto",
    addToRoster: "Aggiungi al roster",
    removeFromRoster: "Rimuovi dal roster",
    rosterFull: "Roster pieno",
    addToTeam: "Aggiungi alla squadra",
    removeFromTeam: "Rimuovi dalla squadra",
    inBattleTeam: "Nella squadra di lotta",
    goToBattle: "Vai alla lotta",
    stats: "Statistiche",
    total: "Totale",
    statNames: {
      hp: "PS",
      attack: "Attacco",
      defense: "Difesa",
      "special-attack": "Att. Sp.",
      "special-defense": "Dif. Sp.",
      speed: "Velocita",
    },
    favorites: "Preferiti",
    noFavorites: "Nessun preferito",
    removeFavorite: "Rimuovi dai preferiti",
    shuffleCompare: "Cambia confronto",
    loading: "Caricamento...",
    notFound: "Pokemon non trovato",
  },

  ja: {
    title: "ポケモン図鑑",
    searchPlaceholder: "ポケモンを検索...",
    random: "ランダム",
    toggleShiny: "色違い",
    playCry: "鳴き声を再生",
    toggleFavorite: "お気に入り",
    compareMode: "比較モード",
    addToRoster: "ロスターに追加",
    removeFromRoster: "ロスターから削除",
    rosterFull: "ロスターがいっぱいです",
    addToTeam: "チームに追加",
    removeFromTeam: "チームから削除",
    inBattleTeam: "バトルチームに入っています",
    goToBattle: "バトルへ",
    stats: "ステータス",
    total: "合計",
    statNames: {
      hp: "HP",
      attack: "こうげき",
      defense: "ぼうぎょ",
      "special-attack": "とくこう",
      "special-defense": "とくぼう",
      speed: "すばやさ",
    },
    favorites: "お気に入り",
    noFavorites: "お気に入りがありません",
    removeFavorite: "お気に入りから削除",
    shuffleCompare: "比較をシャッフル",
    loading: "読み込み中...",
    notFound: "ポケモンが見つかりません",
  },

  ko: {
    title: "포켓몬 도감",
    searchPlaceholder: "포켓몬 검색...",
    random: "랜덤",
    toggleShiny: "이로치",
    playCry: "울음소리 재생",
    toggleFavorite: "즐겨찾기",
    compareMode: "비교 모드",
    addToRoster: "로스터에 추가",
    removeFromRoster: "로스터에서 제거",
    rosterFull: "로스터가 가득 찼습니다",
    addToTeam: "팀에 추가",
    removeFromTeam: "팀에서 제거",
    inBattleTeam: "배틀 팀에 있음",
    goToBattle: "배틀로 이동",
    stats: "능력치",
    total: "합계",
    statNames: {
      hp: "HP",
      attack: "공격",
      defense: "방어",
      "special-attack": "특수공격",
      "special-defense": "특수방어",
      speed: "스피드",
    },
    favorites: "즐겨찾기",
    noFavorites: "즐겨찾기가 없습니다",
    removeFavorite: "즐겨찾기에서 제거",
    shuffleCompare: "비교 대상 변경",
    loading: "로딩 중...",
    notFound: "포켓몬을 찾을 수 없습니다",
  },

  "zh-Hans": {
    title: "宝可梦图鉴",
    searchPlaceholder: "搜索宝可梦...",
    random: "随机",
    toggleShiny: "异色",
    playCry: "播放叫声",
    toggleFavorite: "收藏",
    compareMode: "对比模式",
    addToRoster: "添加到阵容",
    removeFromRoster: "从阵容移除",
    rosterFull: "阵容已满",
    addToTeam: "添加到队伍",
    removeFromTeam: "从队伍移除",
    inBattleTeam: "已在对战队伍中",
    goToBattle: "前往对战",
    stats: "能力值",
    total: "总计",
    statNames: {
      hp: "HP",
      attack: "攻击",
      defense: "防御",
      "special-attack": "特攻",
      "special-defense": "特防",
      speed: "速度",
    },
    favorites: "收藏夹",
    noFavorites: "暂无收藏",
    removeFavorite: "取消收藏",
    shuffleCompare: "更换对比对象",
    loading: "加载中...",
    notFound: "未找到宝可梦",
  },
};

/**
 * Get Pokedex translations for a given language code
 */
export function getPokedexTranslations(lang: string): PokedexTranslations {
  return translations[lang] ?? translations["en"]!;
}

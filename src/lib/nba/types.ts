export type GameStatusState = "pre" | "in" | "post";

export type GameLeader = {
  name: string;
  athleteId: string;
  athleteName: string;
  value: number;
  displayValue: string;
  headshot?: string | null;
};

export type GameTeam = {
  abbr: string;
  name: string;
  displayName: string;
  score: number | null;
  record: string | null;
  winner: boolean;
  logo: string | null;
  leaders: GameLeader[];
};

export type GameSummary = {
  id: string;
  date: string;
  gameDate: string;
  shortName: string;
  name: string;
  statusState: GameStatusState;
  statusDetail: string;
  completed: boolean;
  home: GameTeam;
  away: GameTeam;
  venue: string | null;
  broadcast: string | null;
  /** 系列赛比分，仅季后赛（seasonType = post）有值；常规赛/季前赛一律为 null */
  series: string | null;
  /** 赛季阶段：pre=季前赛 regular=常规赛 post=季后赛 */
  seasonType?: "pre" | "regular" | "post";
  odds: { detail: string; overUnder: number | null } | null;
  link: string | null;
};

export type ScoreboardResult = {
  date: string;
  source: DataSource;
  games: GameSummary[];
  fetchedAt: string;
};

export type NewsItem = {
  id: string;
  headline: string;
  description: string | null;
  url: string | null;
  imageUrl: string | null;
  publishedAt: string | null;
  categories: string[];
};

export type NewsResult = {
  source: DataSource;
  items: NewsItem[];
  fetchedAt: string;
  /** 下一次自动刷新的时间（北京时间 00:00 / 12:00 边界），ISO 字符串 */
  nextAutoRefreshAt?: string;
  /** true 表示本次为手动刷新预览：数据未写入共享库，仅返回给当前请求者 */
  manual?: boolean;
};

export type DataSource = "live" | "cache" | "offline";

export type PlayerSeasonStat = {
  seasonLabel: string;
  seasonYear: number;
  seasonType: "regular" | "playoffs";
  teamAbbr: string | null;
  gp: number | null;
  min: number | null;
  pts: number | null;
  reb: number | null;
  ast: number | null;
  stl: number | null;
  blk: number | null;
  tov: number | null;
  fgp: number | null;
  tpp: number | null;
  ftp: number | null;
  source: DataSource;
};

export type PlayerGameLogEntry = {
  date: string;
  opponent: string;
  homeAway: string;
  result: string;
  minutes: string | null;
  pts: string | null;
  reb: string | null;
  ast: string | null;
  fg: string | null;
  detail: string | null;
};

export type StatSplit = {
  label: string;
  gp: number | null;
  min: number | null;
  pts: number | null;
  reb: number | null;
  ast: number | null;
  stl: number | null;
  blk: number | null;
  fgp: number | null;
  tpp: number | null;
  ftp: number | null;
};

export type PlayerProfile = {
  espnId: string;
  fullName: string;
  shortName: string | null;
  zhName: string | null;
  teamAbbr: string | null;
  teamName: string | null;
  teamZh: string | null;
  position: string | null;
  headshot: string | null;
  height: string | null;
  weight: string | null;
  age: number | null;
  debutYear: number | null;
  draftText: string | null;
  college: string | null;
  experience: string | null;
  active: boolean;
  currentSeason: StatSplit | null;
  careerRegular: StatSplit | null;
  careerPlayoffs: StatSplit | null;
  seasons: PlayerSeasonStat[];
  recentGames: PlayerGameLogEntry[];
  awards: string[];
  note: string | null;
  source: DataSource;
  fetchedAt: string;
};

export type LeaderRow = {
  rank: number;
  espnId: string;
  playerName: string;
  teamAbbr: string | null;
  gp: number | null;
  min: number | null;
  pts: number | null;
  reb: number | null;
  ast: number | null;
  stl: number | null;
  blk: number | null;
  fgp: number | null;
  tpp: number | null;
  ftp: number | null;
  tov: number | null;
};

/* ------------------------------ 比赛详情 ------------------------------ */

/** 逐节比分（OT 为加时） */
export type QuarterScore = {
  label: string;
  away: number | null;
  home: number | null;
};

/** 球队数据对比行（双向条形图） */
export type TeamStatCompare = {
  key: string;
  label: string;
  away: number | null;
  home: number | null;
  awayDisplay: string;
  homeDisplay: string;
  lowerIsBetter?: boolean;
};

/** boxscore 球员行 */
export type BoxscorePlayer = {
  athleteId: string;
  name: string;
  headshot: string | null;
  position: string | null;
  jersey: string | null;
  starter: boolean;
  didNotPlay: boolean;
  reason: string | null;
  minutes: number | null;
  pts: number | null;
  reb: number | null;
  ast: number | null;
  stl: number | null;
  blk: number | null;
  tov: number | null;
  pf: number | null;
  plusMinus: number | null;
  fg: string | null;
  tp: string | null;
  ft: string | null;
};

export type GameDetailTeam = {
  abbr: string;
  /** 英文队名（shortDisplayName，如 Knicks / Celtics） */
  name: string;
  displayName: string;
  logo: string | null;
  score: number | null;
  record: string | null;
  winner: boolean;
  players: BoxscorePlayer[];
};

export type GameDetail = {
  id: string;
  /** 比赛日期 YYYY-MM-DD（UTC 开赛时间切片，仅兜底用；展示优先取 URL 的 date 参数） */
  gameDate: string;
  statusState: GameStatusState;
  statusDetail: string;
  completed: boolean;
  seasonType: "pre" | "regular" | "post";
  /** 季后赛系列赛比分；常规赛/季前赛为 null */
  series: string | null;
  venue: string | null;
  attendance: number | null;
  away: GameDetailTeam;
  home: GameDetailTeam;
  quarters: QuarterScore[];
  teamStats: TeamStatCompare[];
};

export type GameDetailResult = {
  detail: GameDetail | null;
  source: DataSource;
  fetchedAt: string;
};

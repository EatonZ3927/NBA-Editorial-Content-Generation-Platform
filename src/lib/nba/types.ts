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
  series: string | null;
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

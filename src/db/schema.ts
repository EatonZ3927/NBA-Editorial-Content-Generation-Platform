import {
  boolean,
  integer,
  jsonb,
  pgTable,
  real,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

/** 球员基础信息缓存（来自 ESPN） */
export const players = pgTable("players", {
  id: serial("id").primaryKey(),
  espnId: text("espn_id").notNull().unique(),
  fullName: text("full_name").notNull(),
  displayName: text("display_name"),
  teamAbbr: text("team_abbr"),
  teamName: text("team_name"),
  position: text("position"),
  headshot: text("headshot"),
  height: text("height"),
  weight: text("weight"),
  age: integer("age"),
  debutYear: integer("debut_year"),
  draftText: text("draft_text"),
  college: text("college"),
  experience: text("experience"),
  active: boolean("active").default(true),
  careerSummary: jsonb("career_summary"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

/** 球员分赛季历史数据缓存（来自 NBA stats leagueLeaders） */
export const playerSeasons = pgTable("player_seasons", {
  id: serial("id").primaryKey(),
  uniqueKey: text("unique_key").notNull().unique(),
  espnId: text("espn_id").notNull(),
  playerName: text("player_name").notNull(),
  seasonLabel: text("season_label").notNull(),
  seasonYear: integer("season_year").notNull(),
  seasonType: text("season_type").notNull(),
  teamAbbr: text("team_abbr"),
  gp: integer("gp"),
  min: real("min"),
  pts: real("pts"),
  reb: real("reb"),
  ast: real("ast"),
  stl: real("stl"),
  blk: real("blk"),
  tov: real("tov"),
  fgp: real("fgp"),
  tpp: real("tpp"),
  ftp: real("ftp"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

/** 比赛比分缓存 */
export const games = pgTable("games", {
  id: serial("id").primaryKey(),
  espnEventId: text("espn_event_id").notNull().unique(),
  gameDate: text("game_date").notNull(),
  awayAbbr: text("away_abbr").notNull(),
  homeAbbr: text("home_abbr").notNull(),
  awayName: text("away_name"),
  homeName: text("home_name"),
  awayScore: integer("away_score"),
  homeScore: integer("home_score"),
  awayRecord: text("away_record"),
  homeRecord: text("home_record"),
  statusState: text("status_state"),
  statusDetail: text("status_detail"),
  venue: text("venue"),
  broadcast: text("broadcast"),
  series: text("series"),
  payload: jsonb("payload"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

/** 新闻缓存 */
export const newsItems = pgTable("news_items", {
  id: serial("id").primaryKey(),
  espnId: text("espn_id").notNull().unique(),
  headline: text("headline").notNull(),
  description: text("description"),
  url: text("url"),
  imageUrl: text("image_url"),
  publishedAt: text("published_at"),
  categories: jsonb("categories"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

/** 编辑生成的文案草稿 */
export const drafts = pgTable("drafts", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  templateId: text("template_id"),
  templateName: text("template_name"),
  tone: text("tone"),
  length: text("length"),
  tags: jsonb("tags"),
  wordCount: integer("word_count").notNull().default(0),
  sourceSummary: text("source_summary"),
  sourceData: jsonb("source_data"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type PlayerRow = typeof players.$inferSelect;
export type PlayerSeasonRow = typeof playerSeasons.$inferSelect;
export type GameRow = typeof games.$inferSelect;
export type NewsRow = typeof newsItems.$inferSelect;
export type DraftRow = typeof drafts.$inferSelect;

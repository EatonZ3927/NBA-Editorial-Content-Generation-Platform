import type { GameSummary, LeaderRow, NewsItem, PlayerProfile, StatSplit } from "@/lib/nba/types";
import { displayNameZh, teamShort, teamZh } from "@/lib/nba/teams";

export type TemplateId =
  | "game-recap"
  | "game-preview"
  | "player-night"
  | "player-career"
  | "data-drop"
  | "social-post"
  | "headline-pack"
  | "news-brief"
  | "award-watch";

export type ToneId = "hot" | "pro" | "fun" | "brief" | "long";
export type LengthId = "short" | "mid" | "long";

export type CopyContext = {
  player?: PlayerProfile | null;
  game?: GameSummary | null;
  news?: NewsItem | null;
  leaders?: LeaderRow[] | null;
  seasonYear?: number | null;
};

export type CopyResult = {
  title: string;
  body: string;
  tags: string[];
  dataPoints: string[];
  wordCount: number;
  templateId: TemplateId;
  templateName: string;
  tone: ToneId;
  length: LengthId;
  sourceSummary: string;
  generatedBy?: "ai" | "template";
  aiError?: string;
};

export const TEMPLATES: {
  id: TemplateId;
  name: string;
  emoji: string;
  desc: string;
  need: "game" | "player" | "any";
}[] = [
  { id: "game-recap", name: "赛后战报", emoji: "🏀", desc: "终场比分、关键先生、分差与走势一气呵成", need: "game" },
  { id: "game-preview", name: "赛前预告", emoji: "⏰", desc: "看点、对位、盘口与一句话悬念", need: "game" },
  { id: "player-night", name: "球星之夜", emoji: "🔥", desc: "围绕一位球星的当晚表现写透", need: "player" },
  { id: "player-career", name: "生涯图鉴", emoji: "📖", desc: "从首秀到本赛季的生涯数据长文", need: "player" },
  { id: "data-drop", name: "数据盘点", emoji: "📊", desc: "硬核数据流，命中率与趋势全给到", need: "player" },
  { id: "social-post", name: "社媒短文案", emoji: "💬", desc: "微博/朋友圈风格，短平快有梗", need: "any" },
  { id: "headline-pack", name: "标题方案包", emoji: "🏷️", desc: "一次产出 8 条备选标题+副标题", need: "any" },
  { id: "news-brief", name: "新闻快讯改写", emoji: "📰", desc: "把外电新闻改成中文快讯通稿", need: "any" },
  { id: "award-watch", name: "奖项观察", emoji: "🏆", desc: "MVP/得分榜趋势观察稿", need: "any" },
];

export const TONES: { id: ToneId; name: string; desc: string }[] = [
  { id: "hot", name: "热血激情", desc: "情绪拉满，动词密集" },
  { id: "pro", name: "专业数据流", desc: "克制冷静，数据说话" },
  { id: "fun", name: "幽默段子", desc: "带梗、带节奏、可玩梗" },
  { id: "brief", name: "简洁快讯", desc: "一句话说清，导语式" },
  { id: "long", name: "深度长文", desc: "层层递进，适合专栏" },
];

export const LENGTHS: { id: LengthId; name: string; hint: string }[] = [
  { id: "short", name: "短", hint: "≤120 字" },
  { id: "mid", name: "中", hint: "150-320 字" },
  { id: "long", name: "长", hint: "400 字以上" },
];

/* ------------------------------ 工具函数 ------------------------------ */

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(rng: () => number, arr: T[]): T {
  return arr[Math.floor(rng() * arr.length) % arr.length];
}

function n1(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return (Math.round(value * 10) / 10).toFixed(1);
}

function pct(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return `${(value * 100).toFixed(1)}%`;
}

function splitLine(s: StatSplit | null | undefined): string {
  if (!s) return "—";
  return `${n1(s.pts)}分 ${n1(s.reb)}篮板 ${n1(s.ast)}助攻`;
}

function shootingLine(s: StatSplit | null | undefined): string {
  if (!s) return "—";
  return `投篮${pct(s.fgp)} / 三分${pct(s.tpp)} / 罚球${pct(s.ftp)}`;
}

function playerLabel(player: PlayerProfile): string {
  return player.zhName ?? player.fullName;
}

function scoreText(game: GameSummary): string {
  const { home, away } = game;
  return `${teamShort(home.abbr)} ${home.score ?? 0} : ${away.score ?? 0} ${teamShort(away.abbr)}`;
}

function winnerOf(game: GameSummary): { team: typeof game.home; loser: typeof game.home; margin: number } {
  const homeWin = (game.home.score ?? 0) >= (game.away.score ?? 0);
  const winner = homeWin ? game.home : game.away;
  const loser = homeWin ? game.away : game.home;
  return { team: winner, loser, margin: Math.abs((game.home.score ?? 0) - (game.away.score ?? 0)) };
}

function topLeader(team: GameSummary["home"], kind = "points"): string {
  const leader = team.leaders.find((l) => l.name === kind) ?? team.leaders[0];
  if (!leader) return "—";
  const label = kind === "rebounds" ? "篮板" : kind === "assists" ? "助攻" : "得分";
  return `${displayNameZh(leader.athleteName)} ${leader.displayValue}${label === "得分" ? "分" : label}`;
}

function bestSeason(player: PlayerProfile) {
  const regular = player.seasons.filter((s) => s.seasonType === "regular" && (s.gp ?? 0) >= 20);
  if (regular.length === 0) return null;
  return regular.reduce((best, cur) => ((cur.pts ?? 0) > (best.pts ?? 0) ? cur : best));
}

function rookieSeason(player: PlayerProfile) {
  const regular = player.seasons.filter((s) => s.seasonType === "regular");
  if (regular.length === 0) return null;
  return regular.reduce((oldest, cur) => (cur.seasonYear < oldest.seasonYear ? cur : oldest));
}

function seasonCount(player: PlayerProfile): number {
  return new Set(player.seasons.filter((s) => s.seasonType === "regular").map((s) => s.seasonYear)).size;
}

function lastGamesLine(player: PlayerProfile): string {
  const games = player.recentGames.slice(0, 5).filter((g) => g.pts && g.pts !== "--");
  if (games.length === 0) return "";
  const pts = games.map((g) => Number(g.pts)).filter((p) => Number.isFinite(p));
  if (pts.length === 0) return "";
  const avg = pts.reduce((a, b) => a + b, 0) / pts.length;
  const best = games.reduce((b, g) => (Number(g.pts) > Number(b.pts) ? g : b), games[0]);
  return `近${pts.length}战场均${n1(avg)}分，最高单场${best.pts}分（对${best.opponent}）`;
}

/* ------------------------------ 文案片段库 ------------------------------ */

const HOT = {
  openers: [
    "终场哨响，",
    "第四节最后一分钟，",
    "计时器归零的那一刻，",
    "灯亮球停，",
    "这一夜属于",
  ],
  bridges: [
    "更衣室的气氛已经完全不一样了。",
    "主场球迷起立鼓掌的时间比暂停还长。",
    "这波节奏，直接把比赛带走。",
    "对手叫了暂停，但势头已经收不回来了。",
  ],
  closers: [
    "这一战，值得反复回看。",
    "写进赛季集锦毫无压力。",
    "下一场，接着看。",
    "这，就是NBA的夜晚。",
  ],
};

const PRO = {
  openers: [
    "数据先说话：",
    "先看结果：",
    "复盘几个关键数字：",
    "从技术统计出发：",
  ],
  bridges: [
    "效率层面的变化值得关注。",
    "这套输出的稳定性，是本场胜负手。",
    "样本量虽然有限，但方向清晰。",
    "回合占有率的倾斜同样明显。",
  ],
  closers: [
    "后续走势，仍需持续观察。",
    "数据不会说谎，趋势值得关注。",
    "结论留待更长样本检验。",
  ],
};

const FUN = {
  openers: ["别问，问就是：", "看完只想说一句：", "朋友们，", "离谱但又合理的夜晚：", "热搜预警："],
  bridges: [
    "这个状态，建议对手直接提前研究录像。",
    "防守他的那个哥们儿，今晚估计睡不着。",
    "评论区已经开始吵了，我先站好队。",
    "今晚的白开水都能喝出香槟味。",
  ],
  closers: [
    "不吹不黑，点个赞再走。",
    "评论区交给你们，我先去看集锦了。",
    "懂的都懂，散会。",
    "剧本都不敢这么写。",
  ],
};

const BRIEF = {
  openers: ["快讯：", "战报：", "刚刚，", "据赛场消息："],
  bridges: ["", "", ""],
  closers: ["（完）", "更多数据见后续更新。", ""],
};

const LONGFORM = {
  openers: [
    "把镜头拉远一点看，",
    "如果只看比分，你会错过很多东西——",
    "这个赛季的故事线，正在一点点收拢：",
    "先从一个前提说起：",
  ],
  bridges: [
    "这背后的结构性原因，比单场表现更值得讨论。",
    "当一支球队的核心输出如此稳定，教练组的排兵空间就会宽松很多。",
    "从建队逻辑看，这笔资产的兑现速度已经超出预期。",
    "长期看，真正决定上限的仍是健康与阵容适配度。",
  ],
  closers: [
    "赛季很长，故事才刚写到中段。",
    "留给管理层的问题，其实只剩一个：还要等多久？",
    "时间会给答案，但答案通常不温柔。",
  ],
};

function bank(tone: ToneId) {
  switch (tone) {
    case "hot":
      return HOT;
    case "pro":
      return PRO;
    case "fun":
      return FUN;
    case "brief":
      return BRIEF;
    default:
      return LONGFORM;
  }
}

/* ------------------------------ 标题生成 ------------------------------ */

function titlesFor(ctx: CopyContext, rng: () => number): string[] {
  const out: string[] = [];
  const { player, game, leaders } = ctx;
  if (game && (game.statusState === "post" || game.completed)) {
    const { team, loser, margin } = winnerOf(game);
    out.push(`${teamZh(team.abbr)}${margin}分力克${teamZh(loser.abbr)}${game.home.abbr === team.abbr ? "，主场守住关键一战" : "，客场带走胜利"}`);
    out.push(`${scoreText(game)}｜这场球的关键先生是谁？`);
    out.push(`${margin <= 5 ? `分差只有${margin}分，` : "一边倒？"}${teamShort(team.abbr)}用${margin}分差距说话`);
    out.push(`塔尖之夜：${topLeader(team)}扛着${teamShort(team.abbr)}往前走`);
  }
  if (game && game.statusState !== "post") {
    out.push(`${teamZh(game.away.abbr)}客战${teamZh(game.home.abbr)}：三条不得不看的看点`);
    out.push(`${game.shortName}赛前指南｜胜负手在哪一组对位？`);
  }
  if (player) {
    const season = player.currentSeason ?? player.careerRegular;
    out.push(`${playerLabel(player)}${season ? `场均${n1(season.pts)}分` : "本赛季"}，他还在重新定义自己的上限`);
    out.push(`${playerLabel(player)}：${seasonCount(player)}个赛季、${player.careerRegular?.gp ?? "—"}场比赛之后，依然稳定`);
    const best = bestSeason(player);
    if (best) out.push(`从${best.seasonLabel}的${n1(best.pts)}分说起：${playerLabel(player)}的曲线如何画成`);
    out.push(`${playerLabel(player)}数据档案：${splitLine(player.careerRegular)}的生涯基线`);
  }
  if (leaders && leaders.length > 0) {
    out.push(`得分榜前五：${leaders.slice(0, 5).map((r) => `${r.playerName} ${n1(r.pts)}`).join(" / ")}`);
  }
  out.push(pick(rng, [
    "今晚的NBA，看点都在这里",
    "一图流读懂本轮回合",
    "别只刷集锦，数据更刺激",
    "赛季拐点，可能就藏在这一场",
  ]));
  return Array.from(new Set(out)).slice(0, 8);
}

/* ------------------------------ 正文生成 ------------------------------ */

function playerParagraphs(ctx: CopyContext, tone: ToneId, length: LengthId, rng: () => number): string[] {
  const player = ctx.player;
  if (!player) return [];
  const p = playerLabel(player);
  const season = player.currentSeason ?? player.careerRegular;
  const career = player.careerRegular;
  const parts: string[] = [];

  const intro = pick(rng, [
    `${p}${player.teamZh ? `（${player.teamZh}）` : ""}${season ? `本季出战${season.gp ?? "—"}场，场均${n1(season.min)}分钟交出${splitLine(season)}` : "依然是对手赛前必研究的名字"}`,
    `把${p}的赛季拆开看：${season ? `${n1(season.pts)}分、${n1(season.reb)}篮板、${n1(season.ast)}助攻，${shootingLine(season)}` : "数据仍在更新"}`,
    `${p}${player.age ? `，${player.age}岁` : ""}${player.draftText ? `，${player.draftText}` : ""}，本赛季继续刷新外界对他的预期`,
  ]);
  parts.push(`${intro}。`);

  if (career) {
    parts.push(
      pick(rng, [
        `拉长到生涯维度：${career.gp ?? "—"}场，场均${splitLine(career)}，${shootingLine(career)}。`,
        `生涯基线${splitLine(career)}，命中率维度${shootingLine(career)}，${seasonCount(player)}个赛季的稳定性摆在这里。`,
      ]),
    );
  }

  const best = bestSeason(player);
  if (best) {
    parts.push(
      `巅峰样本来自${best.seasonLabel}赛季：场均${n1(best.pts)}分 ${n1(best.reb)}篮板 ${n1(best.ast)}助攻，投篮${pct(best.fgp)}、三分${pct(best.tpp)}。`,
    );
  }

  const rookie = rookieSeason(player);
  if (rookie && best && rookie.seasonYear !== best.seasonYear) {
    parts.push(
      `对比${rookie.seasonLabel}新秀季的${n1(rookie.pts)}分，${p}的场均得分抬升了${n1((best.pts ?? 0) - (rookie.pts ?? 0))}分，曲线肉眼可见。`,
    );
  }

  const playoffs = player.careerPlayoffs;
  if (playoffs && playoffs.gp) {
    parts.push(`季后赛样本${playoffs.gp}场，场均${splitLine(playoffs)}，硬仗成色可查。`);
  }

  const recent = lastGamesLine(player);
  if (recent) parts.push(`状态面：${recent}。`);

  if (player.awards.length > 0) {
    parts.push(`荣誉柜：${player.awards.slice(0, 6).join("、")}${player.awards.length > 6 ? "……" : ""}。`);
  }

  if (tone === "long") {
    parts.push(
      pick(rng, [
        `技术层面最被低估的是他的选择能力：${player.currentSeason ? `场均${n1(player.currentSeason.ast)}助攻的组织输出` : "传球选择的稳定性"}，让全队进攻有了节奏锚点。`,
        `在如今的联盟节奏里，${n1(player.currentSeason?.tpp ? player.currentSeason.tpp * 100 : 36)}%级别的三分效率意味着空间价值——防守者必须贴到三分线外两步，这本身就是进攻资源。`,
      ]),
    );
  }
  return length === "short" ? parts.slice(0, 1) : length === "mid" ? parts.slice(0, 3) : parts;
}

function gameParagraphs(ctx: CopyContext, tone: ToneId, length: LengthId, rng: () => number): string[] {
  const game = ctx.game;
  if (!game) return [];
  const parts: string[] = [];
  const finished = game.completed || game.statusState === "post";

  if (finished) {
    const { team, loser, margin } = winnerOf(game);
    parts.push(
      `${teamZh(game.away.abbr)}客场挑战${teamZh(game.home.abbr)}，最终${scoreText(game)}，${teamZh(team.abbr)}以${margin}分优势取胜${game.venue ? `（${game.venue}）` : ""}。`,
    );
    parts.push(
      `${teamShort(team.abbr)}方面，${topLeader(team)}；${teamShort(loser.abbr)}这边，${topLeader(loser)}。${team.record ? `${teamShort(team.abbr)}战绩来到${team.record}` : ""}${loser.record ? `，${teamShort(loser.abbr)}则为${loser.record}` : ""}。`,
    );
    parts.push(
      pick(rng, [
        `${margin <= 3 ? "分差被压到最后一个回合，胜负手在细节。" : margin >= 20 ? "比赛早早进入垃圾时间，主力第四节都在板凳上笑。" : "胜负在中段那波攻防转换里定调。"}`,
        `${teamShort(team.abbr)}赢在命中率与失误控制的平衡，${teamShort(loser.abbr)}则在关键回合连续打铁。`,
      ]),
    );
    if (game.series) parts.push(`系列赛进度：${game.series}。`);
  } else {
    parts.push(
      `${teamZh(game.away.abbr)}（${game.away.record ?? "—"}）将做客${game.venue ?? teamZh(game.home.abbr)}挑战${teamZh(game.home.abbr)}（${game.home.record ?? "—"}）${game.broadcast ? `，转播：${game.broadcast}` : ""}。`,
    );
    parts.push(
      `看点：${topLeader(game.away)}与${topLeader(game.home)}的正面对话，${game.odds?.detail ? `盘口${game.odds.detail}` : "胜负手大概率在内线篮板"}${game.odds?.overUnder ? `，总分盘${game.odds.overUnder}` : ""}。`,
    );
    parts.push(
      pick(rng, [
        "两队的回合数都排在联盟前列，比赛大概率是跑起来的节奏。",
        "关键在于谁能先把比分咬住，逼对手进轮换。",
      ]),
    );
  }
  return length === "short" ? parts.slice(0, 1) : length === "mid" ? parts.slice(0, 2) : parts;
}

function leadersParagraphs(ctx: CopyContext, length: LengthId): string[] {
  const leaders = ctx.leaders ?? [];
  if (leaders.length === 0) return [];
  const season = ctx.seasonYear ?? "";
  const top5 = leaders.slice(0, 5);
  const parts: string[] = [
    `${season}赛季得分榜前五：${top5.map((r, i) => `${i + 1}.${r.playerName}（${r.teamAbbr ?? "—"}）${n1(r.pts)}分`).join("，")}。`,
    `效率侧：${top5
      .map((r) => `${r.playerName}投篮${pct(r.fgp)}${r.tpp ? `/三分${pct(r.tpp)}` : ""}`)
      .join("；")}。`,
  ];
  if (length === "long") {
    parts.push(
      `出勤同样关键：${top5.map((r) => `${r.playerName}${r.gp ?? "—"}场`).join("、")}。高产与稳定的平衡，往往在四月才见分晓。`,
    );
  }
  return parts;
}

function newsParagraphs(ctx: CopyContext, length: LengthId): string[] {
  const news = ctx.news;
  if (!news) return [];
  const parts = [
    `据外电消息，${news.headline.replace(/\s+/g, " ")}。`,
    news.description ? `${news.description.replace(/\s+/g, " ")}` : "",
    `我们将持续跟进后续进展${news.categories.length ? `（标签：${news.categories.slice(0, 3).join("、")}）` : ""}。`,
  ].filter(Boolean);
  return length === "short" ? parts.slice(0, 1) : parts;
}

/* ------------------------------ 主入口 ------------------------------ */

export function generateCopy(input: {
  template: TemplateId;
  tone: ToneId;
  length: LengthId;
  ctx: CopyContext;
  keywords?: string;
  variant?: number;
}): CopyResult {
  const { template, tone, length, ctx } = input;
  const rng = mulberry32(
    (input.variant ?? 1) * 7919 + template.length * 131 + tone.length * 37 + length.length * 17 +
      (ctx.player?.fullName.length ?? 0) * 3,
  );
  const phrases = bank(tone);
  const keywords = (input.keywords ?? "").trim();
  const kw = keywords.length > 0 ? keywords.split(/[,，\s]+/).filter(Boolean) : [];

  let bodyParagraphs: string[] = [];
  switch (template) {
    case "game-recap":
    case "game-preview":
      bodyParagraphs = gameParagraphs(ctx, tone, length, rng);
      break;
    case "player-night":
    case "player-career":
    case "data-drop":
      bodyParagraphs = playerParagraphs(ctx, tone, length, rng);
      break;
    case "news-brief":
      bodyParagraphs = newsParagraphs(ctx, length);
      break;
    case "award-watch":
      bodyParagraphs = leadersParagraphs(ctx, length);
      break;
    case "social-post":
    case "headline-pack":
    default:
      bodyParagraphs = [
        ...(ctx.player ? playerParagraphs(ctx, tone, "short", rng) : []),
        ...(ctx.game ? gameParagraphs(ctx, tone, "short", rng) : []),
        ...(ctx.leaders?.length ? leadersParagraphs(ctx, "short") : []),
      ];
      break;
  }

  if (template === "social-post") {
    const p = ctx.player;
    const g = ctx.game;
    const lines: string[] = [];
    if (g && (g.completed || g.statusState === "post")) {
      const { team, margin } = winnerOf(g);
      lines.push(`${teamZh(team.abbr)}拿下！${scoreText(g)}，净胜${margin}分 ${pick(rng, ["🔥", "💪", "⚡"])}`);
      lines.push(`本场之星：${topLeader(team)}`);
    } else if (g) {
      lines.push(`${g.shortName} 马上开打 ${pick(rng, ["🍿", "⏳", "👀"])}`);
      lines.push(`焦点对位：${topLeader(g.away, "points")} VS ${topLeader(g.home, "points")}`);
    }
    if (p) {
      const s = p.currentSeason ?? p.careerRegular;
      lines.push(`${playerLabel(p)}${s ? `本赛季${splitLine(s)}` : ""} ${pick(rng, ["🐺", "🎯", "🏀", "📈"])}`);
      const recent = lastGamesLine(p);
      if (recent) lines.push(recent);
    }
    lines.push(pick(rng, phrases.bridges.filter(Boolean)));
    if (kw.length) lines.push(`关键词：${kw.join(" ")}`);
    bodyParagraphs = lines.filter(Boolean);
  }

  if (template === "headline-pack") {
    const list = titlesFor(ctx, rng);
    bodyParagraphs = [
      "【备选标题】",
      ...list.map((t, i) => `${i + 1}. ${t}`),
      "",
      "【导语参考】",
      `${pick(rng, phrases.openers.filter(Boolean))}${ctx.player ? `${playerLabel(ctx.player)}的数据值得一张长图。` : "这一夜的故事值得写进赛季笔记。"}`,
    ];
  }

  if (bodyParagraphs.length === 0) {
    bodyParagraphs = [
      "暂未取到足够的比赛或球员数据，请先在「球星检索」或「比分中心」选择一个数据源，再重新生成文案。",
    ];
  }

  if (kw.length && template !== "social-post" && template !== "headline-pack") {
    bodyParagraphs.push(`（本文涉及关键词：${kw.join("、")}）`);
  }

  if (length === "long" && template !== "headline-pack") {
    const bridge = pick(rng, phrases.bridges);
    if (bridge) bodyParagraphs.splice(Math.min(2, bodyParagraphs.length), 0, bridge);
    const closer = pick(rng, phrases.closers);
    if (closer) bodyParagraphs.push(closer);
  } else if (template !== "headline-pack" && template !== "social-post") {
    const opener = pick(rng, phrases.openers);
    if (opener) bodyParagraphs[0] = `${opener}${bodyParagraphs[0]}`;
    if (length === "mid") {
      const closer = pick(rng, phrases.closers);
      if (closer) bodyParagraphs.push(closer);
    }
  }

  const titleList = titlesFor(ctx, rng);
  const title =
    template === "headline-pack"
      ? `标题方案包｜${ctx.player ? playerLabel(ctx.player) : ctx.game ? ctx.game.shortName : "NBA 赛事"}`
      : titleList[0] ?? "NBA 赛事速递";

  const body = bodyParagraphs.filter((p) => p !== undefined && p !== null).join("\n\n");
  const dataPoints = collectDataPoints(ctx);
  const tags = buildTags(ctx, template, kw);

  return {
    title,
    body,
    tags,
    dataPoints,
    wordCount: body.replace(/\s/g, "").length,
    templateId: template,
    templateName: TEMPLATES.find((t) => t.id === template)?.name ?? template,
    tone,
    length,
    sourceSummary: summarizeSource(ctx),
    generatedBy: "template",
  };
}

export function collectDataPoints(ctx: CopyContext): string[] {
  const out: string[] = [];
  if (ctx.player) {
    const p = ctx.player;
    if (p.currentSeason) out.push(`本赛季：${splitLine(p.currentSeason)}｜${shootingLine(p.currentSeason)}`);
    if (p.careerRegular) out.push(`生涯常规赛：${p.careerRegular.gp ?? "—"}场，场均${splitLine(p.careerRegular)}`);
    if (p.careerPlayoffs?.gp) out.push(`生涯季后赛：${p.careerPlayoffs.gp}场，场均${splitLine(p.careerPlayoffs)}`);
    if (p.seasons.length) out.push(`已收录 ${p.seasons.length} 条分赛季数据（${p.seasons[p.seasons.length - 1].seasonLabel} 至 ${p.seasons[0].seasonLabel}）`);
  }
  if (ctx.game) {
    out.push(`比分：${scoreText(ctx.game)}｜${ctx.game.statusDetail}`);
    if (ctx.game.home.leaders[0]) out.push(`${teamShort(ctx.game.home.abbr)}得分王：${topLeader(ctx.game.home)}`);
    if (ctx.game.away.leaders[0]) out.push(`${teamShort(ctx.game.away.abbr)}得分王：${topLeader(ctx.game.away)}`);
  }
  if (ctx.news) out.push(`新闻源：${ctx.news.headline}`);
  if (ctx.leaders?.length) out.push(`联盟数据榜：已注入前 ${ctx.leaders.length} 名数据`);
  return out;
}

export function buildTags(ctx: CopyContext, template: TemplateId, kw: string[]): string[] {
  const tags = new Set<string>(["NBA", TEMPLATES.find((t) => t.id === template)?.name ?? ""]);
  if (ctx.player) {
    tags.add(ctx.player.fullName);
    if (ctx.player.zhName) tags.add(ctx.player.zhName);
    if (ctx.player.teamAbbr) tags.add(ctx.player.teamAbbr);
  }
  if (ctx.game) {
    tags.add(ctx.game.home.abbr);
    tags.add(ctx.game.away.abbr);
  }
  kw.forEach((k) => tags.add(k));
  return Array.from(tags).filter(Boolean);
}

export function summarizeSource(ctx: CopyContext): string {
  const bits: string[] = [];
  if (ctx.player) bits.push(`球员：${ctx.player.fullName}（ESPN ID ${ctx.player.espnId}，数据源 ${ctx.player.source}）`);
  if (ctx.game) bits.push(`比赛：${ctx.game.shortName} ${ctx.game.statusDetail}`);
  if (ctx.news) bits.push(`新闻：${ctx.news.headline.slice(0, 40)}`);
  if (ctx.leaders?.length) bits.push(`联盟榜：${ctx.leaders.length} 条`);
  return bits.length ? bits.join("；") : "未选择数据源";
}

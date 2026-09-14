import type { StatSplit } from "@/lib/nba/types";
import {
  LENGTHS,
  TEMPLATES,
  TONES,
  buildTags,
  collectDataPoints,
  summarizeSource,
  type CopyContext,
  type CopyResult,
  type LengthId,
  type TemplateId,
  type ToneId,
} from "./engine";

export type AiInput = {
  template: TemplateId;
  tone: ToneId;
  length: LengthId;
  ctx: CopyContext;
  keywords?: string;
  variant?: number;
  /** 用户在设置页填入的自有 DashScope Key（BYOK），优先于服务端环境变量 */
  userApiKey?: string | null;
};

function aiConfig(userApiKey?: string | null) {
  // 纯前端 BYOK 架构：优先使用用户在「密钥设置」页填入的 DashScope Key（存于本浏览器 localStorage）；
  // NEXT_PUBLIC_* 环境变量仅作为部署者给全站访客准备的兜底（一般留空）。
  const apiKey = (userApiKey ?? "").trim() || (process.env.NEXT_PUBLIC_OPENAI_API_KEY ?? "").trim();
  const baseUrl =
    (process.env.NEXT_PUBLIC_OPENAI_BASE_URL ?? "").trim().replace(/\/+$/, "") ||
    "https://dashscope.aliyuncs.com/compatible-mode/v1";
  const model = (process.env.NEXT_PUBLIC_OPENAI_MODEL ?? "").trim() || "deepseek-v4-flash";
  const jsonMode = (process.env.NEXT_PUBLIC_OPENAI_JSON_MODE ?? "true").trim().toLowerCase() !== "false";
  return { apiKey, baseUrl, model, jsonMode };
}

export function isAiConfigured(userApiKey?: string | null): boolean {
  return Boolean(aiConfig(userApiKey).apiKey);
}

/* ---------------- 把实时数据整理成“事实卡片”，喂给模型且防止编造 ---------------- */

function fmtNum(v: number | null | undefined, d = 1): string {
  return v === null || v === undefined || !Number.isFinite(v)
    ? "—"
    : String(Math.round(v * 10 ** d) / 10 ** d);
}
function fmtPct(v: number | null | undefined): string {
  return v === null || v === undefined || !Number.isFinite(v) ? "—" : `${(v * 100).toFixed(1)}%`;
}
function splitObj(label: string, s: StatSplit | null | undefined) {
  if (!s) return null;
  return {
    label,
    gp: s.gp ?? null,
    min: fmtNum(s.min),
    pts: fmtNum(s.pts),
    reb: fmtNum(s.reb),
    ast: fmtNum(s.ast),
    stl: fmtNum(s.stl),
    blk: fmtNum(s.blk),
    fgp: fmtPct(s.fgp),
    tpp: fmtPct(s.tpp),
    ftp: fmtPct(s.ftp),
  };
}

function toFacts(ctx: CopyContext): Record<string, unknown> {
  const facts: Record<string, unknown> = {};
  const { player, game, news, leaders } = ctx;

  if (game) {
    facts.game = {
      matchup: game.name,
      shortName: game.shortName,
      status: game.statusDetail,
      state: game.statusState,
      date: game.gameDate,
      venue: game.venue ?? null,
      series: game.series ?? null,
      home: {
        team: game.home.displayName,
        score: game.home.score,
        record: game.home.record,
        leaders: (game.home.leaders ?? []).map((l) => `${l.athleteName}: ${l.displayValue}`),
      },
      away: {
        team: game.away.displayName,
        score: game.away.score,
        record: game.away.record,
        leaders: (game.away.leaders ?? []).map((l) => `${l.athleteName}: ${l.displayValue}`),
      },
    };
  }

  if (news) {
    facts.news = {
      headline: news.headline,
      summary: news.description ?? null,
      publishedAt: news.publishedAt ?? null,
    };
  }

  if (player) {
    facts.player = {
      name: player.fullName,
      zhName: player.zhName ?? null,
      team: player.teamZh ?? player.teamName ?? player.teamAbbr ?? null,
      position: player.position ?? null,
      age: player.age ?? null,
      height: player.height ?? null,
      draft: player.draftText ?? null,
      college: player.college ?? null,
      experience: player.experience ?? null,
      currentSeason: splitObj("本赛季", player.currentSeason),
      careerRegular: splitObj("生涯常规赛", player.careerRegular),
      careerPlayoffs: splitObj("生涯季后赛", player.careerPlayoffs),
      seasons: (player.seasons ?? []).slice(0, 12).map((s) => ({
        season: s.seasonLabel,
        type: s.seasonType,
        team: s.teamAbbr,
        gp: s.gp,
        pts: fmtNum(s.pts),
        reb: fmtNum(s.reb),
        ast: fmtNum(s.ast),
      })),
      recentGames: (player.recentGames ?? []).slice(0, 6).map((g) => ({
        date: g.date,
        opponent: g.opponent,
        result: g.result,
        pts: g.pts,
        reb: g.reb,
        ast: g.ast,
      })),
      awards: (player.awards ?? []).slice(0, 8),
    };
  }

  if (leaders && leaders.length) {
    facts.leagueLeaders = leaders.slice(0, 12).map((r) => ({
      rank: r.rank,
      player: r.playerName,
      team: r.teamAbbr,
      pts: fmtNum(r.pts),
      reb: fmtNum(r.reb),
      ast: fmtNum(r.ast),
    }));
  }

  if (ctx.seasonYear) facts.seasonYear = ctx.seasonYear;
  return facts;
}

/** 素材板块的中文名与写作分工，用于多素材融合约束 */
const SECTION_LABELS: Record<string, string> = {
  game: "比赛素材",
  player: "球员素材",
  news: "新闻素材",
  leagueLeaders: "联盟数据榜",
};
const SECTION_ROLES: Record<string, string> = {
  game: "赛事主线——比分、进程、走势、胜负关键",
  player: "人物纵深——本赛季/生涯数据、近期状态、生涯坐标",
  news: "背景引子——新闻事件本身及其影响",
  leagueLeaders: "数据坐标——联盟排名参照",
};

function lengthHint(id: LengthId): string {
  if (id === "short") return "正文控制在 120 字以内，短平快。";
  if (id === "long") return "正文 400 字以上，可分 3-5 段，层层递进。";
  return "正文 150-320 字，2-3 段。";
}

function buildMessages(input: AiInput) {
  const tpl = TEMPLATES.find((t) => t.id === input.template);
  const tone = TONES.find((t) => t.id === input.tone);
  const len = LENGTHS.find((l) => l.id === input.length);
  const kw = (input.keywords ?? "").trim();
  const facts = toFacts(input.ctx);
  const hasFacts = Object.keys(facts).length > 0;

  // 已提供的素材板块；比赛/球员/新闻同时选中 ≥2 个时，启用多素材融合硬约束
  const activeSections = ["game", "player", "news", "leagueLeaders"].filter((k) => facts[k]);
  const coreSections = activeSections.filter((k) => k !== "leagueLeaders");
  const multiSource = coreSections.length >= 2;

  const system = [
    "你是一名资深的 NBA 中文体育新媒体编辑，为中文读者撰写可直接发布的稿件。",
    "硬性规则：",
    "1) 只能使用【事实数据】里给出的比分、数据、球员、新闻等信息，绝不编造或臆测任何数字、伤停、交易、纪录、语录。",
    "2) 如果缺少撰写该文体所需的细节，宁可写得更概括，也不要虚构；正文中不要出现「待补充」「TODO」「{占位}」这类字样。",
    "3) 使用简体中文，自然流畅，符合所选文体与语气；不要使用 Markdown 语法（不要 # 号、** 加粗、- 列表符号）。",
    "4) 正文分段用两个换行 \\n\\n 分隔。",
    "5) 只输出一个 JSON 对象，不要任何解释文字，格式严格为：",
    '{"title":"标题(不超过30字)","body":"正文","tags":["标签1","标签2","标签3"]}',
    "tags 为 3-6 个不带 # 号的短标签。",
    ...(multiSource
      ? [
          "6) 【多素材融合】事实数据同时包含多个素材板块（分工见用户消息）。以所选文体为主线，每个板块都必须有实质性呈现（引用其具体比分、数据或新闻事实），并有机串联成一篇完整文章；严禁只围绕单一板块（例如只写球员）展开而忽略其余板块。输出前自检：每个板块是否都至少被实质性引用一次？有遗漏必须重写后再输出。",
        ]
      : []),
  ].join("\n");

  const userParts = [
    `文体：${tpl?.name ?? input.template}（${tpl?.desc ?? ""}）`,
    `语气：${tone?.name ?? input.tone}（${tone?.desc ?? ""}）`,
    `篇幅：${len?.name ?? input.length} —— ${lengthHint(input.length)}`,
    multiSource
      ? [
          "素材板块分工（每个板块都必须在成稿中实质性呈现，并自然融合成一篇文章）：",
          ...activeSections.map((k) => `· ${SECTION_LABELS[k]}：${SECTION_ROLES[k]}`),
          input.length === "long"
            ? "长篇结构建议：以比赛结果或新闻事件切入 → 展开关键进程与细节 → 球员数据纵深剖析 → 结合新闻背景谈影响 → 收束于点评与展望（按实际板块取舍，但每个板块都必须有内容）。"
            : input.length === "short"
              ? "篇幅较短：每个板块至少引用一处核心事实，重在融合自然、一气呵成。"
              : "每个板块至少各有一处明确的事实引用，段落之间衔接自然。",
        ].join("\n")
      : "",
    kw ? `可自然融入关键词：${kw}` : "",
    input.variant && input.variant > 1
      ? `这是第 ${input.variant} 版，请换一个切入角度与措辞，避免与常见写法雷同。`
      : "",
    "",
    hasFacts
      ? "【事实数据 · 唯一可信来源(JSON)】"
      : "【事实数据】本次未提供结构化数据，请只写一段不含任何具体数字的通用短稿。",
    hasFacts ? JSON.stringify(facts) : "",
    "",
    "请严格按系统要求输出 JSON。",
  ].filter(Boolean);

  return {
    messages: [
      { role: "system", content: system },
      { role: "user", content: userParts.join("\n") },
    ],
  };
}

function parseAiJson(raw: string): { title: string; body: string; tags: string[] } {
  let text = raw.trim().replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start !== -1 && end !== -1 && end > start) text = text.slice(start, end + 1);
  const obj = JSON.parse(text) as Record<string, unknown>;
  const title = typeof obj.title === "string" ? obj.title.trim() : "";
  const body = typeof obj.body === "string" ? obj.body.trim() : "";
  const tags = Array.isArray(obj.tags)
    ? obj.tags
        .filter((t): t is string => typeof t === "string")
        .map((t) => t.replace(/^#/, "").trim())
        .filter(Boolean)
    : [];
  if (!title || !body) throw new Error("AI 返回内容缺少标题或正文");
  return { title, body, tags };
}

export async function generateCopyWithAi(input: AiInput): Promise<CopyResult> {
  const { apiKey, baseUrl, model, jsonMode } = aiConfig(input.userApiKey);
  if (!apiKey) throw new Error("未配置 API Key（可在密钥设置页填入 DashScope Key）");

  const { messages } = buildMessages(input);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 55000);

  const requestBody: Record<string, unknown> = { model, temperature: 0.85, messages };
  if (jsonMode) requestBody.response_format = { type: "json_object" };

  let res: Response;
  try {
    res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(requestBody),
      cache: "no-store",
      signal: controller.signal,
    });
  } catch (e) {
    clearTimeout(timer);
    const err = e as Error;
    throw new Error(`AI 接口请求失败：${err.name === "AbortError" ? "请求超时" : err.message}`);
  }
  clearTimeout(timer);

  if (!res.ok) {
    const bodyText = await res.text().catch(() => "");
    throw new Error(`AI 接口返回 ${res.status}：${bodyText.slice(0, 200)}`);
  }

  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("AI 返回内容为空");

  const { title, body, tags } = parseAiJson(content);

  const kwList = (input.keywords ?? "").trim()
    ? (input.keywords ?? "").split(/[,，\s]+/).filter(Boolean)
    : [];
  const finalTags = tags.length ? Array.from(new Set(["NBA", ...tags])) : buildTags(input.ctx, input.template, kwList);

  return {
    title,
    body,
    tags: finalTags,
    dataPoints: collectDataPoints(input.ctx),
    wordCount: body.replace(/\s/g, "").length,
    templateId: input.template,
    templateName: TEMPLATES.find((t) => t.id === input.template)?.name ?? input.template,
    tone: input.tone,
    length: input.length,
    sourceSummary: summarizeSource(input.ctx),
    generatedBy: "ai",
  };
}

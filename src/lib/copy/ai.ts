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

/* ---------------- 新闻原文完整翻译（供新闻转写的左右对照） ---------------- */

export type NewsTranslation = {
  titleZh: string;
  bodyZh: string;
  /** full=拿到原文全文并完整翻译；summary=原文只提供摘要，已完整翻译摘要 */
  scope: "full" | "summary";
  /** 逐段中英对照（英文为已翻译覆盖的部分）；无正文时为空数组。en 为空串的条目表示纯中文附注 */
  pairs: { en: string; zh: string }[];
};

function extractJsonObject(raw: string): Record<string, unknown> {
  let text = raw.trim().replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start !== -1 && end !== -1 && end > start) text = text.slice(start, end + 1);
  return JSON.parse(text) as Record<string, unknown>;
}

/** 全文翻译的总字符上限：最多抓取原文前 10000 个字符（按段落边界截断） */
const TRANSLATE_BODY_LIMIT = 10000;
/** 单个翻译请求的字符上限：长文按段落边界切分为多块翻译后再按序拼接，保证全文完整不缩略 */
const TRANSLATE_CHUNK_SIZE = 3600;
/** 极端长文的最多分块数（超出部分省略并附注），防止超长稿件产生过多请求 */
const TRANSLATE_MAX_CHUNKS = 16;
/** 分块翻译的并行度上限：避免触发模型限流 */
const TRANSLATE_CONCURRENCY = 4;

/** 按总上限截断，优先落在段落边界，避免截断在半句话中间 */
function truncateAtParagraph(text: string, limit: number): { text: string; truncated: boolean } {
  if (text.length <= limit) return { text, truncated: false };
  const head = text.slice(0, limit);
  const lastPara = head.lastIndexOf("\n\n");
  return { text: (lastPara > limit * 0.5 ? head.slice(0, lastPara) : head).trim(), truncated: true };
}

/** 按空行拆分段落 */
function splitParas(text: string): string[] {
  return text
    .split(/\n{2,}/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * 把一段英文与其译文按段落一一配对（依赖 prompt 的逐段对应约束）。
 * 段落数不一致时降级为「整块英文 + 整块中文」的单对，保证对照可用。
 */
function pairParagraphs(enText: string, zhText: string): { en: string; zh: string }[] {
  const enParas = splitParas(enText);
  const zhParas = splitParas(zhText);
  if (enParas.length === 0) return [];
  if (enParas.length === zhParas.length) {
    return enParas.map((en, i) => ({ en, zh: zhParas[i] }));
  }
  return [{ en: enText.trim(), zh: zhText.trim() }];
}

function splitIntoChunks(text: string, size: number): string[] {
  const paras = text.split("\n\n").filter((s) => s.trim().length > 0);
  const chunks: string[] = [];
  let cur = "";
  for (const para of paras) {
    if (cur && cur.length + para.length + 2 > size) {
      chunks.push(cur);
      cur = para;
    } else {
      cur = cur ? cur + "\n\n" + para : para;
    }
  }
  if (cur) chunks.push(cur);
  // 单段超长（无段落边界）时硬切
  const out: string[] = [];
  for (const c of chunks) {
    if (c.length <= size) {
      out.push(c);
    } else {
      for (let i = 0; i < c.length; i += size) out.push(c.slice(i, i + size));
    }
  }
  return out;
}

/** 简易并发池：按 limit 并行执行，保持结果顺序 */
async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      results[idx] = await fn(items[idx], idx);
    }
  });
  await Promise.all(workers);
  return results;
}

type ChatMessage = { role: "system" | "user"; content: string };

/** 翻译专用的最小 chat 调用（支持纯文本或 JSON 输出），与文案生成链路互不影响 */
async function callChat(
  cfg: { apiKey: string; baseUrl: string; model: string; jsonMode: boolean },
  messages: ChatMessage[],
  opts: { json: boolean; temperature: number; timeoutMs: number },
): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs);
  const requestBody: Record<string, unknown> = { model: cfg.model, temperature: opts.temperature, messages };
  if (opts.json && cfg.jsonMode) requestBody.response_format = { type: "json_object" };

  let res: Response;
  try {
    res = await fetch(`${cfg.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${cfg.apiKey}`,
      },
      body: JSON.stringify(requestBody),
      cache: "no-store",
      signal: controller.signal,
    });
  } catch (e) {
    clearTimeout(timer);
    const err = e as Error;
    throw new Error(`翻译请求失败：${err.name === "AbortError" ? "请求超时" : err.message}`);
  }
  clearTimeout(timer);

  if (!res.ok) {
    const bodyText = await res.text().catch(() => "");
    throw new Error(`翻译接口返回 ${res.status}：${bodyText.slice(0, 200)}`);
  }

  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("翻译返回内容为空");
  return content;
}

const TRANSLATE_JSON_SYS = [
  "你是资深的 NBA 中文编辑，负责把英文新闻完整翻译成中文体育媒体稿件。",
  "要求：忠实完整、逐段翻译，不增删任何事实、数字、引语与细节；行文流畅自然，符合中文体育新闻的表达习惯。",
  "段落结构必须与原文严格一一对应：原文分几段，译文就分几段，顺序一致，不合并、不拆分（用于逐段中英对照展示）",
  "球员与教练姓名使用中文通用译名，并在首次出现时括注英文原名，如 斯蒂芬·库里（Stephen Curry）；球队使用中文队名。",
  "若原文只有标题没有正文，则只翻译标题，bodyZh 用一句话说明原文仅发布了标题。",
  '严格输出 JSON：{"titleZh":"中文标题","bodyZh":"中文正文（多段落用 \\n\\n 分隔）"}。',
].join("\n");

const TRANSLATE_CHUNK_SYS = [
  "你是资深的 NBA 中文编辑，负责把英文新闻完整翻译成中文。",
  "输入是整篇新闻按顺序切分后的其中一段。请把该段忠实完整地逐句翻译成中文，保持原有段落结构（段落间用空行分隔），不得省略、概括或增删任何信息。该段的段落数量必须与输入严格一致（用于逐段中英对照展示）。",
  "球员与教练姓名使用中文通用译名，并在首次出现时括注英文原名；球队使用中文队名。",
  "直接输出该段的中文译文纯文本：不要输出标题、不要解释、不要任何标记或包裹符号。",
].join("\n");

const TRANSLATE_TITLE_SYS =
  "把用户给出的英文新闻标题翻译成中文体育新闻标题，直接输出译文纯文本，不要解释、不要引号。";

/**
 * 把英文新闻完整翻译成中文（标题 + 正文/全文）。
 * 短文单次调用；长文按段落分块后并行翻译再按序拼接，保证全文完整、不缩略。
 * 失败时由调用方兜底展示英文原文。
 */
export async function translateNewsWithAi(
  news: { headline: string; body: string | null; isFullText: boolean },
  userApiKey?: string | null,
): Promise<NewsTranslation> {
  const cfg = aiConfig(userApiKey);
  if (!cfg.apiKey) throw new Error("未配置 API Key（可在密钥设置页填入 DashScope Key）");

  const scope: "full" | "summary" = news.isFullText ? "full" : "summary";
  const rawBody = (news.body ?? "").trim();
  // 最多抓取前 10000 个字符（段落边界截断），再按 3600 字符/块切分翻译
  const { text: bodyText, truncated } = truncateAtParagraph(rawBody, TRANSLATE_BODY_LIMIT);
  const chunks = bodyText ? splitIntoChunks(bodyText, TRANSLATE_CHUNK_SIZE) : [];
  const capped = chunks.slice(0, TRANSLATE_MAX_CHUNKS);
  const wasCapped = truncated || chunks.length > TRANSLATE_MAX_CHUNKS;

  // 无正文或单块短文：单次 JSON 调用（标题+正文一起翻）
  if (capped.length <= 1) {
    const user = [
      `【英文标题】${news.headline}`,
      bodyText
        ? `【英文${news.isFullText ? "全文" : "摘要"}】${capped[0] ?? ""}`
        : "【英文正文】（原文仅提供标题，无正文内容）",
    ].join("\n");
    const content = await callChat(
      cfg,
      [
        { role: "system", content: TRANSLATE_JSON_SYS },
        { role: "user", content: user },
      ],
      { json: true, temperature: 0.3, timeoutMs: 90000 },
    );
    const obj = extractJsonObject(content);
    const titleZh = typeof obj.titleZh === "string" ? obj.titleZh.trim() : "";
    const bodyZh = typeof obj.bodyZh === "string" ? obj.bodyZh.trim() : "";
    if (!titleZh && !bodyZh) throw new Error("翻译结果缺少内容");
    const pairs = bodyText ? pairParagraphs(bodyText, bodyZh) : [];
    return { titleZh: titleZh || news.headline, bodyZh: bodyZh || titleZh, scope, pairs };
  }

  // 长文：标题一次小调用 + 各分块限流并行翻译（纯文本输出），按序拼接
  const [titleZh, parts] = await Promise.all([
    callChat(
      cfg,
      [
        { role: "system", content: TRANSLATE_TITLE_SYS },
        { role: "user", content: news.headline },
      ],
      { json: false, temperature: 0.2, timeoutMs: 45000 },
    ),
    mapLimit(capped, TRANSLATE_CONCURRENCY, async (chunk, i) => {
      const zh = await callChat(
        cfg,
        [
          { role: "system", content: TRANSLATE_CHUNK_SYS },
          { role: "user", content: `【第 ${i + 1} / ${capped.length} 段】\n${chunk}` },
        ],
        { json: false, temperature: 0.3, timeoutMs: 90000 },
      );
      // 每块内部按段落配对（块的英文段落是已知的），保证对照逐段对齐
      return { zh, pairs: pairParagraphs(chunk, zh) };
    }),
  ]);

  let bodyZh = parts.map((t) => t.zh.trim()).filter(Boolean).join("\n\n");
  if (!bodyZh) throw new Error("翻译结果缺少内容");
  const pairs = parts.flatMap((t) => t.pairs);
  if (wasCapped) {
    const note = "（注：原文较长，已完整翻译前 1 万字符的内容；剩余部分可点击下方「查看英文原文」阅读。）";
    bodyZh += `\n\n${note}`;
    pairs.push({ en: "", zh: note }); // en 为空串：对照模式只渲染中文附注
  }
  return { titleZh: titleZh.trim() || news.headline, bodyZh, scope, pairs };
}

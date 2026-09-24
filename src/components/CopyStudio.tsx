"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getUserApiKey } from "@/components/KeySetup";
import {
  LENGTHS,
  TEMPLATES,
  TONES,
  type LengthId,
  type TemplateId,
  type ToneId,
} from "@/lib/copy/engine";
import { runGenerate } from "@/lib/copy/generate";
import { translateNewsWithAi, type NewsTranslation } from "@/lib/copy/ai";
import {
  getNews,
  getScoreboard,
  saveDraft as persistDraft,
  searchPlayers,
} from "@/lib/nba/store";
import { fetchNewsStory } from "@/lib/nba/espn";
import CalendarPicker from "@/components/CalendarPicker";
import { teamZh } from "@/lib/nba/teams";

type GameSummary = {
  id: string;
  shortName: string;
  statusDetail: string;
  statusState: string;
  gameDate: string;
  home: { abbr: string; displayName: string; score: number | null; record: string | null };
  away: { abbr: string; displayName: string; score: number | null; record: string | null };
};

type NewsItem = {
  id: string;
  headline: string;
  description: string | null;
  url: string | null;
  publishedAt: string | null;
};

/** 双框对照缓存：translation 为 null 表示翻译失败（左框兜底展示英文原文 rawText） */
type DualCacheEntry = { translation: NewsTranslation | null; rawText: string | null };
type PlayerHit = { espnId: string; name: string; zhName?: string | null; team?: string | null };

type CopyResult = {
  title: string;
  body: string;
  tags: string[];
  dataPoints: string[];
  wordCount: number;
  templateName: string;
  sourceSummary: string;
  generatedBy?: "ai" | "template";
  aiError?: string;
};

export type CopyStudioInitial = {
  espnId?: string;
  gameId?: string;
  gameDate?: string;
  newsId?: string;
  template?: string;
  games?: GameSummary[];
};

export default function CopyStudio({ initial }: { initial: CopyStudioInitial }) {
  // 三种数据源可自由组合（0~3 个）：直接进入时全部不勾选，由用户自由选择；
  // 从比分中心/新闻中心/球员页带参数跳入时，自动勾选对应数据源并预选对应内容
  const [sources, setSources] = useState<{ game: boolean; player: boolean; news: boolean }>({
    game: Boolean(initial.gameId),
    player: Boolean(initial.espnId),
    news: Boolean(initial.newsId),
  });
  const toggleSource = (key: "game" | "player" | "news") =>
    setSources((s) => ({ ...s, [key]: !s[key] }));
  const [gameDate, setGameDate] = useState(
    initial.gameDate ?? initial.games?.[0]?.gameDate ?? new Date().toISOString().slice(0, 10),
  );
  const [games, setGames] = useState<GameSummary[]>(initial.games ?? []);
  const [gameId, setGameId] = useState(initial.gameId ?? initial.games?.[0]?.id ?? "");

  const [playerQuery, setPlayerQuery] = useState("");
  const [playerHits, setPlayerHits] = useState<PlayerHit[]>([]);
  const [espnId, setEspnId] = useState(initial.espnId ?? "");
  const [playerName, setPlayerName] = useState("");

  const [newsItems, setNewsItems] = useState<NewsItem[]>([]);
  const [newsId, setNewsId] = useState(initial.newsId ?? "");

  const [template, setTemplate] = useState<TemplateId>((initial.template as TemplateId) ?? "game-recap");
  const [tone, setTone] = useState<ToneId>("hot");
  const [length, setLength] = useState<LengthId>("mid");
  const [keywords, setKeywords] = useState("");
  const [variant, setVariant] = useState(1);

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [result, setResult] = useState<CopyResult | null>(null);
  const [tags, setTags] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // 新闻对照双框：左框展示原文的完整中文翻译，右框为可编辑的生成文案
  const [translation, setTranslation] = useState<NewsTranslation | null>(null);
  const [dualNews, setDualNews] = useState<NewsItem | null>(null);
  const [dualRawText, setDualRawText] = useState<string | null>(null);
  // 翻译框视图：dual=中英逐段对照；zh=只看译文
  const [transView, setTransView] = useState<"dual" | "zh">("dual");
  const translationCacheRef = useRef<Record<string, DualCacheEntry>>({});

  const flash = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2200);
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const board = await getScoreboard(gameDate);
        if (!alive) return;
        setGames(board.games);
      } catch {
        if (alive) setGames([]);
      }
    })();
    return () => {
      alive = false;
    };
  }, [gameDate]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const news = await getNews(40);
        if (!alive) return;
        setNewsItems(news.items);
      } catch {
        if (alive) setNewsItems([]);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (sources.player && playerQuery.trim().length === 0 && !espnId) {
      const timer = setTimeout(async () => {
        try {
          setPlayerHits(await searchPlayers(""));
        } catch {
          setPlayerHits([]);
        }
      }, 200);
      return () => clearTimeout(timer);
    }
    if (playerQuery.trim().length === 0) return;
    const timer = setTimeout(async () => {
      try {
        setPlayerHits(await searchPlayers(playerQuery.trim()));
      } catch {
        setPlayerHits([]);
      }
    }, 320);
    return () => clearTimeout(timer);
  }, [playerQuery, sources.player, espnId]);

  // 从比分中心跳入时：把选中的比赛滚动到列表可视区居中（只执行一次）
  const gameCenteredRef = useRef(false);
  useEffect(() => {
    if (gameCenteredRef.current) return;
    if (!sources.game || !gameId || games.length === 0) return;
    const el = document.getElementById(`game-option-${gameId}`);
    if (!el) return;
    gameCenteredRef.current = true;
    el.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [sources.game, gameId, games]);

  // 从新闻中心跳入时：新闻列表加载完成后，把选中的那条新闻滚动到列表可视区居中（只执行一次）
  const newsCenteredRef = useRef(false);
  useEffect(() => {
    if (newsCenteredRef.current) return;
    if (!sources.news || !newsId || newsItems.length === 0) return;
    const el = document.getElementById(`news-option-${newsId}`);
    if (!el) return;
    newsCenteredRef.current = true;
    el.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [sources.news, newsId, newsItems]);

  const selectedGame = useMemo(() => games.find((g) => g.id === gameId) ?? null, [games, gameId]);
  const selectedNews = useMemo(() => newsItems.find((n) => n.id === newsId) ?? null, [newsItems, newsId]);

  const generate = useCallback(
    async (nextVariant?: number) => {
      const v = nextVariant ?? variant;
      setBusy(true);
      setError(null);

      // 只要选中了新闻素材（任意文体/语气/篇幅，可与其他数据源组合）：
      // 右侧生成文案的同时，左侧并行生成原文的完整中文翻译（优先抓 ESPN 全文）
      const newsTarget =
        sources.news && newsId ? (newsItems.find((n) => n.id === newsId) ?? null) : null;
      setDualNews(newsTarget);
      if (!newsTarget) {
        setTranslation(null);
        setDualRawText(null);
      }

      let translationTask: Promise<DualCacheEntry | null> | null = null;
      if (newsTarget) {
        const cached = translationCacheRef.current[newsTarget.id];
        if (cached) {
          // 同一条新闻只翻译一次，「换一版」直接复用
          setTranslation(cached.translation);
          setDualRawText(cached.rawText);
        } else {
          const target = newsTarget;
          translationTask = (async (): Promise<DualCacheEntry> => {
            // 先抓 ESPN 全文正文（content API，CORS 开放），失败回退到新闻摘要
            const story = await fetchNewsStory(target.id).catch(() => null);
            const rawText = story ?? target.description ?? null;
            try {
              const t = await translateNewsWithAi(
                { headline: target.headline, body: rawText, isFullText: Boolean(story) },
                getUserApiKey() || null,
              );
              const entry: DualCacheEntry = { translation: t, rawText };
              translationCacheRef.current[target.id] = entry;
              return entry;
            } catch {
              // 翻译失败不阻断文案生成：缓存原文，左框兜底展示英文原文
              const entry: DualCacheEntry = { translation: null, rawText };
              translationCacheRef.current[target.id] = entry;
              return entry;
            }
          })();
        }
      }

      try {
        // 纯前端架构：直接在本浏览器内组装数据并请求 DashScope（BYOK）
        const [data, trans] = await Promise.all([
          runGenerate({
            template,
            tone,
            length,
            keywords,
            variant: v,
            espnId: sources.player && espnId ? espnId : null,
            gameId: sources.game && gameId ? gameId : null,
            gameDate,
            newsId: sources.news && newsId ? newsId : null,
            userApiKey: getUserApiKey() || null,
          }),
          translationTask ?? Promise.resolve(null),
        ]);
        if (trans) {
          setTranslation(trans.translation);
          setDualRawText(trans.rawText);
        }
        setResult(data);
        setTitle(data.title);
        setBody(data.body);
        setTags(data.tags ?? []);
        flash("文案生成完成");
      } catch (e) {
        setError((e as Error).message || "生成失败");
      } finally {
        setBusy(false);
      }
    },
    [template, tone, length, keywords, variant, espnId, gameId, gameDate, newsId, newsItems, sources, flash],
  );

  const saveDraft = useCallback(async () => {
    if (!body.trim()) {
      flash("请先生成或填写正文");
      return;
    }
    try {
      // 草稿保存在本浏览器 localStorage（每个使用者各自一份）
      persistDraft({
        title: title || "未命名草稿",
        body,
        templateName: TEMPLATES.find((t) => t.id === template)?.name ?? null,
        tone,
        length,
        tags,
        sourceSummary: result?.sourceSummary ?? "",
      });
      flash("已保存到草稿箱");
    } catch (e) {
      setError((e as Error).message);
    }
  }, [body, title, template, tone, length, tags, result, flash]);

  const copyText = useCallback(
    async (text: string, label: string) => {
      try {
        await navigator.clipboard.writeText(text);
        flash(`${label}已复制`);
      } catch {
        flash("复制失败，请手动选择文本");
      }
    },
    [flash],
  );

  const wordCount = body.replace(/\s/g, "").length;

  // 生成中的遮罩层：单栏时覆盖编辑框，双栏时覆盖左右两个框
  const busyOverlay = (
    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 rounded-xl bg-slate-950/70 backdrop-blur-sm">
      <span className="h-9 w-9 animate-spin rounded-full border-[3px] border-orange-400 border-t-transparent" />
      <p className="text-sm font-semibold text-slate-100">正在生成文案…</p>
      <p className="text-[11px] text-slate-400">AI 正在整合所选数据源，完成后自动填入</p>
    </div>
  );

  // 「编辑与发布」面板：dual=true 时作为双栏右框（与左框等高拉伸，遮罩移到外层）
  const renderEditorPanel = (dual: boolean) => (
    <div className={`panel p-4 ${dual ? "flex h-[560px] flex-col lg:h-[600px]" : "space-y-3"}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-bold text-white">{dual && template === "news-brief" ? "3 · 转写文案（可编辑）" : "3 · 编辑与发布"}</h2>
        <div className="flex items-center gap-2">
          {result?.generatedBy ? (
            <span className={`chip ${result.generatedBy === "ai" ? "!text-orange-300" : "!text-sky-300"}`}>
              {result.generatedBy === "ai" ? "🤖 AI 生成" : "🧩 模板生成"}
            </span>
          ) : null}
          <span className="text-[11px] text-slate-500">
            {result ? `模板 ${result.templateName} · ` : ""}正文 {wordCount} 字
          </span>
        </div>
      </div>
      <div className={`relative ${dual ? "mt-3 flex min-h-0 flex-1 flex-col gap-3" : "space-y-3"}`}>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="标题（生成后可编辑）"
          className="field font-semibold"
        />
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="点击上方「生成文案」，正文会自动填入，可继续手动润色。"
          rows={dual ? undefined : 16}
          className={`field scroll-thin leading-relaxed ${dual ? "min-h-0 flex-1" : "min-h-[320px]"}`}
        />
        {!dual && busy ? busyOverlay : null}
      </div>
      <div className={`flex flex-wrap gap-2 ${dual ? "mt-3" : ""}`}>
        <button className="btn btn-ghost !py-1.5 !text-xs" onClick={() => copyText(`${title}\n\n${body}`, "全文")}>
          📋 复制全文
        </button>
        <button className="btn btn-ghost !py-1.5 !text-xs" onClick={() => copyText(title, "标题")}>
          🏷️ 仅复制标题
        </button>
        <button className="btn btn-primary !py-1.5 !text-xs" onClick={saveDraft}>
          💾 保存草稿
        </button>
        <Link href="/drafts" className="btn btn-ghost !py-1.5 !text-xs">
          🗂️ 打开草稿箱
        </Link>
      </div>
      {tags.length > 0 ? (
        <div
          className={`scroll-thin flex flex-wrap gap-1.5 border-t border-white/5 pt-3 ${dual ? "mt-3 max-h-20 shrink-0 overflow-y-auto" : ""}`}
        >
          {tags.map((tag) => (
            <span key={tag} className="chip">
              #{tag}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );

  return (
    <div className="space-y-6">
      {/* 顶部：选项区（横向排布于页面上方） */}
      <section className="space-y-4">
        {/* 1 · 选择数据源 */}
        <div className="panel p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <h2 className="text-sm font-bold text-white">1 · 选择数据源</h2>
            <p className="text-[11px] text-slate-500">三个素材框并列展示，点框顶按钮勾选/取消；可自由组合，也可都不勾选（仅按文体与关键词生成）</p>
          </div>
          <div className="mt-3 grid items-stretch gap-3 md:grid-cols-3">
            {/* 比赛比分 */}
            <div
              className={`flex h-[380px] flex-col rounded-xl border p-3 transition ${
                sources.game ? "border-orange-500/60 bg-orange-500/5" : "border-white/10 bg-slate-900/50"
              }`}
            >
              <button
                type="button"
                onClick={() => toggleSource("game")}
                aria-pressed={sources.game}
                className={`w-full shrink-0 rounded-lg border px-2 py-1.5 text-xs font-semibold transition ${
                  sources.game
                    ? "border-orange-500/60 bg-orange-500/15 text-orange-200"
                    : "border-white/10 bg-slate-900/50 text-slate-500 hover:border-white/25 hover:text-slate-200"
                }`}
              >
                {sources.game ? "✓ " : ""}🏀 比赛比分
              </button>
              <div className="mt-2 flex h-9 shrink-0 items-center gap-2">
                <CalendarPicker
                  date={gameDate}
                  onSelect={(d) => {
                    setGameDate(d);
                    setGameId("");
                  }}
                  label="选择比赛日期"
                />
                <span className="text-[11px] text-slate-500">比赛日期</span>
              </div>
              <div
                className={`scroll-thin mt-2 min-h-0 flex-1 space-y-1.5 overflow-y-auto pr-1 transition ${
                  sources.game ? "" : "opacity-45"
                }`}
              >
                {games.map((game) => (
                  <button
                    key={game.id}
                    id={`game-option-${game.id}`}
                    onClick={() => {
                      setGameId(game.id);
                      if (!sources.game) setSources((s) => ({ ...s, game: true }));
                    }}
                    className={`w-full rounded-lg border px-2.5 py-2 text-left text-[12px] transition ${
                      gameId === game.id
                        ? "border-orange-500/60 bg-orange-500/10 text-orange-100"
                        : "border-white/10 bg-slate-900/50 text-slate-300 hover:border-white/25"
                    }`}
                  >
                    <span className="block font-semibold">
                      {teamZh(game.away.abbr)} @ {teamZh(game.home.abbr)}
                    </span>
                    <span className="block text-[11px] text-slate-500">
                      {game.away.score ?? "—"} : {game.home.score ?? "—"} · {game.statusDetail}
                    </span>
                  </button>
                ))}
                {games.length === 0 ? (
                  <p className="px-1 py-6 text-center text-[12px] text-slate-500">该日期暂无比赛</p>
                ) : null}
              </div>
            </div>

            {/* 球员数据 */}
            <div
              className={`flex h-[380px] flex-col rounded-xl border p-3 transition ${
                sources.player ? "border-orange-500/60 bg-orange-500/5" : "border-white/10 bg-slate-900/50"
              }`}
            >
              <button
                type="button"
                onClick={() => toggleSource("player")}
                aria-pressed={sources.player}
                className={`w-full shrink-0 rounded-lg border px-2 py-1.5 text-xs font-semibold transition ${
                  sources.player
                    ? "border-orange-500/60 bg-orange-500/15 text-orange-200"
                    : "border-white/10 bg-slate-900/50 text-slate-500 hover:border-white/25 hover:text-slate-200"
                }`}
              >
                {sources.player ? "✓ " : ""}🔎 球员数据
              </button>
              <div className="mt-2 h-9 shrink-0">
                <input
                  value={playerQuery}
                  onChange={(e) => setPlayerQuery(e.target.value)}
                  placeholder="搜索球员：Curry / 文班亚马"
                  className="field h-full !py-1.5 !text-xs"
                />
              </div>
              <div
                className={`scroll-thin mt-2 min-h-0 flex-1 space-y-1.5 overflow-y-auto pr-1 transition ${
                  sources.player ? "" : "opacity-45"
                }`}
              >
                {playerHits.map((hit) => (
                  <button
                    key={hit.espnId}
                    onClick={() => {
                      setEspnId(hit.espnId);
                      setPlayerName(hit.zhName ? `${hit.zhName} ${hit.name}` : hit.name);
                      if (!sources.player) setSources((s) => ({ ...s, player: true }));
                    }}
                    className={`w-full rounded-lg border px-2.5 py-2 text-left text-[12px] transition ${
                      espnId === hit.espnId
                        ? "border-orange-500/60 bg-orange-500/10 text-orange-100"
                        : "border-white/10 bg-slate-900/50 text-slate-300 hover:border-white/25"
                    }`}
                  >
                    <span className="block font-semibold">
                      {hit.zhName ? `${hit.zhName} · ${hit.name}` : hit.name}
                    </span>
                    <span className="block text-[11px] text-slate-500">{hit.team || "NBA"}</span>
                  </button>
                ))}
              </div>
              {espnId ? (
                <p className="mt-2 shrink-0 text-[11px] text-slate-500">
                  已选：{playerName || espnId} ·{" "}
                  <Link href={`/player?id=${espnId}`} className="text-orange-300 hover:text-orange-200">
                    查看完整历史数据 ↗
                  </Link>
                </p>
              ) : null}
            </div>

            {/* 新闻素材 */}
            <div
              className={`flex h-[380px] flex-col rounded-xl border p-3 transition ${
                sources.news ? "border-orange-500/60 bg-orange-500/5" : "border-white/10 bg-slate-900/50"
              }`}
            >
              <button
                type="button"
                onClick={() => toggleSource("news")}
                aria-pressed={sources.news}
                className={`w-full shrink-0 rounded-lg border px-2 py-1.5 text-xs font-semibold transition ${
                  sources.news
                    ? "border-orange-500/60 bg-orange-500/15 text-orange-200"
                    : "border-white/10 bg-slate-900/50 text-slate-500 hover:border-white/25 hover:text-slate-200"
                }`}
              >
                {sources.news ? "✓ " : ""}📰 新闻素材
              </button>
              <div className="mt-2 flex h-9 shrink-0 items-center">
                <p className="text-[11px] text-slate-500">与新闻中心同步 · 保留近 10 天</p>
              </div>
              <div
                className={`scroll-thin mt-2 min-h-0 flex-1 space-y-1.5 overflow-y-auto pr-1 transition ${
                  sources.news ? "" : "opacity-45"
                }`}
              >
                {newsItems.map((item) => (
                  <button
                    key={item.id}
                    id={`news-option-${item.id}`}
                    onClick={() => {
                      setNewsId(item.id);
                      if (!sources.news) setSources((s) => ({ ...s, news: true }));
                    }}
                    className={`w-full rounded-lg border px-2.5 py-2 text-left text-[12px] transition ${
                      newsId === item.id
                        ? "border-orange-500/60 bg-orange-500/10 text-orange-100"
                        : "border-white/10 bg-slate-900/50 text-slate-300 hover:border-white/25"
                    }`}
                  >
                    <span className="line-clamp-2 block font-semibold">{item.headline}</span>
                    <span className="block text-[11px] text-slate-500">{item.publishedAt?.slice(0, 10)}</span>
                  </button>
                ))}
                {newsItems.length === 0 ? (
                  <p className="px-1 py-6 text-center text-[12px] text-slate-500">暂无新闻</p>
                ) : null}
              </div>
            </div>
          </div>
        </div>

        {/* 2 · 文体与语气 + 生成 */}
        <div className="panel space-y-4 p-4">
          <h2 className="text-sm font-bold text-white">2 · 文体与语气</h2>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
            {TEMPLATES.map((t) => (
              <button
                key={t.id}
                onClick={() => setTemplate(t.id)}
                className={`h-full w-full rounded-xl border px-3 py-2 text-left transition ${
                  template === t.id
                    ? "border-orange-500/60 bg-orange-500/10"
                    : "border-white/10 bg-slate-900/50 hover:border-white/25"
                }`}
              >
                <span className="flex items-center gap-2 text-[13px] font-semibold text-slate-100">
                  <span>{t.emoji}</span>
                  {t.name}
                </span>
                <span className="mt-0.5 block text-[11px] text-slate-500">{t.desc}</span>
              </button>
            ))}
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <p className="mb-1.5 text-[11px] font-semibold text-slate-400">语气</p>
              <div className="flex flex-wrap gap-1.5">
                {TONES.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setTone(t.id)}
                    className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold transition ${
                      tone === t.id ? "bg-sky-400 text-slate-900" : "bg-slate-800/70 text-slate-400 hover:text-slate-100"
                    }`}
                  >
                    {t.name}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="mb-1.5 text-[11px] font-semibold text-slate-400">篇幅</p>
              <div className="flex flex-wrap gap-1.5">
                {LENGTHS.map((l) => (
                  <button
                    key={l.id}
                    onClick={() => setLength(l.id)}
                    className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold transition ${
                      length === l.id ? "bg-emerald-400 text-slate-900" : "bg-slate-800/70 text-slate-400 hover:text-slate-100"
                    }`}
                  >
                    {l.name}（{l.hint}）
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="mb-1.5 text-[11px] font-semibold text-slate-400">自定义关键词（可选，逗号分隔）</p>
              <input
                value={keywords}
                onChange={(e) => setKeywords(e.target.value)}
                placeholder="季后赛、主场、纪录之夜"
                className="field !py-1.5 !text-xs"
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              className="btn btn-primary min-w-44 flex-1"
              disabled={busy}
              onClick={() => {
                const next = variant + 1;
                setVariant(next);
                generate(next);
              }}
            >
              {busy ? "生成中，正在抓取数据…" : "⚡ 生成文案"}
            </button>
            {result ? (
              <button
                className="btn btn-ghost"
                disabled={busy}
                onClick={() => {
                  const next = variant + 1;
                  setVariant(next);
                  generate(next);
                }}
              >
                🎲 换一版（换措辞）
              </button>
            ) : null}
          </div>
        </div>
      </section>

      {/* 下方：生成结果与编辑 */}
      <section className="space-y-4">
        {error ? (
          <div className="panel border-rose-500/40 p-3 text-[13px] text-rose-300">⚠️ {error}</div>
        ) : null}

        {result?.generatedBy === "template" && result?.aiError ? (
          <div className="panel border-amber-500/40 p-3 text-[12px] leading-relaxed text-amber-300">
            🧩 AI 未启用或调用失败，本次已自动回退到本地模板引擎。原因：{result.aiError}
            <br />
            可前往 <Link href="/setup-key" className="text-orange-300 underline underline-offset-2 hover:text-orange-200">🔑 密钥设置</Link> 填入你的
            DashScope Key 立即启用（Key 只保存在你自己的浏览器中）。
          </div>
        ) : null}

        {dualNews ? (
          <div className="relative">
            <div className="grid items-stretch gap-4 lg:grid-cols-2">
              {/* 左：原文完整中文翻译（对照参考） */}
              <div className="panel flex h-[560px] flex-col p-4 lg:h-[600px]">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-sm font-bold text-white">📰 原文中文翻译</h2>
                  <div className="flex flex-wrap items-center gap-2">
                    {translation ? (
                      <span className="flex overflow-hidden rounded-lg border border-white/10 text-[11px] font-semibold">
                        <button
                          type="button"
                          aria-pressed={transView === "dual"}
                          onClick={() => setTransView("dual")}
                          className={`px-2 py-1 transition ${
                            transView === "dual" ? "bg-orange-500/20 text-orange-200" : "bg-slate-900/50 text-slate-500 hover:text-slate-200"
                          }`}
                        >
                          中英对照
                        </button>
                        <button
                          type="button"
                          aria-pressed={transView === "zh"}
                          onClick={() => setTransView("zh")}
                          className={`px-2 py-1 transition ${
                            transView === "zh" ? "bg-orange-500/20 text-orange-200" : "bg-slate-900/50 text-slate-500 hover:text-slate-200"
                          }`}
                        >
                          只看译文
                        </button>
                      </span>
                    ) : null}
                    {translation ? (
                      <span className={`chip ${translation.scope === "full" ? "!text-sky-300" : "!text-amber-300"}`}>
                        {translation.scope === "full" ? "完整全文翻译" : "原文仅提供摘要"}
                      </span>
                    ) : null}
                    {translation ? (
                      <button
                        type="button"
                        className="btn btn-ghost !px-2.5 !py-1 !text-[11px]"
                        onClick={() => copyText(`${translation.titleZh}\n\n${translation.bodyZh}`, "译文")}
                      >
                        📋 复制译文
                      </button>
                    ) : null}
                  </div>
                </div>
                <div className="scroll-thin mt-3 min-h-0 flex-1 overflow-y-auto rounded-xl border border-white/5 bg-slate-900/50 p-4">
                  {translation ? (
                    <>
                      <h3 className="text-[15px] font-bold leading-snug text-slate-100">{translation.titleZh}</h3>
                      {transView === "dual" ? (
                        <p className="mt-1 text-[11px] italic leading-5 text-slate-500">{dualNews.headline}</p>
                      ) : null}
                      {dualNews.publishedAt ? (
                        <p className="mt-1 text-[11px] text-slate-500">{dualNews.publishedAt.slice(0, 10)}</p>
                      ) : null}
                      {transView === "dual" && translation.pairs.length > 0 ? (
                        <div className="mt-3 space-y-3">
                          {translation.pairs.map((pair, idx) => (
                            <div key={idx} className="border-b border-white/5 pb-3 last:border-b-0 last:pb-0">
                              {pair.en ? (
                                <p className="text-[11px] leading-5 text-slate-500">{pair.en}</p>
                              ) : null}
                              <p
                                className={`whitespace-pre-line text-[13px] leading-7 text-slate-300 ${pair.en ? "mt-1.5" : ""}`}
                              >
                                {pair.zh}
                              </p>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="mt-3 space-y-3 text-[13px] leading-7 text-slate-300">
                          {translation.bodyZh.split(/\n{2,}/).map((para, idx) => (
                            <p key={idx} className="whitespace-pre-line">
                              {para}
                            </p>
                          ))}
                        </div>
                      )}
                    </>
                  ) : (
                    <>
                      <h3 className="text-[15px] font-bold leading-snug text-slate-100">{dualNews.headline}</h3>
                      {dualNews.publishedAt ? (
                        <p className="mt-1.5 text-[11px] text-slate-500">{dualNews.publishedAt.slice(0, 10)}</p>
                      ) : null}
                      <div className="mt-3 space-y-3 text-[13px] leading-7 text-slate-300">
                        {(dualRawText ?? dualNews.description ?? "该新闻原文仅提供标题。")
                          .split(/\n{2,}/)
                          .map((para, idx) => (
                            <p key={idx} className="whitespace-pre-line">
                              {para}
                            </p>
                          ))}
                      </div>
                      <p className="mt-4 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-[11px] leading-relaxed text-amber-300">
                        暂未生成中文翻译（AI 未启用或翻译失败），当前展示英文原文。前往「密钥设置」填入 DashScope Key 后重新生成，即可自动显示完整中文翻译。
                      </p>
                    </>
                  )}
                </div>
                {dualNews.url ? (
                  <a
                    href={dualNews.url}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-2 self-end text-[11px] text-orange-300 hover:text-orange-200"
                  >
                    查看英文原文 ↗
                  </a>
                ) : null}
              </div>

              {/* 右：转写文案（可编辑） */}
              {renderEditorPanel(true)}
            </div>
            {busy ? busyOverlay : null}
          </div>
        ) : (
          renderEditorPanel(false)
        )}

        {result ? (
          <div className="panel space-y-2 p-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">数据引用（发布前请核对）</h3>
            <ul className="space-y-1.5 text-[12px] leading-relaxed text-slate-300">
              {result.dataPoints.map((point) => (
                <li key={point} className="panel-soft px-3 py-1.5">
                  {point}
                </li>
              ))}
              {result.dataPoints.length === 0 ? (
                <li className="text-slate-500">本次未注入结构化数据</li>
              ) : null}
            </ul>
            <p className="text-[11px] text-slate-500">来源：{result.sourceSummary}</p>
          </div>
        ) : (
          <div className="panel p-6 text-[13px] leading-relaxed text-slate-400">
            <p className="font-semibold text-slate-200">使用流程</p>
            <ol className="mt-2 list-decimal space-y-1 pl-5">
              <li>在上方自由勾选比赛、球员、新闻素材（可任意组合，也可都不选）；</li>
              <li>挑选文体（9 种）、语气（5 种）与篇幅（3 档）；</li>
              <li>点击「生成文案」，系统会实时抓取比分、生涯数据与命中率并写成稿件；</li>
              <li>只要选中新闻素材并生成（任意文体、可与其他数据源组合），结果区都会变成左右双框：左侧为原文的完整中文翻译（自动抓取全文，可切换中英逐段对照），右侧为可编辑的生成文案；</li>
              <li>不满意就点「换一版」，措辞会重新组合；</li>
              <li>润色后一键复制或存入草稿箱。</li>
            </ol>
          </div>
        )}
      </section>

      {toast ? (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full bg-orange-500 px-5 py-2 text-[13px] font-bold text-slate-900 shadow-xl">
          {toast}
        </div>
      ) : null}
    </div>
  );
}

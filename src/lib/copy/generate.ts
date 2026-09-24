import { getLeagueLeaders, getNews, getPlayerProfile, getScoreboard } from "@/lib/nba/store";
import { currentNbaSeasonYear } from "@/lib/nba/espn";
import { generateCopy, type CopyContext, type CopyResult, type LengthId, type TemplateId, type ToneId } from "./engine";
import { generateCopyWithAi, isAiConfigured, type AiInput } from "./ai";

export type GenerateInput = {
  template: TemplateId;
  tone: ToneId;
  length: LengthId;
  keywords?: string;
  variant?: number;
  espnId?: string | null;
  gameId?: string | null;
  gameDate?: string | null;
  newsId?: string | null;
  seasonYear?: number | null;
  /** false 时强制走本地模板引擎（用于对比/兜底） */
  useAi?: boolean;
  /** 用户自有 DashScope Key（BYOK），优先于服务端环境变量 */
  userApiKey?: string | null;
};

export type GenerateOutput = CopyResult & { context: CopyContext };

export async function buildContext(input: GenerateInput): Promise<CopyContext> {
  const ctx: CopyContext = {};
  const tasks: Promise<void>[] = [];

  if (input.espnId) {
    tasks.push(
      getPlayerProfile(input.espnId)
        .then((player) => {
          // 无效 ID（拿不到真实姓名）时不注入球员上下文
          if (player && player.fullName && !player.fullName.startsWith("球员 #")) {
            ctx.player = player;
          }
        })
        .catch(() => undefined),
    );
  }

  if (input.gameId) {
    const date = input.gameDate ?? new Date().toISOString().slice(0, 10);
    tasks.push(
      getScoreboard(date)
        .then((board) => {
          ctx.game = board.games.find((g) => g.id === input.gameId) ?? board.games[0] ?? null;
        })
        .catch(() => undefined),
    );
  }

  if (input.newsId) {
    tasks.push(
      getNews(40)
        .then((news) => {
          ctx.news = news.items.find((n) => n.id === input.newsId) ?? null;
        })
        .catch(() => undefined),
    );
  }

  if (input.template === "award-watch" || input.template === "data-drop" || input.template === "headline-pack") {
    const year = input.seasonYear ?? currentNbaSeasonYear();
    tasks.push(
      getLeagueLeaders(year, "pts")
        .then((leaders) => {
          ctx.leaders = leaders.rows;
          ctx.seasonYear = leaders.season ?? year; // 用实际返回数据的赛季，避免休赛期标注成未开打赛季
        })
        .catch(() => undefined),
    );
  }

  await Promise.all(tasks);
  return ctx;
}

export async function runGenerate(input: GenerateInput): Promise<GenerateOutput> {
  const ctx = await buildContext(input);

  const gen: AiInput = {
    template: input.template,
    tone: input.tone,
    length: input.length,
    ctx,
    keywords: input.keywords,
    variant: input.variant,
    userApiKey: input.userApiKey,
  };

  const wantAi = input.useAi !== false;

  // AI 优先：用户自带 Key 或服务端已配置密钥时调用大模型生成
  if (wantAi && isAiConfigured(input.userApiKey)) {
    try {
      const ai = await generateCopyWithAi(gen);
      return { ...ai, context: ctx };
    } catch (e) {
      // 出错自动回退模板引擎，并在结果里带上原因，界面会提示
      const fallback = generateCopy(gen);
      return { ...fallback, context: ctx, generatedBy: "template", aiError: (e as Error).message };
    }
  }

  // 未配置或未启用：使用本地确定性模板引擎
  const engineResult = generateCopy(gen);
  return { ...engineResult, context: ctx, generatedBy: "template" };
}

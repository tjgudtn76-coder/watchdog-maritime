import { callAiJson, callAiJsonRetry } from "../../lib/ai";
import { cleanText, isStale, normUrl } from "../../lib/news-util";
import { newsInstructions } from "../../lib/prompts";
import {
  MAX_KEYWORD_CHARS,
  MAX_NEWS_PER_CATEGORY,
  NEWS_CATEGORIES,
  NewsAiResultSchema,
  type NewsCategory,
  type NewsItem,
  type NewsResponse,
} from "../../lib/schemas";
// Watchdog Maritime 1항: 국제 해운시장·선박투자·선박운용 뉴스 취합 및 정리 API
// 분야 3개를 동시에 웹 검색해서(분야마다 AI 최대 3번) 합칩니다. 한 분야가 실패해도 나머지는 돌려줘요.
// 키워드를 넣었는데 어떤 분야에서 쓸 만한 자료가 하나도 안 나오면, 그 분야만 키워드 없이 분야 전반으로 한 번 더 찾아요.
// 받는 것: { keywords?: 담당자가 넣은 관심 키워드 (비워도 돼요) }
// 돌려주는 것: { ok: true, items, droppedCount, failedCategories, fallbackCategories } 또는 { ok: false, message }
// ※ 최악의 경우 54초(첫 검색) + 18초(보충 검색) = 72초라서 최대 실행 시간은 90초예요.
//   (배포할 때 Vercel 요금제가 90초를 허용하는지 확인해야 해요)
export const maxDuration = 90;

// 분야별 검색 안내 (AI에게 "이 분야는 이런 내용이에요"라고 알려 줘요)
const HINTS: Record<NewsCategory, string> = {
  해운시장: "국제 해운시장: 운임지수(BDI·SCFI 등), 컨테이너·벌크·탱커 수급, 물동량, 신조선 발주, 선사 실적, 지정학·항로 이슈(홍해·파나마 등). 검색 예: Baltic Dry Index, container freight rates, 해운 운임, 선박 발주",
  "선박투자·금융": "선박투자와 선박금융: 선박펀드·선박투자회사 동향, 선박금융(PF·리스) 시장, 금리, 금융당국·정부 정책, 해양진흥공사 등 정책금융. 검색 예: ship finance, 선박금융, 선박펀드, shipping loans",
  선박운용: "선박운용과 선박관리: 선박운용회사·선박관리사 동향, 용선(정기·나용선) 시장, 중고선가·신조선가, 환경규제(IMO·탄소) 대응, 선대 구성. 검색 예: second-hand vessel prices, ship management, IMO regulation, 중고선가",
};

// 분야별 기본 검색어 (영어). 입력이 짧은 영어 검색어일 때 gpt-4o-mini가 최신 기사를 가장 잘 찾아서, 지시는 instructions에 두고 입력은 검색어로만 만듭니다.
const QUERIES: Record<NewsCategory, string> = {
  해운시장: "Baltic Dry Index container freight rates tanker rates shipping market news",
  "선박투자·금융": "ship finance shipping loans newbuilding financing news",
  선박운용: "second-hand vessel prices charter rates ship management news",
};
// 첫 검색에서 자료가 하나도 안 나온 분야를 한 번 더 찾을 때 쓰는 다른 검색어
const ALT_QUERIES: Record<NewsCategory, string> = {
  해운시장: "dry bulk container tanker freight market weekly report",
  "선박투자·금융": "shipping company secures loan financing bank newbuild vessels",
  선박운용: "vessel charter market VLCC bulker containership time charter rates sale and purchase",
};

// 검색어에 붙일 현재 시점 표현 (예: "2026년 11월 / November 2026 / 2026년 10월")
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
function whenHint(now = new Date()) {
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return `${now.getFullYear()}년 ${now.getMonth() + 1}월 / ${MONTHS[now.getMonth()]} ${now.getFullYear()} / ${prev.getFullYear()}년 ${prev.getMonth() + 1}월 / this week`;
}

function monthEn(now = new Date()) {
  return `${MONTHS[now.getMonth()]} ${now.getFullYear()}`;
}

export async function POST(request: Request) {
  let keywords = "";
  try {
    const body = (await request.json()) as { keywords?: unknown };
    if (typeof body.keywords === "string") keywords = body.keywords.trim().slice(0, MAX_KEYWORD_CHARS);
  } catch {
    return Response.json({ ok: false, message: "요청 내용을 읽지 못했어요. 화면을 새로고침한 뒤 다시 시도해 주세요." } satisfies NewsResponse, { status: 400 });
  }

  const today = new Date().toISOString().slice(0, 10);

  // 분야 하나를 검색하고 코드 검사(출처 확인·날짜·중복)를 거친 자료만 돌려줘요.
  async function searchCategory(category: NewsCategory, kw: string, retry: boolean, alt = false) {
    const opts = {
      name: "maritime_news",
      instructions: newsInstructions(category, HINTS[category], kw, whenHint()) + `\n\n오늘 날짜: ${today}`,
      // 입력은 짧은 영어 검색어 + 현재 월로만 만들어요. (오늘 날짜·분야·키워드 설명은 instructions에 있어요)
      input: `${kw ? `${kw} ` : ""}${(alt ? ALT_QUERIES : QUERIES)[category]} ${monthEn()}`,
      schema: NewsAiResultSchema,
      webSearch: true,
      effort: "low" as const, // 검색 결과를 고르는 일이라 깊이 생각하지 않아도 돼요 (속도·비용)
    };
    const result = retry ? await callAiJsonRetry(opts) : await callAiJson({ ...opts, timeoutMs: 18_000 });
    if (!result.ok) return { ok: false as const, message: result.message };
    // 검색에서 실제로 나온 출처 주소가 아니면 뺍니다. (없는 기사를 지어내는 것 방지)
    const known = new Set((result.citations ?? []).map(normUrl).filter(Boolean));
    const valid = result.data.items.filter((it) => /^https?:\/\//.test(it.sourceUrl) && known.has(normUrl(it.sourceUrl)));
    const fresh = valid.filter((it) => !isStale(it.date)); // 한 달(31일)이 넘었거나 날짜를 모르는 자료는 "최신"이 아니라서 뺍니다
    console.log(`[news] ${category} 키워드=${kw || "-"}: AI ${result.data.items.length}건 → 출처확인 ${valid.length}건 → 최신 ${fresh.length}건 (날짜: ${result.data.items.map((i) => i.date || "없음").join(", ")})`); // 줄어드는 이유를 서버 로그로 확인하는 용도
    return { ok: true as const, items: fresh, dropped: result.data.items.length - fresh.length };
  }

  const first = await Promise.all(NEWS_CATEGORIES.map(async (category) => ({ category, r: await searchCategory(category, keywords, true) })));

  // 검색이 실패했거나 자료가 하나도 없는 분야는, 키워드 없이 다른 검색어로 한 번 더 찾아요.
  // (키워드가 있었다면 "분야 전반 자료로 채웠다"고 화면에 알려요)
  const fallbackCategories: NewsCategory[] = [];
  const second = await Promise.all(
    first.map(async ({ category, r }) => {
      if (r.ok && r.items.length > 0) return null; // 이미 찾았으면 보충하지 않아요
      const again = await searchCategory(category, "", false, true);
      if (keywords && again.ok && again.items.length > 0) fallbackCategories.push(category);
      return { category, again };
    }),
  );

  const items: NewsItem[] = [];
  const failedCategories: NewsCategory[] = [];
  let dropped = 0;
  let lastMessage = "";
  const seen = new Set<string>(); // 분야가 달라도 같은 기사는 한 번만 남겨요

  for (const { category, r } of first) {
    const extra = second.find((s) => s?.category === category)?.again;
    const use = (!r.ok || r.items.length === 0) && extra?.ok && extra.items.length > 0 ? extra : r;
    if (r.ok) dropped += r.dropped;
    if (extra?.ok && use === extra) dropped += extra.dropped;
    if (!use.ok) {
      failedCategories.push(category);
      lastMessage = use.message;
      continue;
    }
    let kept = 0;
    for (const it of use.items) {
      const key = normUrl(it.sourceUrl);
      if (seen.has(key) || kept >= MAX_NEWS_PER_CATEGORY) continue; // 후보가 더 많아도 분야마다 3건까지만
      seen.add(key);
      kept++;
      items.push({
        ...it,
        category,
        headline: cleanText(it.headline),
        summary: cleanText(it.summary),
        point: cleanText(it.point),
        details: it.details.map(cleanText).filter(Boolean).slice(0, 4),
      });
    }
  }

  if (failedCategories.length === NEWS_CATEGORIES.length) {
    return Response.json({ ok: false, message: lastMessage || "뉴스를 가져오지 못했어요." } satisfies NewsResponse, { status: 502 });
  }
  return Response.json({ ok: true, items, droppedCount: dropped, failedCategories, fallbackCategories } satisfies NewsResponse);
}

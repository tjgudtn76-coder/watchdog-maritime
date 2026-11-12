import { callAiJson, callAiJsonRetry } from "../../lib/ai";
import { cleanText, isStale, normUrl } from "../../lib/news-util";
import { extraSearchInstructions, outlookInstructions } from "../../lib/prompts";
import {
  MAX_EXTRAS,
  MAX_KEYWORD_CHARS,
  NEWS_CATEGORIES,
  NewsAiResultSchema,
  OUTLOOK_DIRECTIONS,
  OutlookAiResultSchema,
  type NewsExtra,
  type NewsItem,
  type OutlookArea,
  type OutlookDirection,
  type OutlookResponse,
} from "../../lib/schemas";
// Watchdog Maritime 2항: 산업 전반 향후 전망 API
// 1항에서 모은 뉴스를 근거로 전망을 씁니다. 키워드를 넣으면 그 키워드로 웹 검색을 한 번 더 해서 추가 자료도 근거로 써요.
// 받는 것: { news: 1항 뉴스 목록, keywords?: 2항 관심 키워드 }
// 돌려주는 것: { ok: true, summary, focus, areas, extras, adjustedCount } 또는 { ok: false, message }
// AI가 돌려준 전망은 코드로 한 번 더 검사해요: 근거 번호가 실제 자료 번호인지, 방향 표기가 맞는지.
// ※ 추가 검색(18초씩 3번까지) + 전망 작성(40초) = 최대 약 94초라서 최대 실행 시간은 100초예요.
//   (배포할 때 Vercel 요금제가 90초를 허용하는지 확인해야 해요)
export const maxDuration = 100;

// 검색어에 붙일 현재 시점 표현
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
function whenHint(now = new Date()) {
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return `${now.getFullYear()}년 ${now.getMonth() + 1}월 / ${MONTHS[now.getMonth()]} ${now.getFullYear()} / ${prev.getFullYear()}년 ${prev.getMonth() + 1}월 / this week`;
}

function fail(message: string, status: number) {
  return Response.json({ ok: false, message } satisfies OutlookResponse, { status });
}

// 화면에서 받은 뉴스 목록이 올바른 모양인지 확인해요. (화면을 거치지 않은 호출 방어)
function parseNews(raw: unknown): NewsItem[] {
  if (!Array.isArray(raw)) return [];
  const cats = NEWS_CATEGORIES as readonly string[];
  const out: NewsItem[] = [];
  for (const r of raw.slice(0, 12)) {
    if (!r || typeof r !== "object") continue;
    const o = r as Record<string, unknown>;
    if (typeof o.headline !== "string" || typeof o.summary !== "string" || typeof o.category !== "string" || !cats.includes(o.category)) continue;
    out.push({
      category: o.category as NewsItem["category"],
      headline: o.headline.slice(0, 200),
      summary: o.summary.slice(0, 1200),
      point: typeof o.point === "string" ? o.point.slice(0, 300) : "",
      details: Array.isArray(o.details) ? o.details.filter((d): d is string => typeof d === "string").slice(0, 4).map((d) => d.slice(0, 120)) : [],
      sourceName: typeof o.sourceName === "string" ? o.sourceName.slice(0, 100) : "",
      sourceUrl: typeof o.sourceUrl === "string" ? o.sourceUrl.slice(0, 500) : "",
      date: typeof o.date === "string" ? o.date.slice(0, 20) : "",
    });
  }
  return out;
}

export async function POST(request: Request) {
  let body: { news?: unknown; keywords?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return fail("요청 내용을 읽지 못했어요. 화면을 새로고침한 뒤 다시 시도해 주세요.", 400);
  }
  const news = parseNews(body.news);
  const keywords = typeof body.keywords === "string" ? body.keywords.trim().slice(0, MAX_KEYWORD_CHARS) : "";
  if (news.length === 0 && !keywords) return fail("전망의 근거가 될 뉴스가 없어요. 1항에서 뉴스를 먼저 만들어 주세요.", 400);

  const today = new Date().toISOString().slice(0, 10);

  // 키워드가 있으면 추가 자료를 웹 검색으로 더 찾아요. (실패해도 뉴스만으로 전망을 이어 가요)
  let extras: NewsExtra[] = [];
  if (keywords) {
    const found = await callAiJsonRetry({
      name: "outlook_extra",
      instructions: extraSearchInstructions(keywords, whenHint()),
      // 입력은 짧은 검색어(키워드 + 영어 전망 단어 + 현재 월)로만 만들어요. gpt-4o-mini가 최신 자료를 가장 잘 찾는 모양이에요.
      input: `${keywords} shipping market outlook forecast ${MONTHS[new Date().getMonth()]} ${new Date().getFullYear()}`,
      schema: NewsAiResultSchema,
      webSearch: true,
      effort: "low",
    });
    if (found.ok) {
      const known = new Set((found.citations ?? []).map(normUrl).filter(Boolean));
      const seen = new Set(news.map((n) => normUrl(n.sourceUrl)));
      for (const it of found.data.items) {
        const key = normUrl(it.sourceUrl);
        if (!/^https?:\/\//.test(it.sourceUrl) || !known.has(key) || seen.has(key) || isStale(it.date)) continue; // 한 달(31일)이 넘었거나 날짜를 모르는 자료는 뺍니다
        seen.add(key);
        extras.push({
          ...it,
          headline: cleanText(it.headline),
          summary: cleanText(it.summary),
          point: cleanText(it.point),
          details: it.details.map(cleanText).filter(Boolean).slice(0, 4),
        });
        if (extras.length >= MAX_EXTRAS) break;
      }
    }
  }
  extras = extras.slice(0, MAX_EXTRAS);

  // 자료 목록: 뉴스 번호 1..n, 이어서 추가 자료 n+1..
  const all = [
    ...news.map((n) => ({ tag: `뉴스·${n.category}`, ...n })),
    ...extras.map((e) => ({ tag: "추가 자료", ...e })),
  ];
  if (all.length === 0) return fail("전망의 근거가 될 자료를 찾지 못했어요. 키워드를 바꾸거나 1항 뉴스를 먼저 만들어 주세요.", 422);
  const list = all
    .map((a, i) => `${i + 1}. [${a.tag}] ${a.headline} (${a.date || "날짜 미상"}, ${a.sourceName})\n   ${a.summary}${a.details.length ? `\n   핵심: ${a.details.join(" / ")}` : ""}`)
    .join("\n");

  const result = await callAiJson({
    name: "industry_outlook",
    instructions: outlookInstructions(keywords),
    input: `오늘 날짜: ${today}\n관심 키워드: ${keywords || "(없음)"}\n\n[자료 목록]\n${list}`,
    schema: OutlookAiResultSchema,
    timeoutMs: 40_000,
    effort: "low",
  });
  if (!result.ok) return fail(result.message, 502);

  // 코드 검사: 분야는 정해진 세 가지, 방향은 긍정/중립/부정만, 근거 번호는 실제 자료 번호만.
  // 근거가 하나도 없으면 방향을 "중립"으로 바꾸고 "근거 확인 필요"를 붙여요.
  let adjustedCount = 0;
  const areas: OutlookArea[] = [];
  for (const area of NEWS_CATEGORIES) {
    const a = result.data.areas.find((x) => x.area.replace(/\s/g, "") === area.replace(/\s/g, ""));
    if (!a) continue;
    const basis = [...new Set(a.basis.filter((n) => Number.isInteger(n) && n >= 1 && n <= all.length))].sort((x, y) => x - y);
    const dirOk = (OUTLOOK_DIRECTIONS as readonly string[]).includes(a.direction.trim());
    let direction: OutlookDirection = dirOk ? (a.direction.trim() as OutlookDirection) : "중립";
    let forceCheck = false;
    if (basis.length === 0 || !dirOk) {
      forceCheck = true;
      if (direction !== "중립") direction = "중립";
      adjustedCount++;
    }
    areas.push({
      area,
      direction,
      outlook: a.outlook.trim(),
      basis,
      risks: a.risks.map((r) => r.trim()).filter(Boolean).slice(0, 3),
      watch: a.watch.trim(),
      forceCheck,
    });
  }
  if (areas.length === 0) return fail("AI 전망을 정해진 모양으로 읽지 못했어요. [다시 시도]를 눌러 주세요.", 502);

  return Response.json({
    ok: true,
    summary: cleanText(result.data.summary),
    focus: keywords ? cleanText(result.data.focus) : "",
    areas,
    extras,
    adjustedCount,
  } satisfies OutlookResponse);
}

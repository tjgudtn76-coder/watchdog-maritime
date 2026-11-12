"use client";

import { useEffect, useState } from "react";
import {
  MAX_KEYWORD_CHARS,
  NEWS_CATEGORIES,
  OUTLOOK_DISCLAIMER,
  type ApiError,
  type NewsCategory,
  type NewsExtra,
  type NewsItem,
  type NewsResponse,
  type OutlookArea,
  type OutlookResponse,
} from "../lib/schemas";
import ErrorRetry from "./ErrorRetry";
import { ExtraPage, NewsPage, OutlookPage, TextPage, Waves } from "./CardPages";

// Watchdog Maritime: 1항 국제 해운시장·선박투자·선박운용 뉴스 취합·정리, 2항 산업 전반 향후 전망
type Step = 1 | 2 | 3;

const SERVER_BUSY = "분석 서버가 제때 답하지 못했어요. 잠시 뒤 [다시 시도]를 눌러 주세요.";

// 서버(API)에 보내 답을 받아 옵니다. 실패하면 항상 { ok: false, message: 쉬운 말 } 로 돌려줘요.
async function postJson<T>(url: string, body: unknown): Promise<T | ApiError> {
  try {
    const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    try {
      return (await res.json()) as T | ApiError;
    } catch {
      return { ok: false, message: SERVER_BUSY }; // 서버가 정해진 모양이 아닌 답을 준 경우(강제 종료 등)
    }
  } catch {
    return { ok: false, message: "인터넷 연결 문제로 서버에 닿지 못했어요. 연결을 확인하고 [다시 시도]를 눌러 주세요." };
  }
}

// 2항 전망 결과 (화면에서 쓰는 묶음)
type Outlook = { summary: string; focus: string; areas: OutlookArea[]; extras: NewsExtra[]; adjusted: number };

// 브라우저 임시 저장 (서버에는 저장하지 않아요)
const STORAGE_KEY = "watchdog-maritime-v1";
type Saved = {
  step: Step;
  newsKeywords: string;
  outlookKeywords: string;
  news: NewsItem[];
  newsDropped: number;
  newsFailed: NewsCategory[];
  outlook: Outlook | null;
};

function loadSaved(): Saved | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Saved) : null;
  } catch {
    return null;
  }
}
function writeSaved(s: Saved | null) {
  try {
    if (s) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* 저장이 막힌 브라우저에서는 조용히 넘어갑니다 */
  }
}

const STEPS: { n: Step; label: string }[] = [
  { n: 1, label: "관심 키워드" },
  { n: 2, label: "분석 결과" },
  { n: 3, label: "통합 보고서" },
];

const HERO: Record<Step, { title: string; desc: string }> = {
  1: {
    title: "국제 해운시장과 선박투자·운용의 최신 흐름을 한눈에",
    desc: "AI가 인터넷의 뉴스·정부 발표·시장 보고서 중 최근 한 달 안의 자료만 검색해 이슈별 카드뉴스로 정리하고, 그 자료를 근거로 산업 전반의 향후 전망까지 분석해 드려요.",
  },
  2: { title: "정리된 뉴스와 향후 전망을 확인하세요", desc: "출처 링크로 원문을 확인하고, 키워드를 바꿔 원하는 분야를 더 자세히 다시 정리할 수 있어요." },
  3: { title: "하나로 묶은 통합 보고서", desc: "뉴스 정리와 산업 전망을 한 번에 복사해 보고 자료로 쓰세요." },
};

const BTN_SECONDARY =
  "rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50";
const BTN_PRIMARY =
  "rounded-lg bg-[#0a6e9e] px-6 py-2.5 text-sm font-semibold text-white hover:bg-[#052a4d] disabled:cursor-not-allowed disabled:bg-slate-300";

function Card({ title, kicker, desc, children }: { title: string; kicker?: string; desc?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-slate-200 border-t-4 border-t-[#0a6e9e] bg-white p-5 shadow-sm sm:p-7">
      {kicker && <p className="text-sm font-semibold tracking-wide text-[#0a6e9e]">{kicker}</p>}
      <h2 className={kicker ? "mt-0.5 text-4xl font-extrabold tracking-tight text-[#052a4d] sm:text-5xl" : "text-xl font-extrabold text-[#052a4d]"}>{title}</h2>
      {desc && <p className="mt-1 text-sm text-slate-500">{desc}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

// 관심 키워드 입력창 (1항·2항에서 같은 모양으로 써요)
function KeywordInput({
  id,
  label,
  value,
  onChange,
  placeholder,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <div>
      <label className="block text-sm font-semibold text-slate-800" htmlFor={id}>
        {label} <span className="font-normal text-slate-400">(선택)</span>
      </label>
      <input
        id={id}
        value={value}
        maxLength={MAX_KEYWORD_CHARS}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:border-sky-600 focus:outline-none"
      />
      <p className="mt-1 text-xs text-slate-500">쉼표로 여러 개를 적을 수 있어요. 적으면 그 키워드를 중심으로 더 자세히 정리해요. 비우면 분야 전반을 정리해요. 회사 내부 정보·대외비·실명은 적지 마세요 (외부 AI로 전송돼요).</p>
    </div>
  );
}

// 근거 번호를 "뉴스 3" / "추가 1" 같은 이름으로 바꿔요. (번호는 뉴스 뒤에 추가 자료가 이어져요)
const refLabel = (n: number, newsLen: number) => (n <= newsLen ? `뉴스 ${n}` : `추가 ${n - newsLen}`);

export default function Workspace() {
  const [step, setStep] = useState<Step>(1);
  const [newsKeywords, setNewsKeywords] = useState(""); // 1항 관심 키워드
  const [outlookKeywords, setOutlookKeywords] = useState(""); // 2항 관심 키워드
  const [news, setNews] = useState<NewsItem[]>([]); // 1항 결과 (분야 순서대로)
  const [newsDropped, setNewsDropped] = useState(0); // 출처를 확인하지 못해 뺀 건수
  const [newsFailed, setNewsFailed] = useState<NewsCategory[]>([]); // 검색에 실패한 분야
  const [newsFallback, setNewsFallback] = useState<NewsCategory[]>([]); // 키워드 자료가 없어 분야 전반 자료로 채운 분야
  const [newsError, setNewsError] = useState<string | null>(null);
  const [newsBusy, setNewsBusy] = useState(false); // 결과 화면에서 뉴스만 다시 만드는 중
  const [outlook, setOutlook] = useState<Outlook | null>(null); // 2항 결과
  const [outlookError, setOutlookError] = useState<string | null>(null);
  const [outlookBusy, setOutlookBusy] = useState(false);
  const [outlookStale, setOutlookStale] = useState(false); // 뉴스가 바뀐 뒤 전망을 아직 다시 만들지 않은 경우
  const [analyzing, setAnalyzing] = useState(false); // 처음 [분석 시작] 진행 중
  const [phase, setPhase] = useState<"news" | "outlook">("news");
  const [copied, setCopied] = useState<string | null>(null);
  const [restored, setRestored] = useState(false);
  const [loaded, setLoaded] = useState(false);

  // 처음 열 때: 임시 저장된 작업이 있으면 불러오기
  useEffect(() => {
    const s = loadSaved();
    /* eslint-disable react-hooks/set-state-in-effect -- 브라우저 저장소는 화면이 뜬 뒤에만 읽을 수 있어요 */
    if (s) {
      setStep(s.step);
      setNewsKeywords(s.newsKeywords ?? "");
      setOutlookKeywords(s.outlookKeywords ?? "");
      setNews(s.news ?? []);
      setNewsDropped(s.newsDropped ?? 0);
      setNewsFailed(s.newsFailed ?? []);
      setOutlook(s.outlook ?? null);
      setRestored(true);
    }
    setLoaded(true);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  // 바뀔 때마다 임시 저장
  useEffect(() => {
    if (!loaded) return;
    const empty = step === 1 && news.length === 0 && !outlook && !newsKeywords && !outlookKeywords;
    writeSaved(empty ? null : { step, newsKeywords, outlookKeywords, news, newsDropped, newsFailed, outlook });
  }, [loaded, step, newsKeywords, outlookKeywords, news, newsDropped, newsFailed, outlook]);

  function applyNews(r: NewsResponse) {
    if (!r.ok) return false;
    setNews(r.items);
    setNewsDropped(r.droppedCount);
    setNewsFailed(r.failedCategories);
    setNewsFallback(r.fallbackCategories ?? []);
    return true;
  }

  function applyOutlook(r: OutlookResponse) {
    if (r.ok) {
      setOutlook({ summary: r.summary, focus: r.focus, areas: r.areas, extras: r.extras, adjusted: r.adjustedCount });
      setOutlookError(null);
      setOutlookStale(false);
    } else {
      setOutlook(null);
      setOutlookError(r.message);
    }
  }

  const requestNews = () => postJson<NewsResponse>("/api/news", { keywords: newsKeywords.trim() });
  const requestOutlook = (items: NewsItem[]) => postJson<OutlookResponse>("/api/outlook", { news: items, keywords: outlookKeywords.trim() });

  // [분석 시작]: 1항 뉴스를 먼저 모으고, 그 뉴스를 근거로 2항 전망을 만들어요.
  // 뉴스가 실패하면 1단계에 머물고, 전망만 실패하면 결과 화면으로 가서 전망만 [다시 시도]할 수 있어요.
  async function startAnalysis() {
    setAnalyzing(true);
    setNewsError(null);
    setPhase("news");
    try {
      const n = await requestNews();
      if (!n.ok) {
        setNewsError(n.message);
        return;
      }
      applyNews(n);
      setPhase("outlook");
      applyOutlook(await requestOutlook(n.items));
      setStep(2);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } finally {
      setAnalyzing(false);
    }
  }

  // 결과 화면에서 1항 뉴스만 새로 만듭니다. 전망은 근거가 바뀌었으니 다시 만들라고 알려요.
  async function regenerateNews() {
    setNewsBusy(true);
    setNewsError(null);
    try {
      const n = await requestNews();
      if (applyNews(n)) setOutlookStale(true);
      else if (!n.ok) setNewsError(n.message);
    } finally {
      setNewsBusy(false);
    }
  }

  // 결과 화면에서 2항 전망만 새로 만듭니다. (지금 화면의 뉴스를 근거로)
  async function regenerateOutlook() {
    setOutlookBusy(true);
    setOutlookError(null);
    try {
      applyOutlook(await requestOutlook(news));
    } finally {
      setOutlookBusy(false);
    }
  }

  function reset() {
    setStep(1);
    setNewsKeywords("");
    setOutlookKeywords("");
    setNews([]);
    setNewsDropped(0);
    setNewsFailed([]);
    setNewsFallback([]);
    setNewsError(null);
    setOutlook(null);
    setOutlookError(null);
    setOutlookStale(false);
    setRestored(false);
    writeSaved(null);
  }

  function goTo(s: Step) {
    setStep(s);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function copyText(key: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      alert("복사에 실패했어요. 내용을 직접 선택해서 복사해 주세요.");
    }
  }

  return (
    <div className="flex min-h-full flex-col bg-gradient-to-b from-[#e3f4f9] via-[#f2fafc] to-[#d6edf5]">
      {/* 맨 위 안내 줄 */}
      <div className="border-b border-sky-200 bg-[#d3ebf3] text-xs text-slate-700">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-2 px-4 py-1.5 sm:px-6">
          <span>국제 해운시장 · 선박투자 · 선박운용 동향 분석</span>
          <span className="hidden sm:inline">AI 초안 · 최종 판단은 담당자가</span>
        </div>
      </div>

      {/* 로고 + 메뉴(진행 단계) */}
      <header className="z-10 border-b-2 sm:sticky sm:top-0 border-[#0a6e9e] bg-white shadow-sm">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 sm:px-6">
          <div className="flex items-center gap-3 py-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#0a6e9e] text-lg text-white" aria-hidden>
              ⚓
            </span>
            <div className="leading-tight">
              <p className="text-xl font-extrabold tracking-tight text-[#052a4d]">Watchdog Maritime</p>
              <p className="text-xs text-slate-500">해운·선박투자·선박운용 뉴스 및 전망 분석</p>
            </div>
          </div>
          <nav aria-label="진행 단계">
            <ol className="flex">
              {STEPS.map((s) => {
                const active = s.n === step;
                const done = s.n < step;
                return (
                  <li key={s.n}>
                    <button
                      type="button"
                      disabled={!done}
                      onClick={() => goTo(s.n)}
                      aria-current={active ? "step" : undefined}
                      className={`border-b-4 px-3 py-4 text-sm sm:px-6 sm:text-base ${
                        active
                          ? "border-[#0a6e9e] font-bold text-[#0a6e9e]"
                          : done
                            ? "border-transparent font-medium text-slate-700 hover:text-[#0a6e9e]"
                            : "cursor-default border-transparent text-slate-400"
                      }`}
                    >
                      <span className="mr-1">{done ? "✓" : s.n}</span>
                      {s.label}
                    </button>
                  </li>
                );
              })}
            </ol>
          </nav>
        </div>
      </header>

      {/* 큰 배너 */}
      <section className="relative overflow-hidden bg-gradient-to-b from-[#052a4d] via-[#0a6e9e] to-[#14a7c4] text-white">
        {/* 햇빛이 비치는 바다 빛 */}
        <div className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full bg-[#7fe3f2]/25 blur-3xl" aria-hidden />
        {/* 컨테이너선 그림: 물결 위에서 천천히 떠다녀요 */}
        <svg className="ship-bob pointer-events-none absolute bottom-10 right-8 hidden h-28 w-72 opacity-40 md:block" viewBox="0 0 280 110" aria-hidden>
          <path d="M10 70 H270 L245 98 H35 Z" fill="white" />
          <rect x="190" y="30" width="40" height="40" fill="white" />
          <rect x="198" y="14" width="22" height="16" fill="white" />
          {[40, 78, 116, 154].map((x) => (
            <g key={x}>
              <rect x={x} y="48" width="34" height="22" fill="white" />
              <rect x={x} y="28" width="34" height="18" fill="white" opacity="0.7" />
            </g>
          ))}
        </svg>
        {/* 겹친 물결 3겹 (뒤쪽일수록 연하고 느리게) */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16" aria-hidden>
          <div className="wave-drift-slow absolute inset-x-0 bottom-0 w-[200%]">
            <Waves className="h-14 w-full" fill="#7fe3f2" opacity={0.25} />
          </div>
          <div className="wave-drift absolute inset-x-0 bottom-0 w-[200%]">
            <Waves className="h-11 w-full" fill="#e9f7fb" opacity={0.5} />
          </div>
          <Waves className="absolute inset-x-0 -bottom-px h-8 w-full" fill="#e3f4f9" />
        </div>
        <div className="relative mx-auto max-w-6xl px-4 pb-20 pt-10 sm:px-6 sm:pb-24 sm:pt-14">
          <p className="text-sm font-medium text-sky-200">
            STEP {step} · {STEPS[step - 1].label}
          </p>
          <h1 className="mt-2 max-w-3xl text-2xl font-extrabold leading-snug sm:text-4xl">{HERO[step].title}</h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-sky-100 sm:text-base">{HERO[step].desc}</p>
        </div>
      </section>

      <main className="mx-auto w-full max-w-6xl flex-1 space-y-6 px-4 py-8 sm:px-6 sm:py-10">
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          AI가 만든 <b>초안</b>이에요. 출처를 함께 보여 드리니, 원문을 확인하고 최종 판단은 담당자가 해 주세요.
        </p>

        {restored && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
            <span>💾 이 컴퓨터에 임시 저장된 작업을 불러왔어요. 이어서 하시면 돼요.</span>
            <button onClick={reset} className="text-xs font-medium text-sky-800 underline hover:text-sky-950">
              지우고 새로 시작
            </button>
          </div>
        )}

        {step === 1 && (
          <>
            <Card
              title="What’s new" kicker="① 뉴스 취합 및 정리"
              desc="국제 해운시장 · 선박투자·금융 · 선박운용 3개 분야의 최신 자료를 인터넷에서 검색해, 이슈 하나를 카드뉴스 한 페이지로 정리해요. 최근 한 달 안의 자료만 쓰고, 뉴스 기사뿐 아니라 정부 발표·기업 공시·시장 보고서도 찾아요."
            >
              <KeywordInput
                id="news-keywords"
                label="관심 키워드"
                value={newsKeywords}
                onChange={setNewsKeywords}
                placeholder="예: 컨테이너 운임, 선박펀드 금리, 중고선가, IMO 탄소규제"
              />
            </Card>

            <Card title="What’s next" kicker="② 산업 전반 향후 전망" desc="①에서 모은 자료를 근거로 해운시장·선박투자·선박운용의 향후 전망과 위험 요인, 지켜볼 지표를 분석해요.">
              <KeywordInput
                id="outlook-keywords"
                label="전망 관심 키워드"
                value={outlookKeywords}
                onChange={setOutlookKeywords}
                placeholder="예: 홍해 사태 영향, 2027년 신조선 공급과잉, 금리 인하"
              />
              <p className="mt-2 text-xs text-sky-800">키워드를 적으면 그 키워드로 인터넷을 한 번 더 검색해 추가 자료를 근거로 쓰고, 해당 주제의 상세 분석을 더해요.</p>
            </Card>

            <div className="flex justify-end">
              <button onClick={startAnalysis} disabled={analyzing} className={BTN_PRIMARY}>
                {analyzing ? (phase === "news" ? "뉴스를 모으는 중… (1분 정도)" : "전망을 분석하는 중… (1분 정도)") : "분석 시작"}
              </button>
            </div>
            {newsError && <ErrorRetry message={newsError} onRetry={startAnalysis} busy={analyzing} />}
          </>
        )}

        {step === 2 && (
          <>
            <Card title="What’s new" kicker="① 뉴스 취합 및 정리" desc="이슈마다 한 페이지씩 정리했어요. 최근 한 달 안의 자료만 담겼고, 출처 링크로 원문을 꼭 확인해 주세요.">
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <KeywordInput
                  id="news-keywords-2"
                  label="관심 키워드"
                  value={newsKeywords}
                  onChange={setNewsKeywords}
                  placeholder="예: 컨테이너 운임, 선박펀드 금리, 중고선가, IMO 탄소규제"
                />
                <button onClick={regenerateNews} disabled={newsBusy} className={`${BTN_SECONDARY} mt-3`}>
                  {newsBusy ? "다시 찾는 중… (1분 정도)" : "이 키워드로 뉴스 다시 정리"}
                </button>
              </div>

              {newsDropped > 0 && (
                <p className="mt-4 rounded-lg border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-900">
                  AI가 낸 자료 중 <b>{newsDropped}건</b>은 출처를 확인하지 못했거나, 한 달이 넘었거나, 날짜를 알 수 없어서 뺐어요.
                </p>
              )}
              {newsFallback.length > 0 && (
                <p className="mt-4 rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
                  {newsFallback.join(", ")} 분야는 키워드와 직접 관련된 자료를 찾지 못해, 분야 전반의 최신 자료로 채웠어요.
                </p>
              )}
              {newsFailed.length > 0 && (
                <p className="mt-4 rounded-lg border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-900">
                  {newsFailed.join(", ")} 분야는 검색에 실패했어요. [다시 정리]를 눌러 보세요.
                </p>
              )}
              {newsError && !newsBusy && <ErrorRetry title="뉴스를 정리하지 못했어요." message={newsError} onRetry={regenerateNews} />}

              <div className="mt-5 space-y-6">
                {NEWS_CATEGORIES.map((cat) => {
                  const rows = news.map((n, i) => ({ n, i })).filter((r) => r.n.category === cat);
                  return (
                    <div key={cat}>
                      <h3 className="flex items-center gap-2 border-l-4 border-[#0a6e9e] pl-3 text-base font-bold text-slate-900">
                        {cat} <span className="text-sm font-normal text-slate-500">{rows.length}건</span>
                      </h3>
                      {rows.length === 0 ? (
                        <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                          출처를 확인할 수 있는 자료를 찾지 못했어요. 키워드를 바꿔 다시 정리해 보세요.
                        </p>
                      ) : (
                        <ul className={`mt-3 ${PAGE_GRID}`}>
                          {rows.map(({ n, i }) => (
                            <NewsPage key={`${i}-${n.sourceUrl}`} item={n} no={i + 1} total={news.length} />
                          ))}
                        </ul>
                      )}
                    </div>
                  );
                })}
              </div>
              {news.length > 0 && (
                <div className="mt-5">
                  <button onClick={() => copyText("news", newsText(news))} className={BTN_SECONDARY}>
                    {copied === "news" ? "✓ 복사했어요" : "뉴스 정리 전체 복사"}
                  </button>
                </div>
              )}
            </Card>

            <Card title="What’s next" kicker="② 산업 전반 향후 전망" desc="①의 뉴스(와 키워드로 찾은 추가 자료)를 근거로 쓴 전망 초안이에요. 근거 번호로 어떤 자료를 바탕으로 했는지 확인할 수 있어요.">
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <KeywordInput
                  id="outlook-keywords-2"
                  label="전망 관심 키워드"
                  value={outlookKeywords}
                  onChange={setOutlookKeywords}
                  placeholder="예: 홍해 사태 영향, 2027년 신조선 공급과잉, 금리 인하"
                />
                <button onClick={regenerateOutlook} disabled={outlookBusy || newsBusy || news.length === 0} className={`${BTN_SECONDARY} mt-3`}>
                  {outlookBusy ? "분석 중… (1분 정도)" : outlook ? "이 키워드로 전망 다시 분석" : "전망 분석하기"}
                </button>
              </div>

              {outlookStale && (
                <p className="mt-4 rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
                  뉴스가 바뀌었어요. 아래 전망은 이전 뉴스를 근거로 한 것이라, [전망 다시 분석]을 눌러 새 뉴스 기준으로 바꿔 주세요.
                </p>
              )}
              {outlookError && !outlookBusy && <ErrorRetry title="전망을 만들지 못했어요." message={outlookError} onRetry={regenerateOutlook} />}

              {outlook && !outlookBusy && <OutlookPages outlook={outlook} newsLen={news.length} />}
              {outlook && !outlookBusy && (
                <div className="mt-5">
                  <button onClick={() => copyText("outlook", outlookText(outlook, news.length))} className={BTN_SECONDARY}>
                    {copied === "outlook" ? "✓ 복사했어요" : "전망 전체 복사"}
                  </button>
                </div>
              )}
            </Card>

            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
              <button onClick={() => goTo(1)} className={BTN_SECONDARY}>
                ← 처음 화면으로
              </button>
              <button onClick={() => goTo(3)} disabled={newsBusy || outlookBusy} className={BTN_PRIMARY}>
                통합 보고서 만들기 →
              </button>
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <Report news={news} outlook={outlook} stale={outlookStale} />
            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
              <div className="flex gap-2">
                <button onClick={() => goTo(2)} className={BTN_SECONDARY}>
                  ← 검토로 돌아가기
                </button>
                <button onClick={reset} className={BTN_SECONDARY}>
                  처음부터
                </button>
              </div>
              <button onClick={() => copyText("report", buildReportText(news, outlook, newsKeywords.trim(), outlookKeywords.trim()))} className={BTN_PRIMARY}>
                {copied === "report" ? "✓ 복사했어요" : "보고서 복사하기"}
              </button>
            </div>
          </>
        )}
      </main>

      <footer className="relative mt-6 bg-[#031d3b] text-sm text-sky-100/80">
        <Waves className="absolute inset-x-0 -top-7 h-8 w-full" fill="#031d3b" />
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-6 sm:px-6">
          <div>
            <p className="font-bold text-white">Watchdog Maritime</p>
            <p className="mt-1 text-xs">해운·선박투자·선박운용 담당자를 위한 AI 뉴스 정리 및 전망 분석 도구</p>
          </div>
          <p className="max-w-md text-xs leading-relaxed">※ {OUTLOOK_DISCLAIMER}. 입력한 내용은 서버에 저장되지 않고, 이 컴퓨터의 브라우저에만 임시 저장돼요.</p>
        </div>
      </footer>
    </div>
  );
}

// ───── 글 만들기 (복사용) ─────
function newsLine(n: NewsItem, no: number) {
  return [
    `[뉴스 ${no} · ${n.category}] ${n.headline}`,
    n.summary,
    ...n.details.map((d) => `· ${d}`),
    `💡 알아둘 점: ${n.point}`,
    `출처: ${n.sourceName}${n.date ? ` (${n.date})` : ""} ${n.sourceUrl}`,
  ].join("\n");
}
const newsText = (news: NewsItem[]) => news.map((n, i) => newsLine(n, i + 1)).join("\n\n");

function outlookText(o: Outlook, newsLen: number) {
  const lines: string[] = [`[산업 전반 전망 요약]\n${o.summary}`];
  if (o.focus) lines.push(`[관심 키워드 상세 분석]\n${o.focus}`);
  for (const a of o.areas) {
    lines.push(
      [
        `[${a.area}] 전망: ${a.direction}${a.forceCheck ? " (근거 확인 필요)" : ""}`,
        a.outlook,
        a.basis.length ? `근거: ${a.basis.map((b) => refLabel(b, newsLen)).join(", ")}` : "근거: 확인 필요",
        ...(a.risks.length ? [`위험 요인: ${a.risks.join(" / ")}`] : []),
        ...(a.watch ? [`지켜볼 점: ${a.watch}`] : []),
      ].join("\n"),
    );
  }
  if (o.extras.length) {
    lines.push(
      "[키워드 추가 자료]\n" +
        o.extras.map((e, i) => `추가 ${i + 1}. ${e.headline}\n${e.summary}\n출처: ${e.sourceName}${e.date ? ` (${e.date})` : ""} ${e.sourceUrl}`).join("\n\n"),
    );
  }
  return lines.join("\n\n");
}

// ───── 화면 부품 (카드뉴스 페이지는 CardPages.tsx) ─────
const PAGE_GRID = "grid gap-5 md:grid-cols-2 xl:grid-cols-3";

// 2항 전망을 카드뉴스 페이지로 보여 줘요: 요약 → (키워드 분석) → 분야별 → 추가 자료
function OutlookPages({ outlook, newsLen }: { outlook: Outlook; newsLen: number }) {
  return (
    <div className="mt-5 space-y-4">
      {outlook.adjusted > 0 && (
        <p className="rounded-lg border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-900">
          <b>{outlook.adjusted}개 분야</b>는 근거 자료를 확인하지 못해 방향을 &quot;중립&quot;으로 바꿨어요.
        </p>
      )}
      <ul className={PAGE_GRID}>
        <TextPage tag="산업 전반 전망" title="한눈에 보는 산업 전망" body={outlook.summary} footer="아래 분야별 페이지에서 근거와 위험 요인을 확인하세요" />
        {outlook.focus && <TextPage tag="관심 키워드" title="키워드 상세 분석" body={outlook.focus} />}
        {outlook.areas.map((a) => (
          <OutlookPage
            key={a.area}
            area={a}
            basisText={a.basis.length ? a.basis.map((b) => refLabel(b, newsLen)).join(" · ") : "확인 필요"}
          />
        ))}
        {outlook.extras.map((e, i) => (
          <ExtraPage key={`${i}-${e.sourceUrl}`} item={e} no={i + 1} />
        ))}
      </ul>
    </div>
  );
}

function Report({ news, outlook, stale }: { news: NewsItem[]; outlook: Outlook | null; stale: boolean }) {
  const today = new Date().toLocaleDateString("ko-KR");
  return (
    <article className="space-y-8">
      <header className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#052a4d] via-[#0a6e9e] to-[#14a7c4] p-6 text-white shadow-md sm:p-8">
        <p className="text-xs font-semibold tracking-wider text-sky-200">Watchdog Maritime · 통합 보고서</p>
        <h2 className="mt-1 text-2xl font-extrabold sm:text-3xl">국제 해운·선박투자·선박운용 동향 및 전망</h2>
        <p className="mt-2 text-sm text-sky-100">
          작성일 {today} · 최근 한 달 이내 자료만 인용 · 정리한 이슈 {news.length}건
          {outlook ? ` · 전망 ${outlook.areas.map((a) => `${a.area} ${a.direction}`).join(" / ")}` : ""}
        </p>
        <Waves className="pointer-events-none absolute inset-x-0 -bottom-px h-8 w-full" fill="#e9f7fb" opacity={0.25} />
      </header>
      {stale && <p className="text-xs font-medium text-orange-800">※ 전망이 이전 뉴스를 근거로 한 것이에요. 검토 화면에서 전망을 다시 분석한 뒤 보고서를 만들어 주세요.</p>}

      <section>
        <h3 className="border-l-4 border-[#0a6e9e] pl-3 text-lg font-extrabold text-[#052a4d]">1. 뉴스 취합 및 정리 — 이슈별 카드</h3>
        {news.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">정리된 뉴스가 없어요.</p>
        ) : (
          NEWS_CATEGORIES.map((cat) => {
            const rows = news.map((n, i) => ({ n, i })).filter((r) => r.n.category === cat);
            if (rows.length === 0) return null;
            return (
              <div key={cat} className="mt-4">
                <p className="mb-2 text-sm font-bold text-[#0a6e9e]">{cat}</p>
                <ul className={PAGE_GRID}>
                  {rows.map(({ n, i }) => (
                    <NewsPage key={`${i}-${n.sourceUrl}`} item={n} no={i + 1} total={news.length} />
                  ))}
                </ul>
              </div>
            );
          })
        )}
      </section>

      <section>
        <h3 className="border-l-4 border-[#0a6e9e] pl-3 text-lg font-extrabold text-[#052a4d]">2. 산업 전반 향후 전망 — 이슈별 카드</h3>
        {!outlook ? (
          <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            전망을 만들지 못해 이 보고서에는 빠져 있어요. 검토 화면에서 [전망 분석하기]로 결과를 받은 뒤 보고서를 만들어 주세요.
          </p>
        ) : (
          <OutlookPages outlook={outlook} newsLen={news.length} />
        )}
      </section>

      <p className="rounded-xl bg-white/80 px-4 py-3 text-sm font-medium text-slate-700 ring-1 ring-sky-200">※ {OUTLOOK_DISCLAIMER}</p>
    </article>
  );
}

function buildReportText(news: NewsItem[], outlook: Outlook | null, newsKeywords: string, outlookKeywords: string) {
  const lines: string[] = [];
  lines.push("[Watchdog Maritime 통합 보고서]");
  lines.push(`작성일: ${new Date().toLocaleDateString("ko-KR")}`);
  if (newsKeywords) lines.push(`뉴스 관심 키워드: ${newsKeywords}`);
  if (outlookKeywords) lines.push(`전망 관심 키워드: ${outlookKeywords}`);
  lines.push("");
  lines.push("■ 1. 뉴스 취합 및 정리");
  lines.push(news.length ? newsText(news) : "- 정리된 뉴스가 없어요");
  lines.push("");
  lines.push("■ 2. 산업 전반 향후 전망");
  lines.push(outlook ? outlookText(outlook, news.length) : "- 전망을 만들지 못해 빠져 있어요. 다시 분석한 뒤 보고서를 만들어 주세요.");
  lines.push("");
  lines.push(`※ ${OUTLOOK_DISCLAIMER}`);
  return lines.join("\n");
}

// 카드뉴스 "페이지" 부품 모음 (바다 테마). 이슈 하나가 한 페이지(카드)예요.
// 뉴스 이슈 1건 = 한 페이지, 전망 분야 1개 = 한 페이지, 요약·키워드 분석·추가 자료도 각각 한 페이지입니다.
import type { NewsExtra, NewsItem, OutlookArea, OutlookDirection } from "../lib/schemas";

// 바다 색 이름표 (한 곳에서만 정해 두고 가져다 써요)
export const SEA = {
  deep: "#052a4d", // 깊은 바다
  ocean: "#0a6e9e", // 바다
  aqua: "#14a7c4", // 얕은 바다
  foam: "#e9f7fb", // 물거품
  sand: "#f6ecd6", // 모래
};

// 물결 모양 띠. 카드 머리와 아래쪽 경계에 겹쳐 써요.
export function Waves({ className = "", fill = "#ffffff", opacity = 1 }: { className?: string; fill?: string; opacity?: number }) {
  return (
    <svg className={className} viewBox="0 0 1200 80" preserveAspectRatio="none" aria-hidden style={{ opacity }}>
      <path d="M0 40 C120 5 240 75 360 40 S600 5 720 40 S960 75 1080 40 S1170 20 1200 35 V80 H0 Z" fill={fill} />
    </svg>
  );
}

const DIRECTION: Record<OutlookDirection, { icon: string; label: string; chip: string }> = {
  긍정: { icon: "▲", label: "순풍", chip: "bg-emerald-100 text-emerald-800 ring-emerald-300" },
  중립: { icon: "■", label: "잔잔", chip: "bg-sky-100 text-sky-800 ring-sky-300" },
  부정: { icon: "▼", label: "풍랑", chip: "bg-rose-100 text-rose-800 ring-rose-300" },
};

// 페이지 겉틀: 위쪽은 바다 그라데이션 머리, 아래쪽은 물거품색 본문
function PageShell({
  tag,
  right,
  title,
  children,
  footer,
}: {
  tag: string;
  right?: React.ReactNode;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <li className="flex min-h-[32rem] flex-col overflow-hidden rounded-2xl border border-sky-200 bg-white shadow-md shadow-sky-900/10">
      <div className="relative bg-gradient-to-br from-[#052a4d] via-[#0a6e9e] to-[#14a7c4] px-5 pb-10 pt-4 text-white">
        <div className="flex items-center justify-between gap-2 text-xs font-semibold">
          <span className="rounded-full bg-white/15 px-2.5 py-1 backdrop-blur-sm">{tag}</span>
          {right}
        </div>
        <h3 className="mt-4 text-xl font-extrabold leading-snug [text-wrap:balance]">{title}</h3>
        <Waves className="absolute inset-x-0 -bottom-px h-8 w-full" fill="#e9f7fb" />
      </div>
      <div className="flex flex-1 flex-col bg-[#e9f7fb] px-5 pb-4 pt-2 text-sm text-slate-800">{children}</div>
      {footer && <div className="border-t border-sky-200 bg-white px-5 py-2.5 text-xs text-slate-500">{footer}</div>}
    </li>
  );
}

// 기포 모양 글머리 목록 (핵심 수치·배경)
function Bubbles({ items }: { items: string[] }) {
  if (items.length === 0) return null;
  return (
    <ul className="mt-3 space-y-1.5">
      {items.map((d) => (
        <li key={d} className="flex gap-2 text-[13px] leading-snug text-slate-700">
          <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-gradient-to-br from-[#14a7c4] to-[#0a6e9e]" aria-hidden />
          <span>{d}</span>
        </li>
      ))}
    </ul>
  );
}

function SourceLine({ name, url, date }: { name: string; url: string; date: string }) {
  return (
    <span>
      출처:{" "}
      <a href={url} target="_blank" rel="noopener noreferrer" className="font-medium text-[#0a6e9e] underline hover:text-[#052a4d]">
        {name || "원문 보기"}
      </a>
      {date && ` · ${date}`}
    </span>
  );
}

// 알아둘 점 상자 (모래색)
function TipBox({ label, text }: { label: string; text: string }) {
  if (!text) return null;
  return (
    <p className="mt-auto rounded-xl bg-[#f6ecd6] px-3.5 py-2.5 text-[13px] leading-relaxed text-amber-950">
      <b>{label}</b> · {text}
    </p>
  );
}

// 뉴스 이슈 1건 = 한 페이지
export function NewsPage({ item, no, total }: { item: NewsItem; no: number; total: number }) {
  return (
    <PageShell
      tag={`${item.category} · 이슈 ${no}`}
      right={<span className="text-white/80">{item.date}</span>}
      title={item.headline}
      footer={
        <div className="flex items-center justify-between gap-2">
          <SourceLine name={item.sourceName} url={item.sourceUrl} date="" />
          <span>
            p.{no}/{total}
          </span>
        </div>
      }
    >
      <p className="mt-3 leading-relaxed">{item.summary}</p>
      <Bubbles items={item.details} />
      <div className="mt-4 flex flex-1 flex-col justify-end">
        <TipBox label="💡 알아둘 점" text={item.point} />
      </div>
    </PageShell>
  );
}

// 키워드로 찾은 추가 자료 1건 = 한 페이지
export function ExtraPage({ item, no }: { item: NewsExtra; no: number }) {
  return (
    <PageShell
      tag={`추가 자료 ${no}`}
      right={<span className="text-white/80">{item.date}</span>}
      title={item.headline}
      footer={<SourceLine name={item.sourceName} url={item.sourceUrl} date="" />}
    >
      <p className="mt-3 leading-relaxed">{item.summary}</p>
      <Bubbles items={item.details} />
      <div className="mt-4 flex flex-1 flex-col justify-end">
        <TipBox label="💡 전망에 주는 시사점" text={item.point} />
      </div>
    </PageShell>
  );
}

// 전망 요약·키워드 상세 분석 같은 글 한 덩어리 = 한 페이지
export function TextPage({ tag, title, body, footer }: { tag: string; title: string; body: string; footer?: string }) {
  return (
    <PageShell tag={tag} title={title} footer={footer ? <span>{footer}</span> : undefined}>
      <p className="mt-3 whitespace-pre-wrap leading-relaxed">{body}</p>
    </PageShell>
  );
}

// 전망 분야 1개 = 한 페이지. 근거는 "뉴스 3 · 추가 1" 같은 이름으로 보여요.
export function OutlookPage({ area, basisText }: { area: OutlookArea; basisText: string }) {
  const d = DIRECTION[area.direction];
  return (
    <PageShell
      tag={`향후 전망 · ${area.area}`}
      right={
        <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold ring-1 ring-inset ${d.chip}`}>
          {d.icon} {area.direction} · {d.label}
        </span>
      }
      title={`${area.area}, ${area.direction === "긍정" ? "순풍이 예상돼요" : area.direction === "부정" ? "풍랑에 대비하세요" : "잔잔한 흐름이에요"}`}
      footer={<span>근거: {basisText}</span>}
    >
      {area.forceCheck && <p className="mt-3 text-xs font-semibold text-orange-700">⚠ 근거 자료를 확인하지 못해 &quot;중립&quot;으로 표시했어요</p>}
      <p className="mt-3 leading-relaxed">{area.outlook}</p>
      {area.risks.length > 0 && (
        <div className="mt-3">
          <p className="text-xs font-bold text-[#052a4d]">🌊 위험 요인</p>
          <Bubbles items={area.risks} />
        </div>
      )}
      <div className="mt-4 flex flex-1 flex-col justify-end">
        <TipBox label="🧭 지켜볼 점" text={area.watch} />
      </div>
    </PageShell>
  );
}

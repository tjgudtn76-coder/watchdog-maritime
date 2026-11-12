// "정해진 모양"을 한 곳에 모아 둔 파일입니다. (설계서 2-2)
// 화면과 서버(API)가 같은 모양을 쓰도록 여기서만 정의합니다.
//  - 1부: 화면에서 쓰는 모양과 기준 숫자 (기존 sample-data.ts에서 옮겨 옴)
//  - 2부: AI가 돌려줘야 하는 모양 (zod). 서버가 AI 답을 받자마자 이 모양인지 검사합니다.
import { z } from "zod";

/* ───────────── 1부. 화면에서 쓰는 모양 ───────────── */

export const IMPACT_LEVELS = ["상", "중", "하"] as const;
export type Impact = (typeof IMPACT_LEVELS)[number];

export const VERDICTS = ["충족", "미충족", "확인 필요"] as const;
export type Verdict = (typeof VERDICTS)[number];

// 영향 조항 1건 (must ①) — 화면에 보여 주는 모양
export type ImpactItem = {
  id: string;
  impact: Impact;
  targetClause: string; // 영향받는 조항·업무 (예: 시행령 제12조, 선박운용회사의 이해상충 관리 업무)
  legalBasis: string; // 근거가 된 법 조문
  change: string; // 무엇이 바뀌었는지
  direction: string; // 어떻게 대응할지
  confidence: number; // AI 확신도 (0~100)
  legalQuote?: string; // 근거 원문 발췌 (AI 결과에만 있음)
  forceCheck?: boolean; // 코드 검사에서 "담당자 확인 필요"로 바뀐 경우 (예: 영향도 표기 오류)
};

// 인허가 요건 1건 (must ②) — 화면에 보여 주는 모양
export type LicenseItem = {
  id: string;
  requirement: string;
  standard: string; // 법령 기준
  status: string; // 인수기업 현황
  verdict: Verdict;
  note: string;
  legalBasis?: string; // 근거 법 조문 (AI 결과에만 있음)
  statusQuote?: string; // 현황 원문 발췌 (AI 결과에만 있음)
  forceCheck?: boolean; // 코드 검사에서 근거 확인이 안 된 요건
};

// 기준 숫자·문구
export const CONFIDENCE_THRESHOLD = 70; // 확신도가 이 값 미만이면 "담당자 확인 필요"
export const DISCLAIMER = "본 검토는 참고용이며 최종 판단은 법무 검토를 거쳐야 함";

// 업로드 조건 (기획서 6번)
export const ALLOWED_EXTENSIONS = [".pdf", ".txt"];
export const MAX_FILE_MB = 10;
export const MAX_REG_FILES = 5;
export const MAX_LAW_REF_FILES = 3;

// 글자 수 상한 (설계서 "긴 문서 처리" — 시험하며 조정)
export const MAX_FILE_CHARS = 200_000; // 파일 1개에서 뽑은 글자
export const MAX_TOTAL_CHARS = 600_000; // 한 번 분석에 보내는 글자 합계

/* ───────────── 2부. AI가 돌려줘야 하는 모양 (zod) ─────────────
   영향도·판정은 일부러 "그냥 글자"로 받습니다.
   표기가 틀려도 응답 전체가 실패하지 않게 받은 뒤, 코드 검사(validate)에서 바로잡기 위해서예요.
   (허용값은 IMPACT_LEVELS / VERDICTS) */

// 개정안 칸의 파일이 개정 근거 문서(신·구 조문 대비표 또는 공공기관 혁신 지침)가 맞는지 확인 (PLAN 11)
// "기타"가 나오면 화면이 분석을 멈추고 안내합니다.
export const LAW_DOC_TYPES = ["대비표", "지침", "기타"] as const;
export const LawFileCheckSchema = z.object({
  docType: z.enum(LAW_DOC_TYPES),
  reason: z.string(),
});
export type LawFileCheck = z.infer<typeof LawFileCheckSchema>;

// must ① — 영향 조항 1건. 근거는 칸을 나눠 받습니다.
export const ImpactAiItemSchema = z.object({
  impact: z.string(),
  targetSource: z.string(), // 영향받는 조항이 있는 연관 법령 이름 (참조 법령에서 찾은 경우. 없으면 빈 문자열)
  targetClause: z.string(), // 영향받는 조항·업무 (예: 시행령 제12조)
  legalName: z.string(), // 법령 이름
  legalArticle: z.string(), // 근거 조 번호 (예: 제○조 제○항)
  legalQuote: z.string(), // 근거 원문 발췌
  change: z.string(),
  direction: z.string(),
  confidence: z.number(),
});
export const ImpactAiResultSchema = z.object({
  items: z.array(ImpactAiItemSchema),
});
export type ImpactAiItem = z.infer<typeof ImpactAiItemSchema>;
export type ImpactAiResult = z.infer<typeof ImpactAiResultSchema>;

// must ② — 인허가 요건 1건과 결론
export const LicenseAiItemSchema = z.object({
  requirement: z.string(),
  legalBasis: z.string(), // 근거 법 조문
  standard: z.string(), // 법령 기준 (원문 그대로)
  status: z.string(), // 인수기업 현황
  statusQuote: z.string(), // 현황 원문 발췌
  verdict: z.string(),
  note: z.string(),
});
export const LicenseAiResultSchema = z.object({
  items: z.array(LicenseAiItemSchema),
  conclusion: z.string(), // 승계 가능성 요약 (참고용 문구는 코드가 붙임)
});
export type LicenseAiItem = z.infer<typeof LicenseAiItemSchema>;
export type LicenseAiResult = z.infer<typeof LicenseAiResultSchema>;

// 선박금융 카드뉴스 — 카드 1장. 출처 주소는 웹 검색 결과에 실제로 있던 것만 코드가 남깁니다.
export const MAX_CARDS = 3; // 카드는 3장 이내
export const CardNewsAiCardSchema = z.object({
  headline: z.string(), // 카드 제목 (한 줄)
  summary: z.string(), // 핵심 내용 (2~3문장)
  point: z.string(), // 선박운용회사 법무·재무 담당자가 알아둘 점 (1문장)
  sourceName: z.string(), // 출처 이름 (예: 해양수산부 보도자료)
  sourceUrl: z.string(), // 출처 주소
  date: z.string(), // 기사·발표 날짜 (모르면 빈 문자열)
});
export const CardNewsAiResultSchema = z.object({
  cards: z.array(CardNewsAiCardSchema),
});
export type CardNewsCard = z.infer<typeof CardNewsAiCardSchema>;

// 인허가 검토 — 인터넷 검색 참고자료. 담당자가 입력한 검토 자료를 바탕으로 웹 검색해 찾은 내용이에요.
export const MAX_RESEARCH = 5; // 참고자료는 5건 이내
export const MAX_MATERIAL_CHARS = 5_000; // 검토 자료 입력창 글자 수 상한 (비용 보호)
export const ResearchAiFindingSchema = z.object({
  topic: z.string(), // 무엇에 관한 내용인지 (예: 합병 시 인가 승계 절차)
  finding: z.string(), // 찾은 내용 (2~3문장)
  sourceName: z.string(), // 출처 이름
  sourceUrl: z.string(), // 출처 주소
  date: z.string(), // 날짜 (모르면 빈 문자열)
});
export const ResearchAiResultSchema = z.object({
  summary: z.string(), // 검색 결과 전체 요약 (3문장 안팎)
  findings: z.array(ResearchAiFindingSchema),
});
export type ResearchFinding = z.infer<typeof ResearchAiFindingSchema>;

// ───── Watchdog Maritime: 해운·선박투자·선박운용 뉴스 취합(1항)과 산업 전망(2항) ─────
export const NEWS_CATEGORIES = ["해운시장", "선박투자·금융", "선박운용"] as const;
export type NewsCategory = (typeof NEWS_CATEGORIES)[number];
export const MAX_NEWS_PER_CATEGORY = 3; // 분야마다 3건 이내 (전체 9건 이내)
// 뉴스 1건: 출처 주소는 웹 검색 결과에 실제로 있던 것만 코드가 남깁니다.
export const NewsAiItemSchema = z.object({
  headline: z.string(), // 제목 (한 줄)
  summary: z.string(), // 핵심 내용 (2~3문장)
  point: z.string(), // 선박투자·운용 담당자가 알아둘 점 (1문장)
  details: z.array(z.string()), // 핵심 수치·배경 (2~3개, 짧게)
  sourceName: z.string(), // 출처 이름
  sourceUrl: z.string(), // 출처 주소
  date: z.string(), // 기사 날짜 (모르면 빈 문자열)
});
export const NewsAiResultSchema = z.object({ items: z.array(NewsAiItemSchema) });
export type NewsExtra = z.infer<typeof NewsAiItemSchema>; // 2항 키워드로 추가 검색한 자료
export type NewsItem = NewsExtra & { category: NewsCategory };
export const MAX_KEYWORD_CHARS = 200; // 관심 키워드 입력창 글자 수 상한 (비용 보호)
export const MAX_EXTRAS = 4; // 2항 추가 자료는 4건 이내

// 산업 전망: 분야마다 방향·근거 뉴스 번호·위험·지켜볼 지표
export const OUTLOOK_DIRECTIONS = ["긍정", "중립", "부정"] as const;
export type OutlookDirection = (typeof OUTLOOK_DIRECTIONS)[number];
export const OutlookAiAreaSchema = z.object({
  area: z.string(), // 분야 이름 (NEWS_CATEGORIES 중 하나)
  direction: z.string(), // 긍정/중립/부정 (표기가 틀려도 실패하지 않게 글자로 받고 코드가 바로잡아요)
  outlook: z.string(), // 향후 전망 (2~3문장)
  basis: z.array(z.number()), // 근거로 쓴 뉴스 번호 (1부터)
  risks: z.array(z.string()), // 위험 요인 (3개 이내)
  watch: z.string(), // 앞으로 지켜볼 지표·일정
});
export const OutlookAiResultSchema = z.object({
  summary: z.string(), // 산업 전반 전망 요약 (3~4문장)
  focus: z.string(), // 담당자가 넣은 관심 키워드에 대한 상세 분석 (키워드가 없으면 빈 문자열)
  areas: z.array(OutlookAiAreaSchema),
});
export type OutlookArea = {
  area: NewsCategory;
  direction: OutlookDirection;
  outlook: string;
  basis: number[]; // 코드 검사를 통과한 근거 뉴스 번호
  risks: string[];
  watch: string;
  forceCheck?: boolean; // 근거 뉴스를 확인하지 못해 "중립"으로 바꾼 경우
};
export const OUTLOOK_DISCLAIMER = "본 내용은 공개 뉴스를 바탕으로 AI가 정리한 참고용 자료이며, 투자·계약 등 최종 판단은 담당자의 검토를 거쳐야 함";

/* ───────────── 3부. API가 화면에 돌려주는 모양 ───────────── */

export type ApiError = { ok: false; message: string };
export type CheckLawFileResponse = ({ ok: true } & LawFileCheck) | ApiError;
// 뉴스 취합 결과. droppedCount: 출처·날짜 검사에서 뺀 건수, failedCategories: 검색에 실패한 분야,
// fallbackCategories: 키워드로는 자료가 없어 분야 전반 자료로 채운 분야
export type NewsResponse =
  | { ok: true; items: NewsItem[]; droppedCount: number; failedCategories: NewsCategory[]; fallbackCategories: NewsCategory[] }
  | ApiError;
// 산업 전망 결과. adjustedCount: 근거 뉴스를 확인하지 못해 "중립"으로 바꾼 분야 수
// extras: 키워드로 추가 검색한 자료 (근거 번호는 뉴스 뒤에 이어서 매겨요)
export type OutlookResponse =
  | { ok: true; summary: string; focus: string; areas: OutlookArea[]; extras: NewsExtra[]; adjustedCount: number }
  | ApiError;
// 인허가 검토 인터넷 검색 결과. droppedCount: 출처를 확인하지 못해 뺀 건수
export type LicenseResearchResponse = { ok: true; summary: string; findings: ResearchFinding[]; droppedCount: number } | ApiError;
// droppedCount: 출처를 확인하지 못해 뺀 카드 수
export type CardNewsResponse = { ok: true; cards: CardNewsCard[]; droppedCount: number } | ApiError;
// droppedCount: 근거를 확인하지 못해 코드 검사에서 뺀 AI 항목 수 (화면에서 담당자에게 알려 줘요)
export type AnalyzeImpactResponse = { ok: true; items: ImpactItem[]; droppedCount: number } | ApiError;
// adjustedCount: 코드 검사에서 판정을 "확인 필요"로 바꾼 요건 수. conclusion 끝에는 참고용 문구가 이미 붙어 있어요.
export type ReviewLicenseResponse = { ok: true; items: LicenseItem[]; conclusion: string; adjustedCount: number } | ApiError;

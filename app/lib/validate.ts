// AI가 돌려준 결과를 코드로 한 번 더 검사하는 도구입니다. (설계서 2-2, PLAN 13번)
// AI가 규칙을 어겨도 화면에는 규칙에 맞는 결과만 가도록 걸러냅니다.
//  - 근거가 없거나 올린 문서에서 확인되지 않는 항목은 뺍니다. (근거 표시율 100%)
//  - 표기만 틀린 것(영향도 등)은 버리지 않고 "담당자 확인 필요"로 바꿉니다.
import {
  DISCLAIMER,
  IMPACT_LEVELS,
  VERDICTS,
  type Impact,
  type ImpactAiItem,
  type ImpactItem,
  type LicenseAiItem,
  type LicenseItem,
  type Verdict,
} from "./schemas";

/* ───────────── 느슨한 글자 비교 ───────────── */
// 띄어쓰기·줄바꿈은 무시하고, 가운뎃점 모양 차이(ㆍ · •)는 같은 것으로 봅니다.
export const norm = (s: string) => s.normalize("NFC").replace(/[\s​﻿]/g, "").replace(/[ㆍ·•]/g, "ㆍ");

// "제55조", "제542조의7" 같은 조 번호를 뽑습니다. (항·호 번호는 비교하지 않아요)
function articleNumbers(s: string): string[] {
  return [...norm(s).matchAll(/제(\d+)조(?:의(\d+))?/g)].map((m) => `제${m[1]}조${m[2] ? "의" + m[2] : ""}`);
}

const MIN_QUOTE_CHARS = 20; // 원문 발췌가 이보다 짧으면 근거가 약하다고 보고 "담당자 확인 필요"
const CASE_LAW_WORDS = /판례|대법원|헌법재판소|선고|판결|해석례/;

export type ValidateContext = {
  lawText: string; // 개정안 글자
  refs: { name: string; text: string }[]; // 참조 법령 (이름 + 글자)
};

export type ValidateResult = {
  items: ImpactItem[];
  droppedCount: number; // 근거를 확인하지 못해 뺀 항목 수 (화면에서 알려 줘요)
  dropped: { index: number; reason: string }[];
};

// must ① 영향 분석 결과 검사
export function validateImpact(raw: ImpactAiItem[], ctx: ValidateContext): ValidateResult {
  const lawNorm = norm(ctx.lawText);
  const refsNorm = ctx.refs.map((r) => ({ name: r.name, nameNorm: norm(r.name), textNorm: norm(r.text) }));
  const everything = lawNorm + refsNorm.map((r) => r.textNorm).join("");

  const items: ImpactItem[] = [];
  const dropped: { index: number; reason: string }[] = [];

  raw.forEach((a, index) => {
    const drop = (reason: string) => dropped.push({ index, reason });
    const legalName = a.legalName.trim();
    const legalArticle = a.legalArticle.trim();
    const quote = a.legalQuote.trim();
    const change = a.change.trim();
    const direction = a.direction.trim();
    const targetClause = a.targetClause.trim();
    let targetSource = a.targetSource.trim();
    let forceCheck = false;

    // 1) 근거 칸이 비어 있으면 뺍니다.
    if (!legalName || !legalArticle) return drop("근거 법 조문이 비어 있음");
    if (!quote) return drop("원문 발췌가 비어 있음");
    if (!change || !direction) return drop("바뀐 내용 또는 개정 방향이 비어 있음");
    if (!targetClause) return drop("영향받는 조항·업무가 비어 있음");

    // 2) 근거 조 번호가 개정안 글자에 있어야 합니다. (조 번호를 지어낸 경우 걸러냄)
    const nums = articleNumbers(legalArticle);
    if (nums.length === 0) forceCheck = true; // 조 번호를 읽지 못하면(예: 별표) 버리지 않고 확인 요청
    else if (!nums.every((n) => lawNorm.includes(norm(n)))) return drop(`근거 조문 ${nums.join(", ")}이(가) 개정안에 없음`);

    // 3) 원문 발췌가 개정안 글자에 그대로 들어 있어야 합니다.
    //    (현행·개정 두 칸을 이어 붙였거나 "…"로 생략한 발췌는 조각마다 확인해요)
    const segments = quote.split(/\n+|…|\.\.\./).map(norm).filter((s) => s.length >= 6);
    if (segments.length === 0 || !segments.every((s) => lawNorm.includes(s))) return drop("원문 발췌가 개정안 글자에서 확인되지 않음");
    if (norm(quote).length < MIN_QUOTE_CHARS) forceCheck = true; // 발췌가 너무 짧음

    // 4) 판례·해석례 같은 말이 있는데 올린 문서에 없으면 지어낸 것으로 보고 뺍니다.
    for (const text of [change, direction, quote, targetClause]) {
      const m = text.match(CASE_LAW_WORDS);
      if (m && !everything.includes(norm(m[0]))) return drop(`올린 문서에 없는 "${m[0]}" 언급`);
    }

    // 5) 영향받는 조항이 연관 법령에 있다고 했으면, 정말 그 법령에 있는지 확인합니다.
    if (targetSource) {
      const ref = refsNorm.find((r) => r.nameNorm === norm(targetSource) || r.nameNorm.includes(norm(targetSource)) || norm(targetSource).includes(r.nameNorm));
      const tNums = articleNumbers(targetClause);
      if (!ref) {
        targetSource = ""; // 올린 법령에 없는 이름 → 연관 법령 표시를 지우고 업무 설명으로 취급
        forceCheck = true;
      } else if (tNums.length > 0 && !tNums.every((n) => ref.textNorm.includes(norm(n)))) {
        targetSource = ""; // 그 법령에 없는 조 번호 → 연관 법령 표시를 지우고 확인 요청
        forceCheck = true;
      } else {
        targetSource = ref.name; // 법령 이름을 올린 파일의 이름으로 통일
      }
    }

    // 6) 영향도가 상·중·하가 아니면 버리지 않고 "중 + 담당자 확인 필요"
    let impact = a.impact.trim() as Impact;
    if (!(IMPACT_LEVELS as readonly string[]).includes(impact)) {
      impact = "중";
      forceCheck = true;
    }

    // 확신도는 AI가 스스로 매긴 점수 그대로 두고 0~100으로만 맞춥니다.
    // (70% 미만 표시는 화면이 점수를 보고 붙여요. forceCheck는 코드 검사에서 따로 걸린 경우만 뜻합니다.)
    const confidence = Math.max(0, Math.min(100, Math.round(a.confidence)));

    items.push({
      id: `ai-${items.length + 1}`,
      impact,
      targetClause: [targetSource, targetClause].filter(Boolean).join(" "),
      legalBasis: `${legalName} ${legalArticle}`,
      change,
      direction,
      confidence,
      legalQuote: quote,
      forceCheck: forceCheck || undefined,
    });
  });

  return { items, droppedCount: dropped.length, dropped };
}

/* ───────────────────────── must ② 인허가 판정 결과 검사 (PLAN 16번) ───────────────────────── */

// 숫자 + 단위 토큰 ("70억원", "5명", "60%", "100분의 10"의 숫자 등)
const NUM_RE = /(\d[\d,]*(?:\.\d+)?)\s*(억|만|천)?\s*(원|명|%|퍼센트|년|개월|일|개|제곱미터|㎡)?/g;
const MULT: Record<string, number> = { 억: 1e8, 만: 1e4, 천: 1e3 };
const UNIT: Record<string, string> = { 퍼센트: "%", 제곱미터: "㎡" };

// "제31조제2항제2호" 같은 조·항·호 번호의 숫자는 요건의 숫자가 아니라서 먼저 지웁니다.
const stripArticleRefs = (s: string) => s.replace(/제\s*\d+\s*(?:조|항|호|목|장|절)(?:\s*의\s*\d+)?/g, " ");

// 원문에 적힌 그대로의 숫자 토큰 (법령 기준 비교용 — 단위를 바꾼 표기는 다른 것으로 봅니다)
function literalNumberTokens(s: string): string[] {
  return [...stripArticleRefs(s).matchAll(NUM_RE)].map((m) => norm(m[0]));
}

// 쉼표·단위를 맞춘 숫자 (현황 비교용: "50억 원" = "5,000,000,000원")
function numberKeys(s: string): { unit: string; value: number }[] {
  return [...stripArticleRefs(s).matchAll(NUM_RE)].map((m) => ({
    unit: UNIT[m[3] ?? ""] ?? m[3] ?? "",
    value: parseFloat(m[1].replace(/,/g, "")) * (MULT[m[2] ?? ""] ?? 1),
  }));
}

export type LicenseValidateContext = {
  companyText: string; // 인수기업 현황 글자
  refs: { name: string; text: string }[]; // 관련 법령 (법령 이름 + 글자)
};

export type LicenseValidateResult = {
  items: LicenseItem[];
  conclusion: string; // 건수·참고용 문구는 코드가 붙인 결론
  adjustedCount: number; // 코드 검사에서 판정을 "확인 필요"로 바꾼 요건 수
};

// must ② 인허가 판정 결과 검사
export function validateLicense(raw: LicenseAiItem[], aiConclusion: string, ctx: LicenseValidateContext): LicenseValidateResult {
  const companyNorm = norm(ctx.companyText);
  const refs = ctx.refs
    .map((r) => ({ name: r.name, nameNorm: norm(r.name), textNorm: norm(r.text), raw: r.text, hasHeadings: /(?:^|\n)\s*제\d+조/.test(r.text) }))
    .sort((a, b) => b.nameNorm.length - a.nameNorm.length); // 이름이 긴 법령부터 찾아요 ("…시행령"이 "…법"보다 먼저)
  const allRefsNorm = refs.map((r) => r.textNorm).join("");
  // 조문 번호는 본문 아무 데서나가 아니라 "조문 머리글"(줄 처음의 "제31조(…)")에서 찾습니다.
  // (시행령 본문의 "법 제31조에 따른…" 같은 참조 문구를 그 조문이 있는 것으로 착각하지 않도록)
  // 머리글 줄이 없는 글(PDF에서 줄이 합쳐진 경우)은 글 전체에서 찾아요.
  const hasArticle = (r: (typeof refs)[number], num: string) =>
    r.hasHeadings ? new RegExp(String.raw`(?:^|\n)\s*${num}(?=[\s(])`).test(r.raw) : r.textNorm.includes(norm(num));
  const companyKeys = numberKeys(ctx.companyText);

  const items: LicenseItem[] = [];
  let adjustedCount = 0;

  for (const a of raw) {
    const requirement = a.requirement.trim();
    if (!requirement) continue; // 요건 이름이 없으면 뺍니다.

    const legalBasis = a.legalBasis.trim();
    const standard = a.standard.trim();
    const status = a.status.trim();
    const statusQuote = a.statusQuote.trim();
    const problems: string[] = [];

    // 1) 근거 조문이 올린 법령에 정말 있는지 (조 번호 확인)
    const segments = legalBasis.split(/,\s*|，|;\s*/).filter(Boolean);
    let basisChecked = 0;
    let basisOk = true;
    for (const seg of segments) {
      const nums = articleNumbers(seg);
      if (nums.length === 0) continue;
      const segNorm = norm(seg);
      const ref = refs.find((r) => segNorm.includes(r.nameNorm));
      for (const n of nums) {
        basisChecked++;
        const found = ref ? hasArticle(ref, n) : refs.some((r) => hasArticle(r, n));
        if (!found) basisOk = false;
      }
    }
    if (basisChecked === 0 || !basisOk) problems.push("근거 법 조문을 올린 법령에서 확인하지 못했어요.");

    // 2) 법령 기준은 원문과 글자 그대로여야 합니다. (숫자를 바꿔 쓰면 안 돼요)
    const badNumber = literalNumberTokens(standard).some((tok) => !allRefsNorm.includes(tok));
    if (badNumber) problems.push("법령 기준의 숫자가 법령 원문과 달라요.");
    else {
      const parts = standard.split(/\s\/\s|\n+|…|\.\.\./).map(norm).filter((s) => s.length >= 10);
      if (parts.length > 0 && !parts.some((p) => allRefsNorm.includes(p))) problems.push("법령 기준 인용을 법령 원문에서 확인하지 못했어요.");
    }

    // 3) 현황 숫자는 현황 자료에 있어야 합니다. (쉼표·단위는 맞춰서 비교)
    const hasKey = (k: { unit: string; value: number }) =>
      companyKeys.some((c) => c.value === k.value && (k.unit === "" || c.unit === "" || c.unit === k.unit));
    if (!numberKeys(status).every(hasKey)) problems.push("현황의 숫자를 인수기업 현황 자료에서 확인하지 못했어요.");

    // 4) 현황 원문 발췌가 현황 자료에 그대로 있어야 합니다.
    if (statusQuote) {
      const qs = statusQuote.split(/\n+|…|\.\.\./).map(norm).filter((s) => s.length >= 4);
      if (qs.length === 0 || !qs.every((s) => companyNorm.includes(s))) problems.push("현황 원문 발췌를 인수기업 현황 자료에서 확인하지 못했어요.");
    }

    // 5) 판정: 정해진 세 가지만. 근거가 부족하면 "충족/미충족"으로 두지 않습니다.
    const v = a.verdict.trim();
    let verdict: Verdict = (VERDICTS as readonly string[]).includes(v) ? (v as Verdict) : "확인 필요";
    if (verdict !== "확인 필요" && !statusQuote) problems.push("현황 자료에 근거가 없어 충족·미충족을 판정할 수 없어요.");
    const changed = verdict !== "확인 필요" && problems.length > 0;
    if (changed || !(VERDICTS as readonly string[]).includes(v)) verdict = "확인 필요";
    if (changed) adjustedCount++;

    const note = [changed ? `[코드 검사] 판정을 "확인 필요"로 바꿨어요. ${problems.join(" ")}` : "", a.note.trim()].filter(Boolean).join(" ");
    items.push({
      id: `l-${items.length + 1}`,
      requirement,
      standard,
      status,
      verdict,
      note,
      legalBasis,
      statusQuote,
      forceCheck: problems.length > 0 || undefined,
    });
  }

  // 결론: AI가 센 건수는 틀릴 수 있어서 빼고, 코드가 센 건수를 앞에 붙입니다. 끝에는 참고용 문구를 항상 붙여요.
  const count = (x: Verdict) => items.filter((i) => i.verdict === x).length;
  const summary = `검토 결과: 충족 ${count("충족")}건 · 미충족 ${count("미충족")}건 · 확인 필요 ${count("확인 필요")}건 (총 ${items.length}건)입니다.`;
  const adjusted = adjustedCount > 0 ? `코드 검사에서 근거를 확인하지 못해 판정을 "확인 필요"로 바꾼 요건이 ${adjustedCount}건 있어요.` : "";
  const rest = aiConclusion
    .trim()
    .split(/(?<=\.)\s+/)
    .filter((s) => s && !/(충족|미충족|확인\s*필요)\s*\d+\s*건|총\s*\d+\s*건|참고용이며/.test(s))
    .join(" ");
  const conclusion = `${[summary, adjusted, rest].filter(Boolean).join(" ")}\n\n※ ${DISCLAIMER}`;

  return { items, conclusion, adjustedCount };
}

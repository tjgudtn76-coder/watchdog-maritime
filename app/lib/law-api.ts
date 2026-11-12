import "server-only";

// 법제처 "국가법령정보 공동활용" OPEN API 연결 도구입니다. 서버 쪽에서만 쓰입니다.
// 인증값(OC)은 .env 파일의 LAW_API_OC 에서 읽습니다. (화면 쪽 코드에는 절대 넣지 않아요)
// 안내서: https://open.law.go.kr/LSO/openApi/guideList.do
//
// ※ 이 API는 인증값뿐 아니라, 호출하는 컴퓨터의 IP 주소·도메인을 법제처에 등록해야 응답해 줍니다.
//   (등록 전에는 "사용자 정보 검증에 실패하였습니다"라고 답해요)

const BASE = "https://www.law.go.kr/DRF";

export type LawTarget = "law" | "oldAndNew"; // 현행법령 | 신구법(신·구 조문 대비)

export function getLawOc() {
  return process.env.LAW_API_OC?.trim() || "";
}
export function hasLawOc() {
  return !!getLawOc();
}

// 이 서비스에 쓸 만한 데이터 (PRD·요청 기준으로 고름)
//  - 인허가 검토(must ②)의 "관련 법령·시행령 원문" 칸 (파일 최대 3개 = 3묶음):
//      ① 선박투자회사법 + 시행령 + 시행규칙  (선박운용업 인허가·선박운용회사 요건)
//      ② 상법 발췌  (회사 합병·분할, 이사·이사회·대표이사, 감사, 회계 — 통폐합 후 조직 수립)
//      ③ 회계 관련  (외부감사법, 법인세법의 합병·분할 과세)
//  - 영향 분석(must ①)의 "개정안" 칸: 선박투자회사법 신·구 조문 대비 (가장 최근 개정분)
// ranges: [시작 조, 끝 조] — 지정하면 그 조문만 가져옵니다. (가지 조문 "제382조의2"는 제382조에 포함)
export type LawPart = { name: string; ranges?: [number, number][] };
export type LawPreset = { id: string; label: string; target: LawTarget; useFor: string; parts: LawPart[] };

export const PRESETS: LawPreset[] = [
  {
    id: "ship",
    label: "선박투자회사법·시행령·시행규칙",
    target: "law",
    useFor: "관련 법령·시행령 원문",
    parts: [{ name: "선박투자회사법" }, { name: "선박투자회사법 시행령" }, { name: "선박투자회사법 시행규칙" }],
  },
  {
    id: "commercial",
    label: "상법 발췌(합병·조직·회계)",
    target: "law",
    useFor: "관련 법령·시행령 원문",
    parts: [
      {
        name: "상법",
        ranges: [
          [174, 174], // 회사의 합병(총칙)
          [289, 289], // 정관의 작성
          [382, 393], // 이사의 선임·의무, 대표이사, 이사회
          [397, 401], // 경업금지, 자기거래, 이사의 책임
          [409, 415], // 감사, 감사위원회
          [446, 450], // 회계의 원칙, 재무제표, 감사보고서
          [522, 530], // 주식회사 합병·분할·분할합병
        ],
      },
    ],
  },
  {
    id: "accounting",
    label: "회계 관련 법령 발췌(외부감사법·법인세법)",
    target: "law",
    useFor: "관련 법령·시행령 원문",
    parts: [
      {
        name: "주식회사 등의 외부감사에 관한 법률",
        ranges: [
          [1, 8], // 목적·정의·감사 대상·회계처리기준·재무제표·내부회계관리제도
          [10, 10], // 감사인의 선임
          [18, 18], // 감사보고서의 작성
          [23, 23], // 감사보고서의 제출
        ],
      },
      {
        name: "법인세법",
        ranges: [
          [44, 47], // 합병·분할 시 과세
        ],
      },
    ],
  },
  { id: "oldnew", label: "선박투자회사법 신·구 조문 대비", target: "oldAndNew", useFor: "법령 개정안 (신·구 조문 대비표)", parts: [{ name: "선박투자회사법" }] },
];

export class LawApiError extends Error {}

/* ───────────── 호출 ───────────── */

async function callLaw(kind: "lawSearch" | "lawService", params: Record<string, string>): Promise<unknown> {
  const oc = getLawOc();
  if (!oc) throw new LawApiError(".env 파일에 LAW_API_OC가 없어요. 법제처에서 받은 인증값을 넣은 뒤 앱을 다시 켜 주세요.");

  const url = new URL(`${BASE}/${kind}.do`);
  url.searchParams.set("OC", oc);
  url.searchParams.set("type", "JSON");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  let text: string;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(20_000), cache: "no-store" });
    text = await res.text();
  } catch {
    throw new LawApiError("법제처 서버에 연결하지 못했어요. 인터넷 연결을 확인하고 다시 시도해 주세요.");
  }

  let json: unknown;
  try {
    json = JSON.parse(text.replace(/^﻿/, ""));
  } catch {
    throw new LawApiError("법제처가 예상과 다른 형식으로 답했어요. 잠시 뒤 다시 시도해 주세요.");
  }

  // 인증 실패 안내 ({ result: "...", msg: "..." } 모양)
  if (json && typeof json === "object" && "result" in json && "msg" in json && Object.keys(json).length <= 3) {
    const r = json as { result: string; msg: string };
    if (/검증|인증|등록/.test(r.result + r.msg)) {
      throw new LawApiError(
        "법제처가 사용자 확인에 실패했어요. ① .env의 LAW_API_OC 값이 맞는지, ② 법제처 OPEN API 신청 화면에서 이 컴퓨터의 IP 주소(배포하면 도메인)를 등록했는지 확인해 주세요.",
      );
    }
    throw new LawApiError(`법제처 안내: ${r.result}`);
  }
  return json;
}

/* ───────────── 응답 읽기 (응답 모양이 조금 달라도 견디도록 느슨하게) ───────────── */

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === "object" && !Array.isArray(v);
const asArray = (v: unknown): unknown[] => (Array.isArray(v) ? v : v === undefined || v === null ? [] : [v]);
const str = (v: unknown) => (typeof v === "string" ? v : typeof v === "number" ? String(v) : "");

// 응답 어디에 있든, 지정한 이름의 칸을 가진 항목들의 목록을 찾아요.
function findRecords(node: unknown, key: string): Obj[] {
  if (Array.isArray(node)) {
    const hit = node.filter(isObj).filter((o) => key in o);
    if (hit.length > 0) return hit;
    for (const n of node) {
      const r = findRecords(n, key);
      if (r.length) return r;
    }
  } else if (isObj(node)) {
    if (key in node) return [node];
    for (const v of Object.values(node)) {
      const r = findRecords(v, key);
      if (r.length) return r;
    }
  }
  return [];
}

function clean(s: string) {
  return s
    .replace(/<!\[CDATA\[|\]\]>/g, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}

export type LawListItem = {
  mst: string; // 본문 조회에 쓰는 일련번호
  name: string;
  promulgated: string; // 공포일자
  effective: string; // 시행일자
  kind: string; // 법령 구분 (법률, 대통령령 등)
  revision: string; // 제개정 구분
};

export async function searchLaws(target: LawTarget, query: string, page = 1): Promise<LawListItem[]> {
  const isLaw = target === "law";
  const json = await callLaw("lawSearch", {
    target,
    query,
    display: "100",
    page: String(page),
    ...(isLaw ? {} : { sort: "ddes" }), // 신구법은 공포일자 최신순
  });
  const records = findRecords(json, isLaw ? "법령명한글" : "신구법명");
  return records.map((r) => ({
    mst: str(isLaw ? r["법령일련번호"] : r["신구법일련번호"]),
    name: clean(str(isLaw ? r["법령명한글"] : r["신구법명"])),
    promulgated: str(r["공포일자"]),
    effective: str(r["시행일자"]),
    kind: str(r["법령구분명"]),
    revision: str(r["제개정구분명"]),
  }));
}

// 현행법령 본문 → 글자 (조·항·호·목 순서대로)
function lawBodyToText(json: unknown, ranges?: [number, number][]): string {
  const lines: string[] = [];
  const joUnits = findRecords(json, "조문내용");
  for (const jo of joUnits) {
    if (ranges) {
      // 조문을 골라 담는 경우: 장·절 제목은 빼고, 지정한 범위의 조문만 담아요
      if (jo["조문여부"] === "전문") continue;
      const n = parseInt(str(jo["조문번호"]), 10);
      if (!ranges.some(([a, b]) => n >= a && n <= b)) continue;
    }
    const no = str(jo["조문번호"]);
    const branch = str(jo["조문가지번호"]);
    const title = str(jo["조문제목"]);
    const head = clean(str(jo["조문내용"]));
    if (jo["조문여부"] === "전문") {
      if (head) lines.push(head); // 장·절 제목 등
      continue;
    }
    // 조문내용에 "제2조(정의)..." 처럼 번호가 이미 들어 있으면 그대로, 아니면 번호를 붙임
    const label = no ? `제${no}조${branch ? "의" + branch : ""}${title ? `(${clean(title)})` : ""}` : "";
    lines.push(head.startsWith("제") || !label ? head : `${label} ${head}`);
    for (const hang of asArray(jo["항"]).filter(isObj)) {
      if (str(hang["항내용"])) lines.push(clean(str(hang["항내용"])));
      for (const ho of asArray(hang["호"]).filter(isObj)) {
        if (str(ho["호내용"])) lines.push("  " + clean(str(ho["호내용"])));
        for (const mok of asArray(ho["목"]).filter(isObj)) {
          if (str(mok["목내용"])) lines.push("    " + clean(str(mok["목내용"])));
        }
      }
    }
  }
  return lines.filter(Boolean).join("\n");
}

// 안쪽의 글자 조각을 순서대로 모두 모읍니다.
function collectStrings(node: unknown, out: string[] = []): string[] {
  if (typeof node === "string") {
    const c = clean(node);
    if (c) out.push(c);
  } else if (Array.isArray(node)) node.forEach((n) => collectStrings(n, out));
  else if (isObj(node)) Object.values(node).forEach((n) => collectStrings(n, out));
  return out;
}

// 신구법 본문 → 우리 화면의 대비표와 같은 모양의 글자
function oldNewToText(json: unknown): string {
  const find = (key: string): unknown => {
    const stack: unknown[] = [json];
    while (stack.length) {
      const n = stack.pop();
      if (isObj(n)) {
        if (key in n) return n[key];
        stack.push(...Object.values(n));
      } else if (Array.isArray(n)) stack.push(...n);
    }
    return undefined;
  };
  // 숫자만 있는 줄(쪽 번호 같은 것)은 빼요
  const lines = (key: string) => collectStrings(find(key)).filter((s) => !/^\d+$/.test(s));
  const oldPart = lines("구조문목록").join("\n");
  const newPart = lines("신조문목록").join("\n");
  if (!oldPart && !newPart) return "";
  return `[왼쪽 칸 · 현행(구)]\n${oldPart}\n[오른쪽 칸 · 개정(신)]\n${newPart}`;
}

export async function fetchLawText(target: LawTarget, mst: string, ranges?: [number, number][]): Promise<string> {
  const json = await callLaw("lawService", { target, MST: mst });
  if (target === "oldAndNew") {
    const text = oldNewToText(json);
    if (!text) throw new LawApiError("이 법령에는 신·구 조문 대비 자료가 없어요.");
    return text;
  }
  // 조문을 골라 담는 경우에는 못 읽으면 통째로 긁어 오지 않고 실패로 알려요 (엉뚱한 글자가 섞이지 않게)
  const text = ranges ? lawBodyToText(json, ranges) : lawBodyToText(json) || collectStrings(json).join("\n");
  if (!text) throw new LawApiError("법령 본문을 읽지 못했어요.");
  return text;
}

/* ───────────── 미리 정한 데이터 한꺼번에 가져오기 ───────────── */

export type PresetResult =
  | { id: string; label: string; useFor: string; ok: true; name: string; mst: string; promulgated: string; effective: string; chars: number; text: string }
  | { id: string; label: string; useFor: string; ok: false; message: string };

// 이름이 정확히 같은 법령을 찾습니다. (현행법령은 이름에 포함된 다른 법령이 많아 여러 쪽을 넘겨 봐요)
async function findByName(target: LawTarget, name: string): Promise<LawListItem | undefined> {
  const maxPages = target === "law" ? 15 : 1;
  let first: LawListItem[] = [];
  for (let page = 1; page <= maxPages; page++) {
    const list = await searchLaws(target, name, page);
    if (page === 1) first = list;
    if (list.length === 0) break;
    const exact = list.find((l) => l.name === name);
    if (exact) return exact;
  }
  return first.find((l) => l.name.startsWith(name)); // 신구법은 이름 뒤에 날짜 등이 붙을 수 있어요
}

const dash = (d: string) => (d.length === 8 ? `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6)}` : d);

export async function fetchPreset(p: LawPreset): Promise<PresetResult> {
  const base = { id: p.id, label: p.label, useFor: p.useFor };
  try {
    const blocks: string[] = [];
    const msts: string[] = [];
    let promulgated = "";
    let effective = "";
    for (const part of p.parts) {
      const hit = await findByName(p.target, part.name);
      if (!hit || !hit.mst) return { ...base, ok: false, message: `"${part.name}"을(를) 법제처에서 찾지 못했어요.` };
      let text: string;
      try {
        text = await fetchLawText(p.target, hit.mst, part.ranges);
      } catch (e) {
        const why = e instanceof LawApiError ? e.message : "알 수 없는 오류";
        return { ...base, ok: false, message: `"${part.name}": ${why}` };
      }
      if (!text) return { ...base, ok: false, message: `"${part.name}"에서 해당 조문을 찾지 못했어요.` };
      msts.push(hit.mst);
      if (hit.effective > effective) effective = hit.effective;
      if (hit.promulgated > promulgated) promulgated = hit.promulgated;
      // 어느 법령의 글자인지, 발췌인지 분명히 적어 둡니다 (없는 조문을 "없다"고 단정하지 않도록)
      const head =
        p.target === "oldAndNew"
          ? `【${hit.name}】 신·구 조문 대비 (공포 ${dash(hit.promulgated)})`
          : `【${hit.name}】 (시행 ${dash(hit.effective)})${part.ranges ? " ※ 아래 조문만 발췌한 것입니다." : ""}`;
      blocks.push(`${head}\n${text}`);
    }
    const text = blocks.join("\n\n");
    return {
      ...base,
      ok: true,
      name: p.label,
      mst: msts.join(","),
      promulgated,
      effective,
      chars: text.replace(/\s/g, "").length,
      text,
    };
  } catch (e) {
    return { ...base, ok: false, message: e instanceof LawApiError ? e.message : "알 수 없는 오류로 가져오지 못했어요." };
  }
}

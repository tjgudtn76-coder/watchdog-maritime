// 올린 파일(PDF·텍스트)에서 글자를 뽑아내는 도구입니다. (설계서 2-4, PLAN 7번)
// 브라우저 안에서만 동작합니다 — 파일 원본은 서버로 보내지 않고, 뽑은 글자만 씁니다.
import { MAX_FILE_CHARS } from "./schemas";

export type ExtractResult =
  | {
      ok: true;
      text: string; // 뽑아낸 글자 전체
      pages: number | null; // PDF 쪽수 (텍스트 파일이면 null)
      chars: number; // 공백을 뺀 글자 수
      preview: string; // 앞부분 미리보기 (화면에서 눈으로 확인용)
      twoColumn: boolean; // 신·구 조문 대비표처럼 두 칸으로 보여 나눠 읽었는지
    }
  | { ok: false; message: string };

const SCAN_MIN_CHARS_PER_PAGE = 30; // 쪽당 이보다 적으면 스캔 PDF로 판단
const HANGUL_MIN_RATIO = 0.1; // 한글 비율이 이보다 낮으면 글자가 깨진 것으로 판단
const PREVIEW_LENGTH = 200;

const SCAN_MESSAGE = "글자를 읽을 수 없는 PDF예요. 스캔한 파일이 아닌, 글자를 선택할 수 있는 PDF로 올려 주세요.";

function countNonSpace(text: string) {
  return text.replace(/\s/g, "").length;
}

function hangulRatio(text: string) {
  const all = countNonSpace(text);
  if (all === 0) return 0;
  return (text.match(/[가-힣]/g)?.length ?? 0) / all;
}

function finish(text: string, pages: number | null, twoColumn: boolean): ExtractResult {
  const clean = text.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  const chars = countNonSpace(clean);
  if (chars > MAX_FILE_CHARS) {
    return {
      ok: false,
      message: `파일이 너무 길어요. (글자 ${chars.toLocaleString()}자 · 한 파일은 ${MAX_FILE_CHARS.toLocaleString()}자까지) 필요한 부분만 나눠서 올려 주세요.`,
    };
  }
  return { ok: true, text: clean, pages, chars, preview: clean.slice(0, PREVIEW_LENGTH), twoColumn };
}

/* ───────────── 텍스트 파일 ───────────── */

async function extractFromTxt(file: File): Promise<ExtractResult> {
  const bytes = await file.arrayBuffer();
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes); // 먼저 UTF-8로 시도
  } catch {
    text = new TextDecoder("euc-kr").decode(bytes); // 윈도우에서 만든 한글 텍스트(EUC-KR)
  }
  text = text.replace(/^﻿/, "");
  if (countNonSpace(text) === 0) return { ok: false, message: "텍스트 파일에 글자가 없어요." };
  return finish(text, null, false);
}

/* ───────────── PDF ───────────── */

type Piece = { x: number; end: number; y: number; h: number; str: string };

// 같은 높이에 있는 조각들을 한 줄로 묶습니다.
function groupLines(pieces: Piece[]): Piece[][] {
  const sorted = [...pieces].sort((a, b) => b.y - a.y || a.x - b.x);
  const lines: Piece[][] = [];
  for (const p of sorted) {
    const last = lines[lines.length - 1];
    const tol = Math.max(2, (last?.[0].h ?? p.h) * 0.4);
    if (last && Math.abs(last[0].y - p.y) <= tol) last.push(p);
    else lines.push([p]);
  }
  for (const l of lines) l.sort((a, b) => a.x - b.x);
  return lines;
}

// 한 줄의 조각들을 글자로 이어 붙입니다. (간격이 벌어지면 띄어쓰기)
function joinLine(line: Piece[]): string {
  let out = "";
  let prevEnd: number | null = null;
  for (const p of line) {
    if (prevEnd !== null && p.x - prevEnd > p.h * 0.25 && !out.endsWith(" ")) out += " ";
    out += p.str;
    prevEnd = p.end;
  }
  return out.trim();
}

// 신·구 조문 대비표처럼 한 쪽이 좌·우 두 칸이면 칸별로 나눠서 읽습니다.
function pageToText(pieces: Piece[], pageWidth: number): { text: string; twoColumn: boolean } {
  const lines = groupLines(pieces);
  if (lines.length === 0) return { text: "", twoColumn: false };

  const mid = pageWidth / 2;
  const gap = pageWidth * 0.03;
  const split = lines.map((line) => {
    const left = line.filter((p) => p.x < mid);
    const right = line.filter((p) => p.x >= mid);
    const both =
      left.length > 0 && right.length > 0 && right[0].x - left[left.length - 1].end > gap;
    return { line, left, right, both };
  });
  const bothCount = split.filter((s) => s.both).length;
  const twoColumn = lines.length >= 3 && bothCount / lines.length >= 0.3;
  if (!twoColumn) return { text: lines.map(joinLine).join("\n"), twoColumn: false };

  const out: string[] = [];
  let leftBuf: string[] = [];
  let rightBuf: string[] = [];
  const flush = () => {
    if (leftBuf.length) out.push("[왼쪽 칸 · 현행(구)]\n" + leftBuf.join("\n"));
    if (rightBuf.length) out.push("[오른쪽 칸 · 개정(신)]\n" + rightBuf.join("\n"));
    leftBuf = [];
    rightBuf = [];
  };
  for (const s of split) {
    if (s.both) {
      leftBuf.push(joinLine(s.left));
      rightBuf.push(joinLine(s.right));
    } else if (s.left.length > 0 && s.right.length === 0 && s.left[s.left.length - 1].end <= mid) {
      leftBuf.push(joinLine(s.left)); // 왼쪽 칸에만 있는 줄
    } else if (s.right.length > 0 && s.left.length === 0) {
      rightBuf.push(joinLine(s.right)); // 오른쪽 칸에만 있는 줄
    } else {
      flush(); // 폭 전체를 쓰는 줄(제목 등)
      out.push(joinLine(s.line));
    }
  }
  flush();
  return { text: out.join("\n"), twoColumn: true };
}

async function extractFromPdf(file: File): Promise<ExtractResult> {
  const pdfjs = await import("pdfjs-dist");
  // 한국어 글꼴 문자표와 작업용 파일은 public/pdfjs 에 둔 것을 씁니다. (없으면 한글이 비거나 깨져요)
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdfjs/pdf.worker.min.mjs";

  const data = new Uint8Array(await file.arrayBuffer());
  const task = pdfjs.getDocument({
    data,
    cMapUrl: "/pdfjs/cmaps/",
    cMapPacked: true,
  });
  const doc = await task.promise;

  try {
    const parts: string[] = [];
    let anyTwoColumn = false;
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      const width = page.getViewport({ scale: 1 }).width;
      const content = await page.getTextContent();
      const pieces: Piece[] = [];
      for (const item of content.items) {
        if (!("str" in item) || item.str.trim() === "") continue;
        const [, , , d, x, y] = item.transform;
        pieces.push({ x, end: x + item.width, y, h: Math.abs(d) || 10, str: item.str });
      }
      const { text, twoColumn } = pageToText(pieces, width);
      if (twoColumn) anyTwoColumn = true;
      if (text) parts.push(`--- ${n}쪽 ---\n${text}`);
    }

    const all = parts.join("\n\n");
    const chars = countNonSpace(all);
    if (chars < SCAN_MIN_CHARS_PER_PAGE * doc.numPages) return { ok: false, message: SCAN_MESSAGE };
    if (hangulRatio(all) < HANGUL_MIN_RATIO) {
      return {
        ok: false,
        message: "PDF의 글자가 제대로 읽히지 않아요. 글자가 깨졌을 수 있으니 PDF로 다시 저장해서 올려 주세요.",
      };
    }
    return finish(all, doc.numPages, anyTwoColumn);
  } finally {
    await task.destroy();
  }
}

/* ───────────── 겉문 ───────────── */

export async function extractFileText(file: File): Promise<ExtractResult> {
  try {
    if (file.name.toLowerCase().endsWith(".txt")) return await extractFromTxt(file);
    return await extractFromPdf(file);
  } catch {
    return { ok: false, message: `"${file.name}" 파일을 읽지 못했어요. 파일이 손상되지 않았는지 확인하고 다시 올려 주세요.` };
  }
}

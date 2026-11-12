// 브라우저 임시 저장 중 "큰 데이터"(파일에서 뽑아낸 글자)를 맡는 도구입니다. (설계서 2-3, PLAN 8번)
// 작은 값(단계, 파일 이름, 확정 내용)은 기존대로 localStorage에 두고,
// 긴 글자는 브라우저의 더 큰 저장 공간(IndexedDB)에 둡니다. 서버로는 아무것도 보내지 않아요.
import { clear, del, get, set } from "idb-keyval";
import type { ExtractResult } from "./extract-text";

export type StoredText = Extract<ExtractResult, { ok: true }>;
export type StoredTexts = Record<string, StoredText>; // 파일 이름 → 뽑아낸 글자

const KEY = "regwatch-extracted-v1";

// 시크릿 창 등에서 저장 공간을 못 쓸 수 있어, 실패해도 화면이 멈추지 않게 조용히 넘어갑니다.
export async function loadExtracted(): Promise<StoredTexts> {
  try {
    return (await get<StoredTexts>(KEY)) ?? {};
  } catch {
    return {};
  }
}

export async function saveExtracted(texts: StoredTexts): Promise<void> {
  try {
    if (Object.keys(texts).length === 0) await del(KEY);
    else await set(KEY, texts);
  } catch {
    /* 저장 실패는 무시 — 이어서 하기만 안 될 뿐 작업은 계속할 수 있어요 */
  }
}

// [지우고 새로 시작]: 이 저장 공간에 남은 글자를 모두 지웁니다. (공용 PC 대비)
export async function clearExtracted(): Promise<void> {
  try {
    await clear();
  } catch {
    /* 무시 */
  }
}

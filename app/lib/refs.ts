// 분석 API(영향 분석·인허가 판정)가 함께 쓰는 "참조 법령" 다루는 도구입니다.

export type Ref = { name: string; text: string };

// 공백을 뺀 글자 수 (글자 수 상한 확인용)
export const countChars = (s: string) => s.replace(/\s/g, "").length;

// 요청으로 받은 참조 법령 목록을 안전하게 정리합니다. (모양이 이상하거나 글자가 없는 것은 버려요)
export function parseRefs(raw: unknown): Ref[] {
  const refs: Ref[] = [];
  if (!Array.isArray(raw)) return refs;
  for (const r of raw) {
    if (r && typeof r === "object" && typeof (r as { text?: unknown }).text === "string") {
      const { name, text } = r as { name?: unknown; text: string };
      if (text.trim()) refs.push({ name: typeof name === "string" && name ? name : "참조 법령", text: text.trim() });
    }
  }
  return refs;
}

// 법제처에서 가져온 묶음 파일은 "【법령명】 (시행 …)" 머리글로 법령이 나뉘어 있어요. 그 단위로 쪼갭니다.
// (AI와 코드 검사가 "선박투자회사법 시행령"처럼 법령 이름을 정확히 알게 하려고요)
export function expandRefs(refs: Ref[]): Ref[] {
  return refs.flatMap((r) => {
    const parts = r.text.split(/^(?=【.+?】)/m).filter((p) => p.trim());
    if (parts.length === 0 || !/^【.+?】/.test(parts[0])) return [r]; // 머리글이 없으면 그대로
    return parts.map((p) => ({ name: p.match(/^【(.+?)】/)?.[1] ?? r.name, text: p.trim() }));
  });
}

// 뉴스·자료 정리에 쓰는 작은 도구 모음 (뉴스 API와 전망 API가 함께 써요)

// 주소 비교용: 뒤의 추적 값(?utm_...)과 끝 슬래시를 떼고 비교해요.
export function normUrl(url: string) {
  try {
    const u = new URL(url);
    return `${u.hostname.replace(/^www\./, "")}${u.pathname.replace(/\/$/, "")}`;
  } catch {
    return "";
  }
}

// 자료가 "최신"이 아닌지 확인해요. 오늘부터 31일(약 1개월)보다 오래됐거나, 날짜를 알 수 없으면 최신이 아닌 것으로 쳐서 뺍니다.
export const MAX_AGE_DAYS = 31;
export function isStale(date: string, now = Date.now()) {
  const m = date.match(/(\d{4})[-./년\s]+(\d{1,2})(?:[-./월\s]+(\d{1,2}))?/);
  if (!m) return true; // 날짜를 확인할 수 없으면 최신 자료라고 보장할 수 없어요
  const t = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3] ?? 1)).getTime();
  if (Number.isNaN(t)) return true;
  return now - t > MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
}

// AI가 글 안에 섞어 쓰는 "([이름](주소))" 같은 링크 표기를 지웁니다. (출처는 따로 보여 줘요)
export function cleanText(s: string) {
  return s
    .replace(/\s*\(\[[^\]]*\]\([^)]*\)\)/g, "") // ([이름](주소))
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1") // [이름](주소) → 이름
    .replace(/\s*\(?https?:\/\/\S+?\)?(?=\s|$)/g, "") // 맨주소
    .trim();
}

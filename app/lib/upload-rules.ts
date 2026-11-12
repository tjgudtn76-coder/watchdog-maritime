import { ALLOWED_EXTENSIONS, MAX_FILE_MB } from "./schemas";

export const ACCEPT_ATTR = ALLOWED_EXTENSIONS.join(",");

// 올린 파일이 기획서의 업로드 조건(PDF·텍스트, 10MB 이하)에 맞는지 검사합니다.
export function checkFiles(files: File[]): { ok: string[]; errors: string[] } {
  const ok: string[] = [];
  const errors: string[] = [];
  for (const f of files) {
    const lower = f.name.toLowerCase();
    if (lower.endsWith(".hwp") || lower.endsWith(".hwpx")) {
      errors.push(`"${f.name}": 한글(HWP) 파일은 PDF로 저장한 뒤 올려 주세요.`);
    } else if (!ALLOWED_EXTENSIONS.some((ext) => lower.endsWith(ext))) {
      errors.push(`"${f.name}": PDF와 텍스트(.txt) 파일만 올릴 수 있어요.`);
    } else if (f.size > MAX_FILE_MB * 1024 * 1024) {
      errors.push(`"${f.name}": 파일 1개는 ${MAX_FILE_MB}MB까지만 올릴 수 있어요.`);
    } else {
      ok.push(f.name);
    }
  }
  return { ok, errors };
}

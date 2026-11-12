import "server-only";
import OpenAI from "openai";
import { ContentFilterFinishReasonError, LengthFinishReasonError } from "openai/error";
import { zodTextFormat } from "openai/helpers/zod";
import type { z } from "zod";

// OpenAI와 대화하는 공통 창구입니다. 서버 쪽에서만 쓰입니다 (화면 쪽에서 불러오면 오류가 나도록 막아 두었어요).
// API 키는 .env 파일의 OPENAI_API_KEY 값을 자동으로 읽습니다.
// 사용할 모델은 gpt-4o-mini로 고정합니다. (.env의 OPENAI_MODEL 같은 값으로 바꿀 수 없어요. 바꾸려면 아래 줄을 직접 고쳐야 해요)
export const MODEL = "gpt-4o-mini";

// AI가 기다려 주는 최대 시간(밀리초).
// ※ 규칙: 이 값은 분석 API 파일의 `maxDuration`(초)보다 짧아야 해요.
//   서버가 먼저 강제로 끊기면 쉬운 오류 안내 대신 기본 오류 화면이 나오기 때문입니다.
//   (분석 API를 만들 때 `export const maxDuration = 60;` 이상으로 적습니다.)
export const AI_TIMEOUT_MS = 55_000;

export function hasApiKey() {
  return !!process.env.OPENAI_API_KEY?.trim();
}

// 파일을 불러오는 순간이 아니라 처음 쓸 때 만듭니다.
// (키가 없어도 "키가 없어요"라고 쉬운 안내를 할 수 있게, 그리고 배포 빌드가 키 없이도 통과하게 하려고요)
let client: OpenAI | null = null;
export function getAI() {
  client ??= new OpenAI({
    timeout: AI_TIMEOUT_MS,
    maxRetries: 0, // 자동 재시도로 시간을 쓰지 않고, 실패하면 바로 알려서 사람이 [다시 시도]를 누르게 합니다
  });
  return client;
}

// 오류를 쉬운 말로 바꿔 줍니다. (기획서 5번 예외 상황 처리)
export function friendlyError(error: unknown): string {
  if (error instanceof OpenAI.AuthenticationError) return "API 키가 올바르지 않아요. 키를 다시 확인해 주세요.";
  if (error instanceof OpenAI.PermissionDeniedError) return "이 API 키로는 사용할 권한이 없어요.";
  if (error instanceof OpenAI.NotFoundError) return `"${MODEL}" 모델을 쓸 수 없어요. 모델 이름이나 계정 권한을 확인해 주세요.`;
  if (error instanceof OpenAI.RateLimitError) return "사용 한도를 넘었거나 잔액이 부족해요. 잠시 뒤 다시 시도하거나 결제 설정을 확인해 주세요.";
  if (error instanceof OpenAI.APIConnectionTimeoutError) return "AI 답이 너무 오래 걸려서 멈췄어요. 잠시 뒤 [다시 시도]를 눌러 주세요.";
  if (error instanceof OpenAI.APIConnectionError) return "인터넷 연결 문제로 AI 서비스에 닿지 못했어요.";
  if (error instanceof LengthFinishReasonError) return "AI 답이 너무 길어서 중간에 끊겼어요. 규정 수를 줄이거나 나눠서 다시 시도해 주세요.";
  if (error instanceof ContentFilterFinishReasonError) return "AI가 이 내용에는 답하지 않았어요. 올린 문서를 확인해 주세요.";
  if (error instanceof OpenAI.APIError) return `AI 서비스 오류예요. (코드 ${error.status})`;
  return "알 수 없는 오류로 연결하지 못했어요.";
}

export type AiResult<T> = { ok: true; data: T } | { ok: false; message: string };

// AI에게 물어보고, 정해진 모양(zod)으로만 답을 받는 공통 도구입니다.
//  - 모양에 맞지 않는 답은 성공으로 치지 않아요.
//  - 실패하면 항상 { ok: false, message: 쉬운 말 } 로 돌려줍니다. (던지지 않아요)
//  - OpenAI 쪽에 대화가 남지 않도록 store: false 로 부릅니다. (사내 규정 글자 보호)
export async function callAiJson<S extends z.ZodType>(opts: {
  name: string; // 결과 모양의 이름 (영문·숫자·밑줄)
  instructions: string; // AI에게 주는 지시문 (규칙)
  input: string; // 분석할 글자
  schema: S; // 돌려받을 모양
  // AI가 "생각하는 정도". 낮을수록 빠르고 싸요. 글이 길어 시간 제한(55초)에 걸리는 작업에 씁니다.
  effort?: "low" | "medium" | "high";
  // AI를 기다리는 최대 시간(밀리초). 안 쓰면 AI_TIMEOUT_MS. 글이 아주 긴 작업만 늘려요.
  timeoutMs?: number;
  // 웹 검색 등 AI가 쓸 수 있는 도구. 쓰면 검색에서 실제로 나온 출처 주소(citations)도 함께 돌려줘요.
  webSearch?: boolean;
}): Promise<AiResult<z.infer<S>> & { citations?: string[] }> {
  if (!hasApiKey()) {
    return { ok: false, message: ".env 파일에 OPENAI_API_KEY가 없어요. 키를 넣은 뒤 앱을 다시 켜 주세요." };
  }
  try {
    const response = await getAI().responses.parse({
      model: MODEL,
      instructions: opts.instructions,
      input: opts.input,
      store: false,
      ...(opts.webSearch
        ? {
            tools: [{ type: "web_search" as const }],
            tool_choice: "required" as const, // 검색을 건너뛰고 지어내지 않도록 꼭 검색하게 해요
            include: ["web_search_call.action.sources" as const], // 검색에서 실제로 나온 주소도 함께 받아요
          }
        : {}),
      // gpt-4o 계열은 "생각하는 정도" 설정을 받지 않아 오류가 나므로, gpt-5·o 계열일 때만 보냅니다.
      ...(opts.effort && /^(gpt-5|o\d)/.test(MODEL) ? { reasoning: { effort: opts.effort } } : {}),
      text: { format: zodTextFormat(opts.schema, opts.name) },
    }, { timeout: opts.timeoutMs ?? AI_TIMEOUT_MS });

    const refused = response.output.some(
      (o) => o.type === "message" && o.content.some((c) => c.type === "refusal"),
    );
    if (refused) return { ok: false, message: "AI가 이 내용에는 답하지 않았어요. 올린 문서를 확인해 주세요." };
    if (response.status === "incomplete") {
      return { ok: false, message: "AI 답이 너무 길어서 중간에 끊겼어요. 규정 수를 줄이거나 나눠서 다시 시도해 주세요." };
    }
    if (response.output_parsed == null) {
      return { ok: false, message: "AI 답을 정해진 모양으로 읽지 못했어요. [다시 시도]를 눌러 주세요." };
    }
    // 웹 검색 결과에 실제로 달려 나온 출처 주소들 (AI가 주소를 지어내는 것을 막는 데 써요)
    const citations: string[] = [];
    for (const o of response.output) {
      if (o.type === "web_search_call") {
        const sources = (o.action as { sources?: { url: string }[] } | undefined)?.sources ?? [];
        for (const src of sources) citations.push(src.url);
        continue;
      }
      if (o.type !== "message") continue;
      for (const c of o.content) {
        if (c.type !== "output_text") continue;
        for (const a of c.annotations ?? []) if (a.type === "url_citation") citations.push(a.url);
      }
    }
    return { ok: true, data: response.output_parsed as z.infer<S>, citations };
  } catch (error) {
    if (error instanceof OpenAI.OpenAIError) return { ok: false, message: friendlyError(error) };
    console.error("[ai] 정해진 모양으로 읽기 실패:", error); // 원인 확인용 서버 로그
    // 답을 정해진 모양으로 읽는 중 난 오류 등
    return { ok: false, message: "AI 답을 정해진 모양으로 읽지 못했어요. [다시 시도]를 눌러 주세요." };
  }
}

// 웹 검색을 쓰는 호출용: AI가 가끔 깨진 모양으로 답해서, 모양이 틀리면 최대 3번까지 다시 물어봅니다.
// 한 번에 18초까지만 기다려서(3번이면 54초), 라우트의 최대 실행 시간(60초) 안에 끝나게 해요.
export async function callAiJsonRetry<S extends z.ZodType>(
  opts: Parameters<typeof callAiJson<S>>[0],
): Promise<Awaited<ReturnType<typeof callAiJson<S>>>> {
  let last = await callAiJson({ ...opts, timeoutMs: 18_000 });
  for (let n = 1; n < 3 && !last.ok && last.message.includes("정해진 모양"); n++) {
    last = await callAiJson({ ...opts, timeoutMs: 18_000 });
  }
  return last;
}

import { connection } from "next/server";
import { friendlyError, getAI, hasApiKey, MODEL } from "../../lib/ai";

// 개발 단위 5: AI(OpenAI)와 연결되는지 확인하는 시험용 API
// 브라우저에서 /api/health 주소를 열면 결과가 나옵니다.
export async function GET() {
  await connection(); // 미리 만들어 두지 않고, 열 때마다 새로 확인

  if (!hasApiKey()) {
    return Response.json(
      { ok: false, message: ".env 파일에 OPENAI_API_KEY가 없어요. 키를 넣은 뒤 앱을 다시 켜 주세요." },
      { status: 500 },
    );
  }

  try {
    const response = await getAI().responses.create({
      model: MODEL,
      input: "연결 확인입니다. '연결 성공'이라고만 답해 주세요.",
      store: false,
    });
    return Response.json({
      ok: true,
      model: response.model,
      reply: response.output_text.trim(),
      message: "AI와 연결됐어요.",
    });
  } catch (error) {
    return Response.json({ ok: false, model: MODEL, message: friendlyError(error) }, { status: 502 });
  }
}

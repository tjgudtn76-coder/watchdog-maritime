// 쉬운 말로 된 오류 안내와 [다시 시도] 버튼을 보여 주는 공통 부품입니다. (기획서 5장 "AI가 응답하지 않거나 오류가 난 경우", PLAN 10번)
// 영향 분석 실패, 인허가 판정 실패처럼 AI 호출이 실패하는 모든 곳에서 같은 모양으로 씁니다.

export default function ErrorRetry({
  message,
  onRetry,
  busy = false,
  title,
}: {
  message: string; // 쉬운 말 오류 안내 (서버가 돌려준 문구)
  onRetry: () => void; // [다시 시도]를 눌렀을 때 할 일
  busy?: boolean; // 다시 시도하는 중이면 버튼을 잠가요
  title?: string; // 안내 앞에 붙일 한마디 (예: "인허가 판정을 받지 못했어요.")
}) {
  return (
    <div
      role="alert"
      className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
    >
      <span>
        ⚠ {title ? `${title} ` : ""}
        {message}
      </span>
      <button
        onClick={onRetry}
        disabled={busy}
        className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
      >
        다시 시도
      </button>
    </div>
  );
}

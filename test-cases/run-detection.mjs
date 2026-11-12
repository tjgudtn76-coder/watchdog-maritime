// 영향 조항 탐지율 시험 도구 (PLAN 19번)
// 정답표(answer.json)를 정해 둔 사례를 영향 분석 API에 보내고, AI가 정답 조문을 얼마나 찾았는지 계산합니다.
//
// 사용법 (개발 서버를 먼저 켜 두세요: npm run dev)
//   node test-cases/run-detection.mjs                 → 모든 사례를 3번씩 돌려 평균을 냄
//   node test-cases/run-detection.mjs --runs 1        → 1번만 (빠르게 확인)
//   node test-cases/run-detection.mjs --case ship-amend-12
//   node test-cases/run-detection.mjs --url http://localhost:3000
//
// 맞힘 기준: AI 항목의 "근거 조문"(legalBasis)에 정답 조 번호가 들어 있으면 그 정답을 찾은 것으로 봅니다.
//   · 탐지율 = 찾은 정답 수 ÷ 정답 수 (사례를 여러 번 돌린 평균, 목표 90% 이상)
//   · 오탐 = 정답에 없는 조문을 근거로 낸 항목 수 (특히 "나오면안되는조문"이 나오면 안 돼요)
//   · "정답이 없는 사례"는 영향 항목이 0건이어야 통과
// 이 도구는 AI를 실제로 부르므로 호출 비용이 들어요. (사례 1개 × 3번 ≈ AI 호출 3번)
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const BASE = opt("url", "http://localhost:3000");
const RUNS = Math.max(1, parseInt(opt("runs", "3"), 10));
const ONLY = opt("case", null);
const TARGET = 90; // 목표 탐지율(%)

// "제55조의3 제1항" 같은 글에서 조 번호("제55조의3")만 뽑습니다.
const articleKeys = (s) => new Set([...String(s).replace(/\s/g, "").matchAll(/제(\d+)조(?:의(\d+))?/g)].map((m) => `제${m[1]}조${m[2] ? "의" + m[2] : ""}`));

// 비밀번호가 걸린 배포 주소를 시험할 때는 TEST_AUTH="사용자:비밀번호" 환경변수를 함께 주세요.
const authHeaders = { "content-type": "application/json" };
if (process.env.TEST_AUTH) authHeaders.authorization = "Basic " + Buffer.from(process.env.TEST_AUTH, "utf8").toString("base64");

async function analyze(lawText) {
  const t0 = Date.now();
  const res = await fetch(`${BASE}/api/analyze-impact`, {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({ lawText, refs: [] }),
  });
  const json = await res.json().catch(() => ({ ok: false, message: "JSON이 아닌 답" }));
  return { json, sec: ((Date.now() - t0) / 1000).toFixed(1) };
}

function score(items, answer) {
  const want = answer["정답조문"];
  const found = new Set();
  for (const it of items) for (const k of articleKeys(it.legalBasis)) found.add(k);
  const hit = want.filter((k) => found.has(k));
  const missed = want.filter((k) => !found.has(k));
  // 오탐: 정답 조문이 하나도 근거에 없는 항목
  const falsePos = items.filter((it) => ![...articleKeys(it.legalBasis)].some((k) => want.includes(k)));
  const forbidden = (answer["나오면안되는조문"] ?? []).filter((k) => found.has(k) && !want.includes(k));
  return { hit, missed, falsePos, forbidden, rate: want.length ? (hit.length / want.length) * 100 : null };
}

const caseDirs = readdirSync(here, { withFileTypes: true })
  .filter((d) => d.isDirectory() && existsSync(join(here, d.name, "answer.json")) && (!ONLY || d.name === ONLY))
  .map((d) => d.name);
if (caseDirs.length === 0) {
  console.error("시험할 사례가 없어요. (test-cases/<이름>/law.txt + answer.json)");
  process.exit(2);
}

let allPass = true;
for (const name of caseDirs) {
  const lawText = readFileSync(join(here, name, "law.txt"), "utf8");
  const answer = JSON.parse(readFileSync(join(here, name, "answer.json"), "utf8"));
  const want = answer["정답조문"];
  console.log(`\n■ 사례 "${name}" — 정답 ${want.length}개, ${RUNS}번 실행`);

  const runs = await Promise.all(Array.from({ length: RUNS }, () => analyze(lawText)));
  const rates = [];
  let casePass = true;
  runs.forEach((r, i) => {
    if (!r.json.ok) {
      console.log(`  ${i + 1}번째: ❌ 실패 — ${r.json.message}`);
      casePass = false;
      return;
    }
    const items = r.json.items;
    const s = score(items, answer);
    const dropped = r.json.droppedCount ?? 0;
    if (want.length === 0) {
      const ok = items.length === 0;
      if (!ok) casePass = false;
      console.log(`  ${i + 1}번째: ${ok ? "✅" : "❌"} 영향 항목 ${items.length}건 (0건이어야 함) · ${r.sec}초`);
      return;
    }
    rates.push(s.rate);
    console.log(
      `  ${i + 1}번째: 찾음 ${s.hit.length}/${want.length} (${s.rate.toFixed(0)}%) · 항목 ${items.length}건 · 오탐 ${s.falsePos.length}건 · 코드검사로 제외 ${dropped}건 · ${r.sec}초` +
        (s.missed.length ? `\n      놓친 조문: ${s.missed.join(", ")}` : "") +
        (s.forbidden.length ? `\n      ⚠ 나오면 안 되는 조문이 나옴: ${s.forbidden.join(", ")}` : ""),
    );
    if (s.forbidden.length) casePass = false;
  });

  if (want.length > 0) {
    const ok = rates.length === RUNS;
    const avg = rates.length ? rates.reduce((a, b) => a + b, 0) / rates.length : 0;
    const pass = ok && avg >= TARGET && casePass;
    console.log(`  → 평균 탐지율 ${avg.toFixed(1)}% (목표 ${TARGET}% 이상): ${pass ? "✅ 통과" : "❌ 미달"}`);
    if (!pass) allPass = false;
  } else {
    console.log(`  → ${casePass ? "✅ 통과" : "❌ 미달"}`);
    if (!casePass) allPass = false;
  }
}

console.log(`\n${allPass ? "✅ 전체 통과" : "❌ 기준 미달인 사례가 있어요"}`);
process.exit(allPass ? 0 : 1);

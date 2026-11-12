// 예시 데이터: 아직 AI가 연결되지 않아 화면 확인용으로만 쓰는 가짜 결과입니다.
// 법 조문 번호는 실제 법령과 헷갈리지 않도록 "○"로 가려 두었습니다.

import type { ImpactItem, LicenseItem } from "./schemas";

export const SAMPLE_LAW_FILE = "선박투자회사법_개정안_신구조문대비표(예시).pdf";
export const SAMPLE_COMPANY_FILE = "인수기업_현황자료(가상).pdf";
export const SAMPLE_LAW_REF_FILES = ["선박투자회사법_원문(예시).pdf", "선박투자회사법_시행령_원문(예시).pdf"];

export const SAMPLE_IMPACT_ITEMS: ImpactItem[] = [
  {
    id: "i1",
    impact: "상",
    targetClause: "시행령 제○조 (선박운용회사의 이해상충 관리)",
    legalBasis: "「선박투자회사법」 제○조 제○항 (개정안)",
    change: "이해상충 방지 의무의 대상이 계열회사와의 거래까지 넓어졌습니다.",
    direction: "관리 대상 거래에 '계열회사와의 선박 매매·용선 거래'를 추가합니다.",
    confidence: 92,
  },
  {
    id: "i2",
    impact: "상",
    targetClause: "시행령 제○조 (선박 취득 승인 절차)",
    legalBasis: "「선박투자회사법」 제○조 제○항 (개정안)",
    change: "일정 규모 이상의 선박 취득은 이사회 사전 결의가 필요해졌습니다.",
    direction: "이사회 결의사항에 '기준 금액 이상의 선박 취득'을 추가합니다.",
    confidence: 85,
  },
  {
    id: "i3",
    impact: "중",
    targetClause: "시행규칙 제○조 (선박 관리 위탁 보고)",
    legalBasis: "「선박투자회사법」 제○조 (개정안)",
    change: "선박 관리 위탁 계약의 보고 절차가 바뀌었습니다.",
    direction: "위탁 계약 체결 시 전결권자를 본부장에서 대표이사로 올리는 방안을 검토합니다.",
    confidence: 64,
  },
  {
    id: "i4",
    impact: "중",
    targetClause: "선박운용회사의 부수 업무 범위",
    legalBasis: "「공공기관 혁신 지침」 제○항",
    change: "기관 고유 업무와 겹치는 부수 업무를 정리하도록 권고합니다.",
    direction: "사업 목적 중 부수 업무 항목의 유지 여부를 검토합니다.",
    confidence: 58,
  },
  {
    id: "i5",
    impact: "하",
    targetClause: "시행규칙 별지 서식 (정기 보고)",
    legalBasis: "「선박투자회사법」 제○조 제○항 (개정안)",
    change: "감독기관 보고 서식의 명칭이 바뀌었습니다.",
    direction: "조문 속 서식 명칭만 새 이름으로 바꿉니다.",
    confidence: 78,
  },
];

export const SAMPLE_LICENSE_ITEMS: LicenseItem[] = [
  {
    id: "l1",
    requirement: "인허가 지위 승계 가능 여부",
    standard: "「선박투자회사법」 제○조 (합병 시 지위 승계)",
    status: "합병 방식(흡수·신설) 미확정",
    verdict: "확인 필요",
    note: "합병 방식이 정해지면 다시 판정합니다.",
  },
  {
    id: "l2",
    requirement: "납입자본금",
    standard: "○○억 원 이상",
    status: "○○억 원",
    verdict: "충족",
    note: "",
  },
  {
    id: "l3",
    requirement: "전문인력",
    standard: "○명 이상",
    status: "○명",
    verdict: "미충족",
    note: "선박 운용 전문인력 추가 확보가 필요합니다.",
  },
  {
    id: "l4",
    requirement: "물적설비 (전산설비·사무공간)",
    standard: "업무 수행에 필요한 설비",
    status: "기존 설비 보유",
    verdict: "충족",
    note: "",
  },
  {
    id: "l5",
    requirement: "대주주 적격성",
    standard: "「선박투자회사법」 제○조",
    status: "근거 자료 없음",
    verdict: "확인 필요",
    note: "업로드된 자료에 근거가 없어 판정하지 않았습니다.",
  },
  {
    id: "l6",
    requirement: "이해상충 방지체계",
    standard: "내부통제기준 마련",
    status: "통합 후 기준 미정",
    verdict: "미충족",
    note: "통합 내부통제기준을 새로 마련해야 합니다.",
  },
];

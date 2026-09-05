/**
 * ★ 좌측 9항목 · 상부 탭 5 · 하부 타일 규칙(C-070 · 대시보드 구성 v0.1).
 * 좌측 목록은 결재 사항(C-070) — 순서·이름을 코드에서 바꾸지 않는다.
 * 탭 이름·타일 문구는 「관찰 조정」 대상(대시보드 §5) — 바꾼 것은 대장에 한 줄씩 기록한다.
 */

export interface RailItem {
  path: string;
  label: string;
  /** 폴더가 열려 있어야 들어갈 수 있는 항목 */
  needsFolder: boolean;
}

/** 좌측 레일 9항목 — 순서 고정(C-070) */
export const railItems: readonly RailItem[] = [
  { path: '/', label: '홈', needsFolder: false },
  { path: '/grade', label: '시험채점', needsFolder: true },
  { path: '/exam', label: '시험만들기', needsFolder: true },
  { path: '/twin', label: '동형만들기', needsFolder: true },
  { path: '/forge', label: '문제공방', needsFolder: true },
  { path: '/report', label: '리포트', needsFolder: true },
  { path: '/students', label: '학생', needsFolder: true },
  { path: '/bank', label: '문제함', needsFolder: true },
  { path: '/settings', label: '설정', needsFolder: false },
] as const;

export type ChatTabId = 'chat' | 'upload' | 'grade' | 'forge' | 'twin';

export interface ChatTab {
  id: ChatTabId;
  label: string;
  placeholder: string;
  /** 탭이 여는 카드의 경로. null 이면 카드 없음(채팅). */
  route: string | null;
}

/** 상부 업무 탭 5개 — 5개를 넘기지 않는다(대시보드 §2) */
export const chatTabs: readonly ChatTab[] = [
  {
    id: 'chat',
    label: '채팅',
    placeholder: '무엇이든 — 예: 이번 시험 4번 정답표 맞아?',
    route: null,
  },
  {
    id: 'upload',
    label: '문제 올리기',
    placeholder: '시험지·교재 사진이나 PDF를 놓으세요 · 반과 단원을 알려주세요',
    route: '/exam',
  },
  {
    id: 'grade',
    label: '채점',
    placeholder: 'OMR CSV나 엑셀 응답을 붙여넣으세요',
    route: '/grade',
  },
  {
    id: 'forge',
    label: '문제 만들기',
    placeholder: '단원·난이도·조건을 말해 주세요 · 예: 삼각함수 그래프 난4, 숨은 경우',
    route: '/forge',
  },
  {
    id: 'twin',
    label: '동형',
    placeholder: '문제함에서 씨앗을 고르거나 문항 번호를 말해 주세요',
    route: '/twin',
  },
] as const;

/** 대화층은 다음 국면(U-022 · 자리 C) — 입력창 전송 시 띄우는 안내 */
export const chatDeferredNotice =
  '대화층은 다음 국면입니다. 지금은 위 탭이나 왼쪽 목록에서 바로 시작해 주세요.';

/** 이번 국면에 켜져 있는 하부 타일 2종(대시보드 §3의 부분 구현) */
export const tileCopy = {
  transcriptPending: (n: number) => `전사 확인 ${n}건 남음`,
  ungraded: (title: string) => `${title} 채점 안 됨`,
  recent: '최근 작업',
} as const;

/** 지원 외 브라우저 안내(결재안 U-011 §2) */
export const unsupportedBrowserNotice =
  '이 도구는 폴더를 직접 읽고 씁니다. 크롬·엣지·웨일에서 열어 주세요.';

/** 폴더 미개방 안내 */
export const folderRequiredNotice = '폴더를 먼저 여세요.';

/** 「준비 중」 화면 문구 — 가짜 UI를 그리지 않는다(§7) */
export const comingSoonNotice = '준비 중입니다.';

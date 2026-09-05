import type { TranscriptItem, TranscriptTmp } from '../folder/schemas/transcript';
import { emptyEdited } from './transcriptStore';

/**
 * 문항 경계 나누기/합치기(가-2 · 코너 가 §4).
 * 경계를 바꾸면 그 문항의 확인은 풀린다 — 선생이 다시 눌러야 한다(자동 확인 금지).
 */

function renumber(items: TranscriptItem[]): TranscriptItem[] {
  return items.map((item, index) => ({ ...item, tmp_no: index + 1 }));
}

/** 발문을 절반에서 두 문항으로 나눈다. 선지는 뒤쪽이 가져간다. */
export function splitItem(transcript: TranscriptTmp, tmpNo: number, at?: number): TranscriptTmp {
  const index = transcript.items.findIndex((i) => i.tmp_no === tmpNo);
  if (index < 0) return transcript;
  const item = transcript.items[index] as TranscriptItem;
  const text = item.edited.problem_text;
  const cut = at ?? Math.floor(text.length / 2);
  if (cut <= 0 || cut >= text.length) return transcript;

  const head: TranscriptItem = {
    ...item,
    llm: { ...item.llm, choices: null },
    edited: { problem_text: text.slice(0, cut), choices: null, answer_raw: null },
    confirmed_at: null,
    diff_from_llm: 0,
  };
  const tail: TranscriptItem = {
    ...item,
    llm: { ...item.llm },
    edited: {
      problem_text: text.slice(cut),
      choices: item.edited.choices,
      answer_raw: item.edited.answer_raw,
    },
    confirmed_at: null,
    diff_from_llm: 0,
  };
  const items = [...transcript.items];
  items.splice(index, 1, head, tail);
  return { ...transcript, items: renumber(items) };
}

/** 이 문항과 다음 문항을 하나로 합친다. */
export function mergeWithNext(transcript: TranscriptTmp, tmpNo: number): TranscriptTmp {
  const index = transcript.items.findIndex((i) => i.tmp_no === tmpNo);
  if (index < 0 || index >= transcript.items.length - 1) return transcript;
  const first = transcript.items[index] as TranscriptItem;
  const second = transcript.items[index + 1] as TranscriptItem;
  const merged: TranscriptItem = {
    ...first,
    llm: {
      ...first.llm,
      problem_text: `${first.llm.problem_text}\n${second.llm.problem_text}`,
      choices: second.llm.choices ?? first.llm.choices,
      uncertain: [...first.llm.uncertain, ...second.llm.uncertain],
    },
    edited: {
      problem_text: `${first.edited.problem_text}\n${second.edited.problem_text}`,
      choices: second.edited.choices ?? first.edited.choices,
      answer_raw: first.edited.answer_raw ?? second.edited.answer_raw,
    },
    figure: first.figure || second.figure,
    confirmed_at: null,
    diff_from_llm: 0,
  };
  const items = [...transcript.items];
  items.splice(index, 2, merged);
  return { ...transcript, items: renumber(items) };
}

/** 선생 직접 입력 칸 — 모델이 「읽을 수 없음」일 때(items 0) */
export function appendBlankItem(transcript: TranscriptTmp, page = 1): TranscriptTmp {
  const blank = {
    no: String(transcript.items.length + 1),
    stem_shared: null,
    problem_text: '',
    choices: null,
    format_guess: 'short' as const,
    answer_raw: null,
    solution_raw: null,
    figure: false,
    figure_text: null,
    points: null,
    source_note: null,
    uncertain: [],
    stray_marks: false,
    continues: false,
    page,
    bbox: null,
  };
  const item: TranscriptItem = {
    tmp_no: transcript.items.length + 1,
    page,
    bbox: null,
    llm: blank,
    edited: emptyEdited(blank),
    confirmed_at: null,
    diff_from_llm: 0,
    figure: false,
    format_guess: 'short',
  };
  return { ...transcript, items: [...transcript.items, item] };
}

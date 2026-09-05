import { useMemo } from 'react';
import katex from 'katex';

/**
 * 수식은 KaTeX 인라인 `$…$`(C-071 부수). 원문은 그대로 두고 화면만 렌더한다.
 * 렌더 실패는 숨기지 않고 원문을 그대로 보인다.
 */
function renderSegment(segment: string, isMath: boolean): string {
  if (!isMath) return escapeHtml(segment);
  try {
    return katex.renderToString(segment, { throwOnError: false, displayMode: false });
  } catch {
    return escapeHtml(`$${segment}$`);
  }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function MathText({ text, className }: { text: string; className?: string }) {
  const html = useMemo(() => {
    const parts = text.split('$');
    return parts.map((part, i) => renderSegment(part, i % 2 === 1)).join('');
  }, [text]);
  return (
    <span
      className={className}
      // KaTeX 출력은 우리가 만든 문자열이고 원문은 위에서 이스케이프했다.
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

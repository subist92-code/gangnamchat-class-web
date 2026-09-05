import type { ReactNode } from 'react';

/** 공통 부품 — 카드 · 버튼 · 안내. 색은 토큰만 쓴다(C-024). */

export function Card({
  title,
  children,
  footer,
}: {
  title?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <section className="rounded-lg border border-stone-200 bg-white p-5 shadow-sm">
      {title !== undefined && (
        <h2 className="mb-3 font-title text-lg text-primary">{title}</h2>
      )}
      <div className="text-sm leading-relaxed text-stone-800">{children}</div>
      {footer !== undefined && <div className="mt-4 border-t border-stone-100 pt-3">{footer}</div>}
    </section>
  );
}

export function Button({
  children,
  onClick,
  disabled,
  variant = 'primary',
  type = 'button',
  title,
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  variant?: 'primary' | 'ghost';
  type?: 'button' | 'submit';
  title?: string;
}) {
  const base = 'rounded px-3 py-2 text-sm transition disabled:cursor-not-allowed disabled:opacity-40';
  const skin =
    variant === 'primary'
      ? 'bg-primary text-white hover:bg-primary-hover'
      : 'border border-stone-300 bg-white text-stone-700 hover:bg-primary-tint';
  return (
    <button type={type} className={`${base} ${skin}`} onClick={onClick} disabled={disabled} title={title}>
      {children}
    </button>
  );
}

export function Notice({
  children,
  tone = 'info',
}: {
  children: ReactNode;
  tone?: 'info' | 'warn' | 'error';
}) {
  const skin =
    tone === 'error'
      ? 'border-chart-actual bg-white text-chart-actual'
      : tone === 'warn'
        ? 'border-stone-300 bg-white text-stone-700'
        : 'border-primary bg-primary-tint text-primary';
  return (
    <div className={`rounded border px-4 py-3 text-sm ${skin}`}>{children}</div>
  );
}

export function ComingSoon({ label }: { label: string }) {
  return (
    <Card title={label}>
      <p>준비 중입니다.</p>
      <p className="mt-2 text-stone-500">
        이 화면은 아직 만들지 않았습니다. 준비된 척하는 화면을 그리지 않습니다.
      </p>
    </Card>
  );
}

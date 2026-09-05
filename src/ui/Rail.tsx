import { NavLink } from 'react-router-dom';
import { railItems } from '../config/ui';
import { useSession } from '../store/session';

/** 좌측 레일 9항목 — 순서는 결재 사항(C-070). 코드에서 바꾸지 않는다. */
export function Rail() {
  const rootName = useSession((s) => s.adapter?.rootName ?? null);
  return (
    <nav className="flex w-44 shrink-0 flex-col gap-1 border-r border-stone-200 bg-white p-3">
      <div className="mb-3 px-2">
        <div className="font-title text-base text-primary">강남챗 클래스</div>
        <div className="mt-1 truncate text-xs text-stone-500" title={rootName ?? ''}>
          {rootName ?? '폴더 없음'}
        </div>
      </div>
      {railItems.map((item) => (
        <NavLink
          key={item.path}
          to={item.path}
          end={item.path === '/'}
          className={({ isActive }) =>
            `rounded px-3 py-2 text-sm ${
              isActive ? 'bg-primary-tint text-primary' : 'text-stone-700 hover:bg-primary-tint'
            }`
          }
        >
          {item.label}
        </NavLink>
      ))}
    </nav>
  );
}

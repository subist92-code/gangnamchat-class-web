import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { folderRequiredNotice, unsupportedBrowserNotice } from '../config/ui';
import { folderSupported } from '../folder/pickAdapter';
import { useSession } from '../store/session';
import { Card, Notice } from './parts';

/**
 * 폴더가 안 열려 있으면 홈·설정 외 경로는 막는다(§2-4).
 * 지원 외 브라우저는 첫 화면에서 안내한다(결재안 U-011 §2).
 */
export function FolderGate({ children }: { children: ReactNode }) {
  const adapter = useSession((s) => s.adapter);
  if (!folderSupported()) {
    return (
      <Card title="지원 브라우저">
        <Notice tone="warn">{unsupportedBrowserNotice}</Notice>
      </Card>
    );
  }
  if (adapter === null) {
    return (
      <Card title="폴더">
        <Notice>{folderRequiredNotice}</Notice>
        <p className="mt-3">
          <Link className="text-primary underline" to="/settings">
            설정에서 폴더 열기
          </Link>
        </p>
      </Card>
    );
  }
  return <>{children}</>;
}

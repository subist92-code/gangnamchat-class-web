import { Route, Routes } from 'react-router-dom';
import { FolderGate } from './ui/FolderGate';
import { HomePage } from './pages/Home';
import { GradePage } from './pages/Grade';
import { ExamPage } from './pages/Exam';
import { StudentsPage } from './pages/Students';
import { SettingsPage } from './pages/Settings';
import { BankPage, ForgePage, ReportPage, TwinPage } from './pages/Placeholder';

/** 좌측 9항목과 1:1(C-070). 홈·설정 외에는 폴더가 열려 있어야 들어간다. */
export function AppRoutes() {
  const gated = (node: React.ReactNode) => <FolderGate>{node}</FolderGate>;
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/grade" element={gated(<GradePage />)} />
      <Route path="/exam" element={gated(<ExamPage />)} />
      <Route path="/twin" element={gated(<TwinPage />)} />
      <Route path="/forge" element={gated(<ForgePage />)} />
      <Route path="/report" element={gated(<ReportPage />)} />
      <Route path="/students" element={gated(<StudentsPage />)} />
      <Route path="/bank" element={gated(<BankPage />)} />
      <Route path="/settings" element={<SettingsPage />} />
    </Routes>
  );
}

import { BrowserRouter } from 'react-router-dom';
import { Rail } from './ui/Rail';
import { AppRoutes } from './routes';

export function App() {
  return (
    <BrowserRouter>
      <div className="flex min-h-screen bg-canvas font-body text-stone-900">
        <Rail />
        <main className="flex-1 overflow-x-hidden p-6">
          <AppRoutes />
        </main>
      </div>
    </BrowserRouter>
  );
}

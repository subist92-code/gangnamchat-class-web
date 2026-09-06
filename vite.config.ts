import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

// 다중 진입(C-071 ④ · 결재안 U-011 Q-스택-4): 앱 index.html + 랜딩 landing.html
export default defineConfig({
  plugins: [react()],
  // 포트를 박아 둔다(2026-09-06): 매직링크 되돌아올 주소가 Supabase Auth 의
  // 리다이렉트 허용 목록에 등록되어 있어야 하는데, 포트가 밀리면 그 목록과 어긋난다.
  // strictPort = 5174 가 막혀 있으면 다른 포트로 도망가지 말고 그냥 실패하라는 뜻이다.
  server: {
    port: 5174,
    strictPort: true,
  },
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  build: {
    rollupOptions: {
      input: {
        app: fileURLToPath(new URL('./index.html', import.meta.url)),
        landing: fileURLToPath(new URL('./landing.html', import.meta.url)),
      },
    },
  },
  test: {
    environment: 'jsdom',
    include: ['tests/unit/**/*.test.ts', 'tests/unit/**/*.test.tsx'],
    globals: false,
  },
});

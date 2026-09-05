import type { Config } from 'tailwindcss';
import { colors, fontFamily } from './src/config/tokens';

// 토큰의 정본은 src/config/tokens.ts 하나뿐이다(C-024 · §2-3).
// 여기에 색 값을 직접 적지 않는다 — 새 색을 만들지 않는다.
export default {
  content: ['./index.html', './landing.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        canvas: colors.canvas,
        primary: colors.primary,
        'primary-hover': colors.primaryHover,
        'primary-tint': colors.primaryTint,
        'chart-actual': colors.chartActual,
        'chart-target': colors.chartTarget,
      },
      fontFamily: {
        title: [...fontFamily.title],
        body: [...fontFamily.body],
      },
    },
  },
  plugins: [],
} satisfies Config;

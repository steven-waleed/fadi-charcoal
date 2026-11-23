/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        opdc: {
          dark: '#0a3325',
          DEFAULT: '#0E4D38',
          light: '#16654a',
          surface: '#f4f6f8',
          badge: '#f0f7f3',
          border: '#c2e2d4',
          subtle: '#edf1f3',
        },
        gold: {
          DEFAULT: '#D4AF37',
          dark: '#b89628',
          light: '#f7e7a8',
        },
        charcoal: {
          50: '#f8fafc',
          100: '#f1f5f9',
          800: '#1e293b',
          900: '#0f172a',
          950: '#090d16',
        },
      },
      fontFamily: {
        cairo: ['Cairo', 'sans-serif'],
      },
      boxShadow: {
        'opdc': '0 20px 50px rgba(10, 51, 37, 0.15)',
        'opdc-btn': '0 8px 18px rgba(14, 77, 56, 0.35)',
        'gold-glow': '0 0 20px rgba(212, 175, 55, 0.35)',
      },
    },
  },
  plugins: [],
};

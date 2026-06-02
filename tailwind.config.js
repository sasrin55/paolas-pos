/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        paolas: {
          bg: '#0f1115',
          panel: '#1a1d24',
          border: '#2a2f3a',
          accent: '#d97706',
        },
      },
      fontSize: {
        // touch-first: bump default sizes so reading at arm's length is easy
        base: ['1.05rem', '1.5rem'],
      },
      minHeight: {
        tap: '48px',
      },
      minWidth: {
        tap: '48px',
      },
    },
  },
  plugins: [],
};

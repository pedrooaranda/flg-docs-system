/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        gold: {
          light: '#F5D68A',
          mid:   '#C9A84C',
          dark:  '#8B6914',
        },
        surface: {
          DEFAULT: '#0E0E0E',
          raised:  '#141414',
          overlay: '#1A1A1A',
        },
      },
      fontFamily: {
        display: ['"Playfair Display"', 'serif'],
        sans:    ['Poppins', 'sans-serif'],
        // Design system FLG (decks) — usadas pontualmente em /materiais
        serifdeck: ['Fraunces', '"Playfair Display"', 'serif'],
        monodeck:  ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      keyframes: {
        'fade-in': { from: { opacity: 0, transform: 'translateY(4px)' }, to: { opacity: 1, transform: 'translateY(0)' } },
        'slide-in-right': { from: { opacity: 0, transform: 'translateX(20px)' }, to: { opacity: 1, transform: 'translateX(0)' } },
        'pulse-gold': { '0%, 100%': { boxShadow: '0 0 0 0 rgba(201,168,76,0.4)' }, '50%': { boxShadow: '0 0 0 6px rgba(201,168,76,0)' } },
      },
      animation: {
        'fade-in': 'fade-in 0.2s ease-out',
        'slide-in-right': 'slide-in-right 0.3s ease-out',
        'pulse-gold': 'pulse-gold 2s infinite',
      },
    },
  },
  plugins: [],
}

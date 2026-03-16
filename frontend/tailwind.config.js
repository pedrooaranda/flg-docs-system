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
        black: '#080808',
      },
      fontFamily: {
        display: ['"Playfair Display"', 'serif'],
        sans:    ['Poppins', 'sans-serif'],
      },
    },
  },
  plugins: [],
}

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{html,ts}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        primary: { DEFAULT: '#a435f0', dark: '#8710d8', light: '#c77dff' },
      },
      fontFamily: {
        vazir: ['Vazirmatn', 'Tahoma', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
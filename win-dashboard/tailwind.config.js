/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        bgMain: '#090D16',
        bgCard: '#111827',
        borderCard: '#1F2937',
        winOrange: '#FF6B00',
        winGreen: '#10B981',
        winBlue: '#3B82F6',
        winCyan: '#06B6D4',
      }
    },
  },
  plugins: [],
}
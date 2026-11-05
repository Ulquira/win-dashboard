/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        bgMain: '#F8F9FA',
        bgCard: '#FFFFFF',
        borderCard: '#E5E7EB',
        winOrange: '#FF5500',
        winOrangeSoft: '#FFF0E5',
        winGreen: '#10B981',
        winBlue: '#3B82F6',
        winCyan: '#06B6D4',
      }
    },
  },
  plugins: [],
}
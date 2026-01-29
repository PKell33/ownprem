/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // OwnPrem brand accent color
        accent: {
          DEFAULT: '#7aa2f7',
          light: '#3d59a1',
        },
      },
      fontFamily: {
        sans: ['Plus Jakarta Sans', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [
    function({ addVariant }) {
      addVariant('light', ':is(.light &)')
    }
  ],
}

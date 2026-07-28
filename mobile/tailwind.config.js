/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./App.js', './screens/**/*.{js,jsx,ts,tsx}', './components/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eef7f4',
          100: '#d9efe7',
          500: '#16567b',
          600: '#0f405d'
        }
      }
    }
  },
  plugins: []
};

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Tajawal', 'Cairo', 'Segoe UI', 'system-ui', 'sans-serif'],
      },
      colors: {
        brand: {
          50: '#eefbf4',
          100: '#d6f5e3',
          200: '#b0e9cb',
          300: '#7bd6ab',
          400: '#45bb87',
          500: '#229f6c',
          600: '#148056',
          700: '#116647',
          800: '#10513a',
          900: '#0e4331',
        },
        sand: {
          50: '#fbf8f1',
          100: '#f4eddc',
          200: '#e8d9b8',
          300: '#d9be8b',
          400: '#c9a05f',
          500: '#b98a46',
        },
      },
      boxShadow: {
        card: '0 10px 30px -12px rgba(16, 81, 58, 0.25)',
      },
    },
  },
  plugins: [],
};

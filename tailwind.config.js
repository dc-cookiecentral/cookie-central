/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Outfit', 'system-ui', 'sans-serif'],
      },
      colors: {
        // Dirty Cookie brand — mirrors prototype constants
        pk: '#C2185B',  // primary pink/magenta
        pm: '#E91E90',  // bright magenta
        bg: '#FDF2F8',  // app background
        pc: '#FFF5FA',  // pale card
        cd: '#FFFFFF',  // card surface
        dk: '#2D2235',  // dark sidebar/text
        md: '#5C526A',  // medium text
        gr: '#9990A8',  // gray text
        lt: '#E8E0F0',  // light border
      },
    },
  },
  plugins: [],
};

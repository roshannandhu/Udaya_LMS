/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        serif: ['Fraunces', 'Georgia', 'serif'],
        sans: ['Inter', 'SF Pro Text', '-apple-system', 'sans-serif'],
      },
      colors: {
        ink: '#1A1A1A',          // dark nav + primary
        canvas: '#EAF4F7',       // light tinted page background (reference pale blue)
        // Pastel surface palette — fill + matching foreground (text/icon).
        pastel: {
          mint:        '#DFF5EC', 'mint-fg':     '#0F7B6C',
          pink:        '#F7E3F0', 'pink-fg':     '#AD1A72',
          lavender:    '#EAE4F2', 'lavender-fg': '#6940A5',
          cream:       '#FBF1D9', 'cream-fg':    '#B7791F',
          sky:         '#E3EFFB', 'sky-fg':      '#2383E2',
          peach:       '#FCE6DD', 'peach-fg':    '#C2410C',
        },
      },
      borderRadius: {
        card: '1.5rem',
        xl2: '2rem',
        pill: '9999px',
      },
      boxShadow: {
        card: '0 1px 2px rgba(0, 0, 0, 0.04)',
        soft: '0 4px 20px rgba(17, 24, 39, 0.06)',
        lift: '0 10px 30px rgba(17, 24, 39, 0.10)',
      },
    },
  },
  plugins: [],
}

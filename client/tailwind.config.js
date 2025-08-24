/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        pokemon: ['"Pokemon Solid"', 'sans-serif'],
      },
      boxShadow: {
        card: "0 10px 25px rgba(0,0,0,0.35)",
      },
      colors: {
        'rank-master': '#c084fc', // Grape
        'rank-expert': '#67e8f9',  // Cyan
        'rank-specialist': '#6ee7b7', // Emerald
        'rank-pupil': '#a3e635', // Lime
        'rank-newbie': '#d1d5db', // Gray
        'csesBlue': '#02B5C7',
        // Theme colors
        'primary': 'var(--color-primary)',
        'secondary': 'var(--color-secondary)',
        'background': 'var(--color-background)',
        'text-primary': 'var(--color-text-primary)',
        'text-secondary': 'var(--color-text-secondary)',
        'accent': 'var(--color-accent)',
      }
    },
  },
  plugins: [],
}
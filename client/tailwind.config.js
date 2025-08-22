/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      boxShadow: {
        card: "0 10px 25px rgba(0,0,0,0.35)",
      },
      backgroundImage: {
        'pokeball': "radial-gradient(circle at 50% 48%, #ffffff 0 37%, #e11d48 38% 65%, #0f172a 66% 100%)"
      }
    },
  },
  plugins: [],
}

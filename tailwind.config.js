/** @type {import('tailwindcss').Config} */
module.exports = {
	darkMode: "class",
	content: ["./app/**/*.{ts,tsx,jsx,js}"],
	theme: {
		screens: {
			sm: "480px",
			md: "768px",
			lg: "976px",
			xl: "1440px",
		},
		fontFamily: {
			sans: ["Graphik", "sans-serif"],
			serif: ["Merriweather", "serif"],
			mono: [
				"ui-monospace",
				"SFMono-Regular",
				"Menlo",
				"Monaco",
				"Consolas",
				"Liberation Mono",
				"Courier New",
				"monospace",
			],
		},
		extend: {
			spacing: {
				128: "32rem",
				144: "36rem",
			},
			borderRadius: {
				"4xl": "2rem",
			},
			colors: {
				dark: "#181818",
				light: "#FFFFFF",
				purple: "#7e5bef",
				pink: "#ff49db",
				orange: "#ff7849",
				green: "#13ce66",
				yellow: "#ffc82c",
				"gray-dark": "#273444",
				gray: "#8492a6",
				"gray-light": "#f1f1f1",
				dblue: "#58a6ff",
			},
			animation: {
				"fade-in": "fadeIn 0.6s ease-in-out 0.3s forwards",
				"fade-in-fast": "fadeIn 0.6s ease-in-out forwards",
			},
			keyframes: {
				fadeIn: {
					"0%": { opacity: "0" },
					"100%": { opacity: "1" },
				},
			},
		},
	},
	plugins: [require("@tailwindcss/typography")],
};

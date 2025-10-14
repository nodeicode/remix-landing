// Route handler for manifest.json to ensure it's publicly accessible
import type { LoaderFunctionArgs } from "react-router";

export async function loader({ request }: LoaderFunctionArgs) {
	const manifest = {
		name: "Trading Dashboard",
		short_name: "Dashboard",
		description: "Real-time trading dashboard with portfolio analytics",
		start_url: "/",
		display: "standalone",
		background_color: "#ffffff",
		theme_color: "#2563eb",
		orientation: "portrait-primary",
		icons: [
			{
				src: "/favicon.ico",
				sizes: "64x64 32x32 24x24 16x16",
				type: "image/x-icon",
			},
			{
				src: "/icon-192.png",
				sizes: "192x192",
				type: "image/png",
				purpose: "any maskable",
			},
			{
				src: "/icon-512.png",
				sizes: "512x512",
				type: "image/png",
				purpose: "any maskable",
			},
		],
		categories: ["finance", "business"],
		screenshots: [],
		shortcuts: [
			{
				name: "Dashboard",
				short_name: "Dashboard",
				description: "Open trading dashboard",
				url: "/",
				icons: [],
			},
		],
	};

	return new Response(JSON.stringify(manifest, null, 2), {
		status: 200,
		headers: {
			"Content-Type": "application/json",
			"Cache-Control": "public, max-age=3600",
		},
	});
}

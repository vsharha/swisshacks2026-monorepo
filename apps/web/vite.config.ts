import tailwindcss from '@tailwindcss/vite';
import adapter from '@sveltejs/adapter-cloudflare';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	// Read the single source-of-truth .env at the repo root.
	envDir: '../../',
	// @kyc/core ships TypeScript source (no build step); bundle it for SSR so
	// Node never tries to import raw .ts.
	ssr: {
		noExternal: ['@kyc/core']
	},
	plugins: [
		tailwindcss(),
		sveltekit({
			// SvelteKit's $env loader has its own dir (default: this app folder) — Vite's
			// envDir above does NOT cover it. Point it at the same repo-root .env so
			// $env/dynamic/private (e.g. LLM_API_KEY) resolves the single source of truth.
			env: { dir: '../../' },
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},

			// Deployed to Cloudflare Pages — no filesystem at the edge, so the data
			// layer is bundled via import.meta.glob (see $lib/server/data.ts) and the
			// app makes no live external API calls.
			adapter: adapter()
		})
	]
});

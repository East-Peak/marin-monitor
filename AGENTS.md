# Marin Monitor — Codex Context

See ~/.openclaw/workspace/projects/marin-monitor.md for full project state.
See ~/.codex/AGENTS.md for global machine conventions.

## Project-Specific

- Stack: SvelteKit 2 + Svelte 5 runes, TypeScript (strict), Tailwind CSS, D3, MapLibre GL, Vitest + Playwright
- Branch strategy: push directly to main (no branches, no PRs)
- Deploy: Vercel auto-deploys from git push. Adapter: @sveltejs/adapter-vercel
- After every deploy, update both CHANGELOG.md (root) and src/lib/config/changelog.ts (in-app)
- No per-request LLM calls. No fragile scraping. Politically neutral. Satire clearly labeled
- Test: `npm run test:unit` (103+ tests), `npm run test:e2e`, `npm run check`
- Build: `npm run build` before committing
- TV mode at /tv: SSR disabled, single MapContainer WebGL context
- Config-driven: feeds, keywords, towns, cameras, panels all in src/lib/config/

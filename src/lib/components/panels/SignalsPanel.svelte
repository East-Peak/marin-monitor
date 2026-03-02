<script lang="ts">
	import { Panel, Badge } from '$lib/components/common';
	import { timeAgo } from '$lib/utils';
	import type { NewsItem } from '$lib/types';

	interface Props {
		news?: NewsItem[];
		loading?: boolean;
		error?: string | null;
	}

	let { news = [], loading = false, error = null }: Props = $props();

	// Active alerts — the most important thing to surface
	const activeAlerts = $derived(
		news
			.filter((item) => item.isAlert)
			.sort((a, b) => b.timestamp - a.timestamp)
			.slice(0, 5)
	);

	// Multi-source stories — same topic covered by 2+ sources (real signal)
	const multiSourceStories = $derived.by(() => {
		// Group by normalized title keywords (3+ word overlap = same story)
		const storyGroups = new Map<string, { items: NewsItem[]; sources: Set<string> }>();

		for (const item of news) {
			const words = (item.title || '')
				.toLowerCase()
				.replace(/[^\w\s]/g, '')
				.split(/\s+/)
				.filter((w) => w.length > 3);
			if (words.length < 3) continue;

			let matched = false;
			for (const [key, group] of storyGroups) {
				const keyWords = key.split('|');
				const overlap = words.filter((w) => keyWords.includes(w)).length;
				if (overlap >= 3 && !group.sources.has(item.source)) {
					group.items.push(item);
					group.sources.add(item.source);
					matched = true;
					break;
				}
			}
			if (!matched) {
				storyGroups.set(words.slice(0, 8).join('|'), {
					items: [item],
					sources: new Set([item.source])
				});
			}
		}

		return Array.from(storyGroups.values())
			.filter((g) => g.sources.size >= 2)
			.sort(
				(a, b) => b.sources.size - a.sources.size || b.items[0].timestamp - a.items[0].timestamp
			)
			.slice(0, 4)
			.map((g) => ({
				title: g.items[0].title,
				link: g.items[0].link,
				sources: Array.from(g.sources),
				count: g.sources.size,
				timestamp: g.items[0].timestamp
			}));
	});

	// Town activity — where the news is concentrated
	const townActivity = $derived.by(() => {
		const townMap = new Map<
			string,
			{ name: string; count: number; alerts: number; categories: Set<string> }
		>();
		for (const item of news) {
			if (!item.townSlug || !item.town) continue;
			const existing = townMap.get(item.townSlug) ?? {
				name: item.town,
				count: 0,
				alerts: 0,
				categories: new Set()
			};
			existing.count += 1;
			if (item.isAlert) existing.alerts += 1;
			existing.categories.add(item.category);
			townMap.set(item.townSlug, existing);
		}

		return Array.from(townMap.values())
			.sort((a, b) => b.count - a.count)
			.slice(0, 5);
	});

	// Category breakdown — what types of stories are in the wire
	const categoryBreakdown = $derived.by(() => {
		const cats = new Map<string, number>();
		for (const item of news) {
			cats.set(item.category, (cats.get(item.category) || 0) + 1);
		}
		return Array.from(cats.entries())
			.sort(([, a], [, b]) => b - a)
			.map(([category, count]) => ({ category, count }));
	});

	// Fresh stories — most recent items in the last few hours
	const freshStories = $derived.by(() => {
		const fourHoursAgo = Date.now() - 4 * 60 * 60 * 1000;
		return news
			.filter((item) => item.timestamp > fourHoursAgo)
			.sort((a, b) => b.timestamp - a.timestamp)
			.slice(0, 6);
	});


	function categoryLabel(cat: string): string {
		const labels: Record<string, string> = {
			local: 'Local',
			safety: 'Safety',
			civic: 'Civic',
			outdoors: 'Outdoors',
			housing: 'Housing',
			cycling: 'Cycling',
			endurance: 'Endurance',
			shows: 'Events',
			prep: 'Sports',
			farm: 'Farm',
			satire: 'Satire'
		};
		return labels[cat] || cat;
	}

	const totalStories = $derived(news.length);
	const totalAlerts = $derived(activeAlerts.length);
	const totalTowns = $derived(new Set(news.filter((i) => i.townSlug).map((i) => i.townSlug)).size);
</script>

<Panel id="signals" title="Signals" {loading} {error}>
	{#if news.length === 0 && !loading && !error}
		<div class="empty-state">Waiting for data...</div>
	{:else}
		<div class="signals-content">
			<!-- Quick stats bar -->
			<div class="stats-bar">
				<div class="stat">
					<span class="stat-value">{totalStories}</span>
					<span class="stat-label">stories</span>
				</div>
				<div class="stat">
					<span class="stat-value" class:alert-color={totalAlerts > 0}>{totalAlerts}</span>
					<span class="stat-label">alerts</span>
				</div>
				<div class="stat">
					<span class="stat-value">{totalTowns}</span>
					<span class="stat-label">towns</span>
				</div>
				<div class="stat">
					<span class="stat-value">{categoryBreakdown.length}</span>
					<span class="stat-label">feeds</span>
				</div>
			</div>

			<!-- Active alerts (if any) -->
			{#if activeAlerts.length > 0}
				<section class="section">
					<div class="section-title alert-title">Active Alerts</div>
					{#each activeAlerts as alert}
						<a class="alert-row" href={alert.link} target="_blank" rel="noopener">
							<div class="alert-main">
								<span class="alert-text">{alert.title}</span>
								<span class="alert-meta">{alert.source} · {timeAgo(alert.timestamp)}</span>
							</div>
							{#if alert.alertKeyword}
								<Badge text={alert.alertKeyword.toUpperCase()} variant="danger" />
							{/if}
						</a>
					{/each}
				</section>
			{/if}

			<!-- Multi-source stories -->
			{#if multiSourceStories.length > 0}
				<section class="section">
					<div class="section-title">Multi-Source</div>
					{#each multiSourceStories as story}
						<a class="story-row" href={story.link} target="_blank" rel="noopener">
							<div class="story-title">{story.title}</div>
							<div class="story-meta">
								{story.sources.join(' · ')}
							</div>
						</a>
					{/each}
				</section>
			{/if}

			<!-- Town activity -->
			<section class="section">
				<div class="section-title">Town Activity</div>
				{#each townActivity as town}
					<div class="town-row">
						<div class="town-info">
							<span class="town-name">{town.name}</span>
							{#if town.alerts > 0}
								<span class="town-alerts">{town.alerts} alert{town.alerts > 1 ? 's' : ''}</span>
							{/if}
						</div>
						<div class="town-bar-wrap">
							<div
								class="town-bar"
								style="width: {Math.max(8, (town.count / (townActivity[0]?.count || 1)) * 100)}%"
							></div>
							<span class="town-count">{town.count}</span>
						</div>
					</div>
				{/each}
			</section>

			<!-- Fresh stories -->
			{#if freshStories.length > 0}
				<section class="section">
					<div class="section-title">Latest</div>
					{#each freshStories as story}
						<a class="fresh-row" href={story.link} target="_blank" rel="noopener">
							<span class="fresh-category">{categoryLabel(story.category)}</span>
							<span class="fresh-title">{story.title}</span>
							<span class="fresh-time">{timeAgo(story.timestamp)}</span>
						</a>
					{/each}
				</section>
			{/if}

			<!-- Feed mix -->
			<section class="section">
				<div class="section-title">Feed Mix</div>
				<div class="feed-mix">
					{#each categoryBreakdown as { category, count }}
						<div class="feed-chip">
							<span class="feed-name">{categoryLabel(category)}</span>
							<span class="feed-count">{count}</span>
						</div>
					{/each}
				</div>
			</section>
		</div>
	{/if}
</Panel>

<style>
	.signals-content {
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
	}

	.stats-bar {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: 0.35rem;
		padding-bottom: 0.5rem;
		border-bottom: 1px solid var(--border);
	}

	.stat {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.06rem;
	}

	.stat-value {
		font-size: 0.88rem;
		font-weight: 700;
		color: var(--text);
	}

	.stat-value.alert-color {
		color: #ef4444;
	}

	.stat-label {
		font-size: 0.48rem;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--text-muted);
	}

	.section {
		padding-bottom: 0.5rem;
		border-bottom: 1px solid var(--border);
	}

	.section:last-child {
		padding-bottom: 0;
		border-bottom: none;
	}

	.section-title {
		font-size: 0.56rem;
		font-weight: 600;
		color: var(--text-muted);
		text-transform: uppercase;
		letter-spacing: 0.06em;
		margin-bottom: 0.3rem;
	}

	.alert-title {
		color: #ef4444;
	}

	.alert-row {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 0.4rem;
		padding: 0.3rem 0.4rem;
		margin-bottom: 0.2rem;
		background: rgba(239, 68, 68, 0.06);
		border: 1px solid rgba(239, 68, 68, 0.15);
		border-radius: 3px;
		text-decoration: none;
		color: inherit;
	}

	.alert-row:hover {
		background: rgba(239, 68, 68, 0.12);
	}

	.alert-main {
		min-width: 0;
	}

	.alert-text {
		display: block;
		font-size: 0.6rem;
		color: var(--text);
		font-weight: 600;
		line-height: 1.3;
		overflow: hidden;
		text-overflow: ellipsis;
		display: -webkit-box;
		line-clamp: 2;
		-webkit-line-clamp: 2;
		-webkit-box-orient: vertical;
	}

	.alert-meta {
		display: block;
		font-size: 0.5rem;
		color: var(--text-muted);
		margin-top: 0.1rem;
	}

	.story-row {
		display: block;
		padding: 0.25rem 0;
		text-decoration: none;
		color: inherit;
		border-bottom: 1px solid rgba(255, 255, 255, 0.03);
	}

	.story-row:last-child {
		border-bottom: none;
	}

	.story-row:hover .story-title {
		color: var(--accent);
	}

	.story-title {
		font-size: 0.6rem;
		color: var(--text);
		font-weight: 500;
		line-height: 1.3;
		overflow: hidden;
		text-overflow: ellipsis;
		display: -webkit-box;
		line-clamp: 2;
		-webkit-line-clamp: 2;
		-webkit-box-orient: vertical;
	}

	.story-meta {
		font-size: 0.5rem;
		color: var(--text-dim);
		margin-top: 0.08rem;
	}

	.town-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
		padding: 0.2rem 0;
	}

	.town-info {
		display: flex;
		align-items: baseline;
		gap: 0.35rem;
		min-width: 0;
		flex-shrink: 0;
	}

	.town-name {
		font-size: 0.6rem;
		color: var(--text);
		font-weight: 600;
		white-space: nowrap;
	}

	.town-alerts {
		font-size: 0.48rem;
		color: #ef4444;
		white-space: nowrap;
	}

	.town-bar-wrap {
		flex: 1;
		display: flex;
		align-items: center;
		gap: 0.3rem;
		min-width: 0;
	}

	.town-bar {
		height: 4px;
		background: var(--accent);
		opacity: 0.5;
		border-radius: 2px;
		flex-shrink: 1;
		min-width: 4px;
	}

	.town-count {
		font-size: 0.58rem;
		font-weight: 700;
		color: var(--text-secondary);
		flex-shrink: 0;
	}

	.fresh-row {
		display: grid;
		grid-template-columns: 52px minmax(0, 1fr) auto;
		gap: 0.35rem;
		align-items: baseline;
		padding: 0.22rem 0;
		text-decoration: none;
		color: inherit;
		border-bottom: 1px solid rgba(255, 255, 255, 0.03);
	}

	.fresh-row:last-child {
		border-bottom: none;
	}

	.fresh-row:hover .fresh-title {
		color: var(--accent);
	}

	.fresh-category {
		font-size: 0.48rem;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--text-dim);
		font-weight: 600;
	}

	.fresh-title {
		font-size: 0.58rem;
		color: var(--text-secondary);
		line-height: 1.3;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.fresh-time {
		font-size: 0.48rem;
		color: var(--text-muted);
		white-space: nowrap;
	}

	.feed-mix {
		display: flex;
		flex-wrap: wrap;
		gap: 0.25rem;
	}

	.feed-chip {
		display: flex;
		align-items: center;
		gap: 0.2rem;
		padding: 0.15rem 0.35rem;
		background: rgba(255, 255, 255, 0.04);
		border-radius: 3px;
		font-size: 0.52rem;
	}

	.feed-name {
		color: var(--text-secondary);
	}

	.feed-count {
		color: var(--text-muted);
		font-weight: 700;
	}

	.empty-state {
		text-align: center;
		color: var(--text-secondary);
		font-size: 0.7rem;
		padding: 1rem;
	}
</style>

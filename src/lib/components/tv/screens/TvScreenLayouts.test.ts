import { render } from '@testing-library/svelte';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import TvCameraClusterScreen from './TvCameraClusterScreen.svelte';
import Tv311PhotoWall from './Tv311PhotoWall.svelte';
import type { NewsItem } from '$lib/types';

vi.mock('$lib/config/cameras', () => ({
	CAMERAS: Array.from({ length: 8 }, (_, index) => ({
		id: `cam-${index + 1}`,
		name: `Camera ${index + 1}`,
		location: `Location ${index + 1}`,
		category: 'scenic',
		type: 'image',
		url: `https://example.com/${index + 1}.jpg`,
		source: 'Test Source',
		order: index + 1,
		tvCluster: 'tam-coast'
	}))
}));

vi.mock('$lib/config/tv', () => ({
	TV_CAMERA_CLUSTERS: [{ id: 'tam-coast', label: 'Tam & Coast' }]
}));

beforeAll(() => {
	class ResizeObserverMock {
		observe() {}
		disconnect() {}
		unobserve() {}
	}

	vi.stubGlobal('ResizeObserver', ResizeObserverMock);
});

const now = Date.now();
const photoItems: NewsItem[] = Array.from({ length: 6 }, (_, index) => ({
	id: `311-${index + 1}`,
	title: `Pothole/Road Condition · Street ${index + 1}`,
	link: `https://example.com/${index + 1}`,
	timestamp: now - index * 60_000,
	source: 'Fix It Marin',
	category: '311',
	verification: 'official',
	town: 'San Rafael',
	imageUrl: `https://example.com/image-${index + 1}.jpg`
}));

const densePhotoItems: NewsItem[] = Array.from({ length: 12 }, (_, index) => ({
	id: `311-dense-${index + 1}`,
	title: `Illegal Dumping · Street ${index + 1}`,
	link: `https://example.com/dense-${index + 1}`,
	timestamp: now - index * 120_000,
	source: 'Fix It Marin',
	category: '311',
	verification: 'official',
	town: 'Novato',
	imageUrl: `https://example.com/dense-image-${index + 1}.jpg`
}));

describe('tv layout regressions', () => {
	it('renders a constrained two-row camera grid with eight cells', () => {
		const { container } = render(TvCameraClusterScreen, {
			props: {
				clusterId: 'tam-coast'
			}
		});

		const grid = container.querySelector('.grid');
		expect(grid?.className).toContain('grid-rows-2');
		expect(grid?.className).toContain('overflow-hidden');
		expect(grid?.children).toHaveLength(8);

		for (const cell of Array.from(grid?.children ?? [])) {
			expect((cell as HTMLElement).className).toContain('overflow-hidden');
		}
	});

	it('uses shorter 16:9 photo cards and a three-column grid for fix-it marin', () => {
		const { container } = render(Tv311PhotoWall, {
			props: {
				items: photoItems,
				active: false
			}
		});

		const grid = container.querySelector('.grid') as HTMLElement | null;
		expect(grid?.style.gridTemplateColumns).toBe('repeat(3, minmax(0, 1fr))');

		const firstImage = container.querySelector('img');
		expect(firstImage?.parentElement?.className).toContain('aspect-[16/9]');

		const root = container.firstElementChild as HTMLElement | null;
		expect(root?.className).toContain('overflow-hidden');
	});

	it('switches to four columns when there are enough fix-it marin photos', () => {
		const { container } = render(Tv311PhotoWall, {
			props: {
				items: densePhotoItems,
				active: false
			}
		});

		const grid = container.querySelector('.grid') as HTMLElement | null;
		expect(grid?.style.gridTemplateColumns).toBe('repeat(4, minmax(0, 1fr))');
	});
});

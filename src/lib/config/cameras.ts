import type { TvCameraCluster } from './tv';

/**
 * Webcam configuration for Marin Monitor
 *
 * Camera types:
 * - 'image': Static JPEG that refreshes on a timer (Caltrans, ABC7)
 * - 'youtube': YouTube Live embed (iframe)
 * - 'iframe': Third-party embed (IPCamLive, Windy, ALERTCalifornia)
 *
 * Categories:
 * - 'traffic': Highway and road cameras
 * - 'scenic': Landscape, bridge, and beach views
 * - 'fire': ALERTCalifornia wildfire detection cameras
 */

export type CameraCategory = 'traffic' | 'scenic' | 'fire';
export type FireSubRegion = 'south' | 'central' | 'west' | 'north';

export interface CameraConfig {
	id: string;
	name: string;
	location: string;
	category: CameraCategory;
	type: 'image' | 'youtube' | 'iframe';
	/** URL for the image src or iframe src */
	url: string;
	/** Refresh interval in seconds (image type only) */
	refreshInterval?: number;
	/** YouTube video ID (youtube type only) */
	youtubeId?: string;
	/** Source attribution */
	source: string;
	/** Sort order within category */
	order: number;
	/** Fire camera sub-region for grouping in expanded view */
	subRegion?: FireSubRegion;
	/** Camera latitude */
	lat?: number;
	/** Camera longitude */
	lon?: number;
	/** TV carousel geographic cluster */
	tvCluster?: TvCameraCluster;
}

export const CAMERA_CATEGORIES: { id: CameraCategory; label: string }[] = [
	{ id: 'traffic', label: 'Traffic' },
	{ id: 'scenic', label: 'Scenic' },
	{ id: 'fire', label: 'Fire' }
];

export const FIRE_SUB_REGIONS: { id: FireSubRegion; label: string }[] = [
	{ id: 'south', label: 'South Marin' },
	{ id: 'central', label: 'Central Marin' },
	{ id: 'west', label: 'West Marin' },
	{ id: 'north', label: 'North Marin' }
];

function alertCamUrl(axisId: string): string {
	return `https://cameras.alertcalifornia.org/public-camera-data/${axisId}/latest-frame.jpg`;
}

export const CAMERAS: CameraConfig[] = [
	// ── Traffic: Caltrans 101 freeway cameras (static JPEG) ──
	{
		id: 'caltrans-spencer',
		name: '101 at Spencer Ave',
		location: 'Sausalito',
		category: 'traffic',
		type: 'image',
		url: 'https://cwwp2.dot.ca.gov/data/d4/cctv/image/tve73us101spenceravenue/tve73us101spenceravenue.jpg',
		refreshInterval: 10,
		source: 'Caltrans',
		order: 1,
		tvCluster: 'central-highway'
	},
	{
		id: 'caltrans-sr1',
		name: '101 at SR-1',
		location: 'Mill Valley',
		category: 'traffic',
		type: 'image',
		url: 'https://cwwp2.dot.ca.gov/data/d4/cctv/image/tve75us101marinsr1/tve75us101marinsr1.jpg',
		refreshInterval: 10,
		source: 'Caltrans',
		order: 2,
		tvCluster: 'central-highway'
	},
	{
		id: 'caltrans-580',
		name: '101 at I-580',
		location: 'San Rafael',
		category: 'traffic',
		type: 'image',
		url: 'https://cwwp2.dot.ca.gov/data/d4/cctv/image/tve83us101i580/tve83us101i580.jpg',
		refreshInterval: 10,
		source: 'Caltrans',
		order: 3,
		tvCluster: 'central-highway'
	},
	{
		id: 'caltrans-ignacio',
		name: '101 at Ignacio Blvd',
		location: 'Novato',
		category: 'traffic',
		type: 'image',
		url: 'https://cwwp2.dot.ca.gov/data/d4/cctv/image/tve86us101ignacioblvd/tve86us101ignacioblvd.jpg',
		refreshInterval: 10,
		source: 'Caltrans',
		order: 4,
		tvCluster: 'central-highway'
	},

	// ── Scenic: Landscape and bridge views ──
	{
		id: 'abc7-tam',
		name: 'Mt. Tamalpais Summit',
		location: 'Mt. Tam',
		category: 'scenic',
		type: 'image',
		url: 'https://cdns.abclocal.go.com/three/kgo/webcam/tam.jpg?w=600',
		refreshInterval: 60,
		source: 'ABC7 / KGO',
		order: 1,
		tvCluster: 'tam-coast'
	},
	{
		id: 'windy-tiburon',
		name: 'Golden Gate & Bay View',
		location: 'Tiburon',
		category: 'scenic',
		type: 'iframe',
		url: 'https://webcams.windy.com/webcams/public/embed/player/1468687535/live',
		source: 'Windy.com',
		order: 2,
		tvCluster: 'tam-coast'
	},
	{
		id: 'windy-muir',
		name: 'Muir Beach',
		location: 'Muir Beach',
		category: 'scenic',
		type: 'iframe',
		url: 'https://webcams.windy.com/webcams/public/embed/player/1185292026/live',
		source: 'Windy.com',
		order: 3,
		tvCluster: 'tam-coast'
	},

	// ── Fire: ALERTCalifornia wildfire detection cameras ──

	// South Marin (5)
	{
		id: 'alert-tam-east',
		name: 'Mt. Tam East',
		location: 'Mt. Tamalpais',
		category: 'fire',
		subRegion: 'south',
		type: 'image',
		url: alertCamUrl('Axis-TamEast'),
		refreshInterval: 10,
		source: 'ALERTCalifornia',
		order: 1,
		lat: 37.9235,
		lon: -122.5816,
		tvCluster: 'tam-coast'
	},
	{
		id: 'alert-tam-west',
		name: 'Mt. Tam West',
		location: 'Mt. Tamalpais',
		category: 'fire',
		subRegion: 'south',
		type: 'image',
		url: alertCamUrl('Axis-TamWest'),
		refreshInterval: 10,
		source: 'ALERTCalifornia',
		order: 2,
		lat: 37.9235,
		lon: -122.5816,
		tvCluster: 'tam-coast'
	},
	{
		id: 'alert-muir-beach',
		name: 'Muir Beach',
		location: 'Muir Beach',
		category: 'fire',
		subRegion: 'south',
		type: 'image',
		url: alertCamUrl('Axis-MuirBeach'),
		refreshInterval: 10,
		source: 'ALERTCalifornia',
		order: 3,
		lat: 37.8592,
		lon: -122.5784,
		tvCluster: 'tam-coast'
	},
	{
		id: 'alert-wolfback-ridge',
		name: 'Wolfback Ridge',
		location: 'Sausalito',
		category: 'fire',
		subRegion: 'south',
		type: 'image',
		url: alertCamUrl('Axis-WolfbackRidge'),
		refreshInterval: 10,
		source: 'ALERTCalifornia',
		order: 4,
		lat: 37.8529,
		lon: -122.5103,
		tvCluster: 'tam-coast'
	},
	{
		id: 'alert-bolinas',
		name: 'Bolinas',
		location: 'Bolinas',
		category: 'fire',
		subRegion: 'south',
		type: 'image',
		url: alertCamUrl('Axis-Bolinas'),
		refreshInterval: 10,
		source: 'ALERTCalifornia',
		order: 5,
		lat: 37.9093,
		lon: -122.6869,
		tvCluster: 'tam-coast'
	},

	// Central Marin (4)
	{
		id: 'alert-san-pedro',
		name: 'San Pedro',
		location: 'San Rafael',
		category: 'fire',
		subRegion: 'central',
		type: 'image',
		url: alertCamUrl('Axis-SanPedro'),
		refreshInterval: 10,
		source: 'ALERTCalifornia',
		order: 6,
		lat: 37.9962,
		lon: -122.5343,
		tvCluster: 'central-highway'
	},
	{
		id: 'alert-san-rafael-hill',
		name: 'San Rafael Hill',
		location: 'San Rafael',
		category: 'fire',
		subRegion: 'central',
		type: 'image',
		url: alertCamUrl('Axis-SanRafaelHill1'),
		refreshInterval: 10,
		source: 'ALERTCalifornia',
		order: 7,
		lat: 37.9735,
		lon: -122.5311,
		tvCluster: 'central-highway'
	},
	{
		id: 'alert-big-rock',
		name: 'Big Rock',
		location: 'Lucas Valley',
		category: 'fire',
		subRegion: 'central',
		type: 'image',
		url: alertCamUrl('Axis-BigRock'),
		refreshInterval: 10,
		source: 'ALERTCalifornia',
		order: 8,
		lat: 38.0303,
		lon: -122.5944,
		tvCluster: 'central-highway'
	},
	{
		id: 'alert-big-rock-2',
		name: 'Big Rock 2',
		location: 'Lucas Valley',
		category: 'fire',
		subRegion: 'central',
		type: 'image',
		url: alertCamUrl('Axis-BigRock2'),
		refreshInterval: 10,
		source: 'ALERTCalifornia',
		order: 9,
		lat: 38.0303,
		lon: -122.5944,
		tvCluster: 'central-highway'
	},

	// West Marin (4)
	{
		id: 'alert-barnabe-east',
		name: 'Barnabe East',
		location: 'Samuel P. Taylor',
		category: 'fire',
		subRegion: 'west',
		type: 'image',
		url: alertCamUrl('Axis-BarnabeEast'),
		refreshInterval: 10,
		source: 'ALERTCalifornia',
		order: 10,
		lat: 38.0256,
		lon: -122.7218,
		tvCluster: 'west-north'
	},
	{
		id: 'alert-barnabe-west',
		name: 'Barnabe West',
		location: 'Samuel P. Taylor',
		category: 'fire',
		subRegion: 'west',
		type: 'image',
		url: alertCamUrl('Axis-BarnabeWest'),
		refreshInterval: 10,
		source: 'ALERTCalifornia',
		order: 11,
		lat: 38.0256,
		lon: -122.7218,
		tvCluster: 'west-north'
	},
	{
		id: 'alert-black-mtn',
		name: 'Black Mountain',
		location: 'Point Reyes Station',
		category: 'fire',
		subRegion: 'west',
		type: 'image',
		url: alertCamUrl('Axis-BlackMtnMarin'),
		refreshInterval: 10,
		source: 'ALERTCalifornia',
		order: 12,
		lat: 38.0706,
		lon: -122.7896,
		tvCluster: 'west-north'
	},
	{
		id: 'alert-vision',
		name: 'Vision',
		location: 'Inverness',
		category: 'fire',
		subRegion: 'west',
		type: 'image',
		url: alertCamUrl('Axis-Vision'),
		refreshInterval: 10,
		source: 'ALERTCalifornia',
		order: 13,
		lat: 38.0976,
		lon: -122.8479,
		tvCluster: 'west-north'
	},

	// North Marin (4)
	{
		id: 'alert-burdell',
		name: 'Burdell',
		location: 'Novato',
		category: 'fire',
		subRegion: 'north',
		type: 'image',
		url: alertCamUrl('Axis-Burdell'),
		refreshInterval: 10,
		source: 'ALERTCalifornia',
		order: 14,
		lat: 38.1479,
		lon: -122.5618,
		tvCluster: 'west-north'
	},
	{
		id: 'alert-burdell-2',
		name: 'Burdell 2',
		location: 'Novato',
		category: 'fire',
		subRegion: 'north',
		type: 'image',
		url: alertCamUrl('Axis-Burdell2'),
		refreshInterval: 10,
		source: 'ALERTCalifornia',
		order: 15,
		lat: 38.1479,
		lon: -122.5618,
		tvCluster: 'west-north'
	},
	{
		id: 'alert-mt-burdell-south',
		name: 'Mt. Burdell South',
		location: 'Novato',
		category: 'fire',
		subRegion: 'north',
		type: 'image',
		url: alertCamUrl('Axis-MtBurdellSouth1'),
		refreshInterval: 10,
		source: 'ALERTCalifornia',
		order: 16,
		lat: 38.1479,
		lon: -122.5618,
		tvCluster: 'west-north'
	},
	{
		id: 'alert-league-221',
		name: 'League 221',
		location: 'Novato',
		category: 'fire',
		subRegion: 'north',
		type: 'image',
		url: alertCamUrl('Axis-League221'),
		refreshInterval: 10,
		source: 'ALERTCalifornia',
		order: 17,
		lat: 38.1195,
		lon: -122.5965,
		tvCluster: 'west-north'
	}
];

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
}

export const CAMERA_CATEGORIES: { id: CameraCategory; label: string }[] = [
	{ id: 'traffic', label: 'Traffic' },
	{ id: 'scenic', label: 'Scenic' },
	{ id: 'fire', label: 'Fire' }
];

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
		order: 1
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
		order: 2
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
		order: 3
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
		order: 4
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
		order: 1
	},
	{
		id: 'windy-tiburon',
		name: 'Golden Gate & Bay View',
		location: 'Tiburon',
		category: 'scenic',
		type: 'iframe',
		url: 'https://webcams.windy.com/webcams/public/embed/player/1468687535/live',
		source: 'Windy.com',
		order: 2
	},
	{
		id: 'windy-muir',
		name: 'Muir Beach',
		location: 'Muir Beach',
		category: 'scenic',
		type: 'iframe',
		url: 'https://webcams.windy.com/webcams/public/embed/player/1185292026/live',
		source: 'Windy.com',
		order: 3
	},

	// ── Fire: ALERTCalifornia wildfire detection cameras (public CDN snapshots) ──
	{
		id: 'alert-tam-east',
		name: 'Mt. Tam East',
		location: 'Mt. Tamalpais',
		category: 'fire',
		type: 'image',
		url: 'https://cameras.alertcalifornia.org/public-camera-data/Axis-TamEast/latest-frame.jpg',
		refreshInterval: 10,
		source: 'ALERTCalifornia',
		order: 1
	},
	{
		id: 'alert-tam-west',
		name: 'Mt. Tam West',
		location: 'Mt. Tamalpais',
		category: 'fire',
		type: 'image',
		url: 'https://cameras.alertcalifornia.org/public-camera-data/Axis-TamWest/latest-frame.jpg',
		refreshInterval: 10,
		source: 'ALERTCalifornia',
		order: 2
	}
];

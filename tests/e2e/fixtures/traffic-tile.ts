/**
 * A Mapbox Traffic v1 vector tile, encoded by hand (Mapbox Vector Tile spec 2.1): one `traffic`
 * layer of line segments, each tagged with its `congestion`. Every tile served carries the same
 * segments, so whatever the view, the map draws them (TRAFFIC1).
 */
const EXTENT = 4096;

const varint = (n: number): number[] => {
	const out: number[] = [];
	while (n > 0x7f) {
		out.push((n & 0x7f) | 0x80);
		n >>>= 7;
	}
	return [...out, n];
};
const zigzag = (n: number) => (n << 1) ^ (n >> 31);
const field = (n: number, wire: 0 | 2) => varint((n << 3) | wire);
const bytes = (n: number, body: number[]) => [...field(n, 2), ...varint(body.length), ...body];
const uint = (n: number, v: number) => [...field(n, 0), ...varint(v)];
const text = (n: number, s: string) => bytes(n, [...Buffer.from(s, 'utf8')]);
const packed = (n: number, vs: number[]) => bytes(n, vs.flatMap(varint));

/** A straight segment from `a` to `b`, in tile units (0..4096). */
export interface Segment {
	congestion: 'low' | 'moderate' | 'heavy' | 'severe';
	a: [number, number];
	b: [number, number];
}

export function trafficTile(segments: Segment[]): Buffer {
	const values = [...new Set(segments.map((s) => s.congestion))];
	const features = segments.map(({ congestion, a, b }) =>
		bytes(2, [
			...packed(2, [0, values.indexOf(congestion)]), // tags: key 0 (congestion) = value i
			...uint(3, 2), // LINESTRING
			...packed(4, [
				(1 << 3) | 1, // MoveTo ×1
				zigzag(a[0]),
				zigzag(a[1]),
				(1 << 3) | 2, // LineTo ×1
				zigzag(b[0] - a[0]),
				zigzag(b[1] - a[1])
			])
		])
	);
	const layer = [
		...uint(15, 2),
		...text(1, 'traffic'),
		...features.flat(),
		...text(3, 'congestion'),
		...values.flatMap((v) => bytes(4, text(1, v))),
		...uint(5, EXTENT)
	];
	return Buffer.from(bytes(3, layer));
}

/** Free flow across every tile: a road through the middle each way. */
export const FREE_FLOW_TILE = trafficTile([
	{ congestion: 'low', a: [0, EXTENT / 2], b: [EXTENT, EXTENT / 2] },
	{ congestion: 'low', a: [EXTENT / 2, 0], b: [EXTENT / 2, EXTENT] }
]);

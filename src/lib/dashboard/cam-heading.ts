/**
 * Which way each ALERTCalifornia camera looks (MAPX4): the feed's last reported azimuth and
 * field of view, and what we may say and draw from them. Positions are ours (`cameras.ts`);
 * the feed's are rounded to ~1 km. The heading is as of the feed's read, never the picture's:
 * their frames carry no capture time we can read (no CORS), so the two are never matched.
 */
import { CAMERAS } from '$lib/config/cameras';
import { formatAsOf } from './pacific-time';

export interface CamHeading {
	/** Our camera id (`cameras.ts`). */
	id: string;
	/** Degrees clockwise from north, in [0, 360); null when the feed has none. */
	az: number | null;
	fov: number | null;
	patrolling: boolean;
	/** The feed's last frame time (ms), or null. */
	frameAt: number | null;
}

/** `GET /api/cams/heading`: the cams plus when we read the feed. */
export interface HeadingRead {
	headingAt: number;
	cams: CamHeading[];
}

/** A wedge is drawn only while its camera's last frame is this fresh. */
export const FRAME_FRESH_MS = 5 * 60_000;

const AXIS = /\/public-camera-data\/([^/]+)\/latest-frame\.jpg$/;

/** The feed's Axis id → our id, for every configured ALERTCalifornia camera. */
export const ALERT_AXIS_IDS: ReadonlyMap<string, string> = new Map(
	CAMERAS.flatMap((c) => {
		const m = AXIS.exec(c.url);
		return m ? [[m[1], c.id] as const] : [];
	})
);

export class HeadingFeedError extends Error {}

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const norm = (deg: number) => ((deg % 360) + 360) % 360;

/** The feed (`all_cameras-v3.json`) cut to our cameras; a shape we don't know throws. */
export function parseHeadingFeed(json: unknown): CamHeading[] {
	const features = (json as { features?: unknown } | null)?.features;
	if (!Array.isArray(features)) throw new HeadingFeedError('feed has no features array');
	const out: CamHeading[] = [];
	for (const f of features) {
		const p = (f as { properties?: Record<string, unknown> } | null)?.properties;
		const id = typeof p?.id === 'string' ? ALERT_AXIS_IDS.get(p.id) : undefined;
		if (!p || !id) continue;
		for (const key of ['az_current', 'last_frame_ts'])
			if (!(key in p)) throw new HeadingFeedError(`${p.id} has no ${key}`);
		const az = num(p.az_current);
		const fov = num(p.fov);
		const frameS = num(p.last_frame_ts);
		out.push({
			id,
			az: az === null ? null : norm(az),
			fov: fov !== null && fov > 0 ? fov : null,
			patrolling: p.is_patrol_mode === 1 || p.is_currently_patrolling === 1,
			frameAt: frameS === null ? null : frameS * 1000
		});
	}
	if (!out.length)
		throw new HeadingFeedError(`none of the ${ALERT_AXIS_IDS.size} Marin cameras is in the feed`);
	return out;
}

const POINTS = 'N NNE NE ENE E ESE SE SSE S SSW SW WSW W WNW NW NNW'.split(' ');

export function compass16(az: number): string {
	return POINTS[Math.round(norm(az) / 22.5) % 16];
}

const degrees = (az: number) => `${Math.round(az) % 360}°`;

/** The cam tile's footer; null (no footer) without a reported heading. */
export function headingFooter(h: CamHeading | undefined): string | null {
	if (!h) return null;
	if (h.patrolling) return 'Sweeping';
	return h.az === null ? null : `Looking ${compass16(h.az)} · ${degrees(h.az)}`;
}

/** The drawer's line: the last reported heading and when we read it, never the picture's. */
export function headingLine(
	h: CamHeading | undefined,
	headingAt: number | null,
	now: number
): string {
	if (!h || headingAt === null) return 'Heading unavailable';
	const at = formatAsOf(headingAt, now);
	if (h.patrolling) return `Last reported heading: sweeping (patrol) · ${at}`;
	if (h.az === null) return 'Heading not reported';
	return `Last reported heading: ${compass16(h.az)} (${degrees(h.az)}) · ${at}`;
}

/** Solid when still and fresh, dashed while patrolling, not drawn otherwise. */
export function wedgeState(h: CamHeading, now: number): 'solid' | 'sweeping' | null {
	if (h.az === null || h.fov === null || h.frameAt === null) return null;
	if (now - h.frameAt > FRAME_FRESH_MS) return null;
	return h.patrolling ? 'sweeping' : 'solid';
}

const EARTH_KM = 6371;
const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

/** The point `km` from `origin` along `bearing` (great circle). */
function destination([lon, lat]: [number, number], bearing: number, km: number): [number, number] {
	const δ = km / EARTH_KM;
	const θ = rad(bearing);
	const φ1 = rad(lat);
	const φ2 = Math.asin(Math.sin(φ1) * Math.cos(δ) + Math.cos(φ1) * Math.sin(δ) * Math.cos(θ));
	const λ2 =
		rad(lon) +
		Math.atan2(Math.sin(θ) * Math.sin(δ) * Math.cos(φ1), Math.cos(δ) - Math.sin(φ1) * Math.sin(φ2));
	return [deg(λ2), deg(φ2)];
}

/**
 * A view wedge: the camera, an arc `km` out across `az ± fov/2`, and back. The radius is a
 * display convention, not how far the camera sees.
 */
export function sector(
	origin: [number, number],
	az: number,
	fov: number,
	km: number
): GeoJSON.Polygon {
	const steps = Math.max(2, Math.ceil(fov / 5));
	const arc = Array.from({ length: steps + 1 }, (_, i) =>
		destination(origin, az - fov / 2 + (fov * i) / steps, km)
	);
	return { type: 'Polygon', coordinates: [[origin, ...arc, origin]] };
}

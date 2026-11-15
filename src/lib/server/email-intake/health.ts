/**
 * /api/health's word on the intake: when the last email arrived, as information only. Silence
 * isn't proof of breakage and a delivery isn't proof of health, so it is never a source verdict.
 */
import { lastEmailReceived } from './store';
import { vercelBlobLister } from './vercel-lister';

export type EmailIntakeInformation = { lastEmailReceivedAt: string | null; readable?: false };

export async function emailIntakeInformation(token: string): Promise<EmailIntakeInformation> {
	try {
		if (!token) throw new Error('no token');
		return {
			lastEmailReceivedAt: await lastEmailReceived(
				vercelBlobLister(token),
				AbortSignal.timeout(3_000)
			)
		};
	} catch {
		return { lastEmailReceivedAt: null, readable: false };
	}
}

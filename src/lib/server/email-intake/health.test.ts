// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

const mockList = vi.fn();
vi.mock('./vercel-lister', () => ({ vercelBlobLister: () => ({ list: mockList }) }));
const { emailIntakeInformation } = await import('./health');

describe('emailIntakeInformation', () => {
	it('names the newest stored email’s arrival', async () => {
		mockList.mockResolvedValue([
			{ key: 'a', uploadedAt: '2026-11-13T19:02:40.000Z' },
			{ key: 'b', uploadedAt: '2026-11-04T14:48:20.000Z' }
		]);
		expect(await emailIntakeInformation('tok')).toEqual({
			lastEmailReceivedAt: '2026-11-13T19:02:40.000Z'
		});
	});

	it('an unreadable store says so, without throwing', async () => {
		mockList.mockRejectedValue(new Error('down'));
		expect(await emailIntakeInformation('tok')).toEqual({
			lastEmailReceivedAt: null,
			readable: false
		});
		expect(await emailIntakeInformation('')).toEqual({
			lastEmailReceivedAt: null,
			readable: false
		});
	});
});

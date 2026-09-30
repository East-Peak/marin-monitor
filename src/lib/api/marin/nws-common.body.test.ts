// The REAL grid lookup (not mocked): the owner and the deadline must reach a /points
// request whose body is still arriving (Codex r3 #2).
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getGridPoint } from './nws-common';

afterEach(() => {
	vi.useRealTimers();
	vi.unstubAllGlobals();
});

function stallBody() {
	const seen: AbortSignal[] = [];
	vi.stubGlobal(
		'fetch',
		vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
			const signal = init!.signal!;
			seen.push(signal);
			return {
				ok: true,
				status: 200,
				json: () =>
					new Promise((_, reject) =>
						signal.addEventListener('abort', () =>
							reject(new DOMException('aborted', 'AbortError'))
						)
					)
			} as unknown as Response;
		})
	);
	return seen;
}

describe('getGridPoint body consumption', () => {
	it("the owner's abort cancels the /points request while its body is pending", async () => {
		const seen = stallBody();
		const owner = new AbortController();
		const pending = getGridPoint(37.91, -122.51, owner.signal); // coordinates unique to this test (the grid cache)
		await vi.waitFor(() => expect(seen).toHaveLength(1));
		owner.abort();
		await expect(pending).rejects.toThrow(/abort/i);
		expect(seen[0].aborted).toBe(true);
	});
	it('the deadline cancels the /points request while its body is pending', async () => {
		vi.useFakeTimers();
		const seen = stallBody();
		const settled = expect(getGridPoint(37.92, -122.52)).rejects.toThrow(/abort/i);
		await vi.advanceTimersByTimeAsync(10_001); // fetchAndRead's default deadline
		await settled;
		expect(seen[0].aborted).toBe(true);
	});
});

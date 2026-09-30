/**
 * One rule for every dashboard network operation (dashboard spec §13.7):
 * a deadline that covers the whole operation (headers AND body) plus the
 * owner's lifetime. The operation gets its own signal, aborted by either;
 * the race also settles work that ignores its signal.
 */
export const DEFAULT_OP_DEADLINE_MS = 15_000;

export async function boundedOp<T>(
	label: string,
	run: (signal: AbortSignal) => Promise<T>,
	options: { owner?: AbortSignal; timeoutMs?: number } = {}
): Promise<T> {
	const { owner } = options;
	if (owner?.aborted) throw new Error(`${label}: aborted`);
	const timeoutMs = options.timeoutMs ?? DEFAULT_OP_DEADLINE_MS;
	const op = new AbortController();
	let timer: ReturnType<typeof setTimeout> | undefined;
	let onOwnerAbort: (() => void) | undefined;
	const stop = new Promise<never>((_, reject) => {
		timer = setTimeout(() => {
			op.abort();
			reject(new Error(`${label}: timed out after ${timeoutMs} ms`));
		}, timeoutMs);
		onOwnerAbort = () => {
			op.abort();
			reject(new Error(`${label}: aborted`));
		};
		owner?.addEventListener('abort', onOwnerAbort, { once: true });
	});
	try {
		return await Promise.race([run(op.signal), stop]);
	} finally {
		clearTimeout(timer);
		if (onOwnerAbort) owner?.removeEventListener('abort', onOwnerAbort);
	}
}

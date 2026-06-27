/**
 * Standard error Response for cron sync endpoints.
 *
 * Logs the full error detail server-side (where it's useful for debugging) but
 * returns a GENERIC message to the caller, so internal error strings — DB hosts,
 * stack details, upstream URLs — are never echoed in the HTTP response
 * (CodeQL js/stack-trace-exposure). The cron caller only needs ok/!ok + status.
 */
export function cronErrorResponse(tag: string, err: unknown, startMs: number): Response {
	// Log the full Error (incl. stack) server-side — generic body, but useful logs.
	console.error(
		`[${tag}] FAILED after ${Date.now() - startMs}ms:`,
		err instanceof Error ? err : String(err)
	);
	return new Response(JSON.stringify({ ok: false, error: 'sync failed' }), {
		status: 500,
		headers: { 'Content-Type': 'application/json' }
	});
}

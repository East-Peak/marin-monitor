import { timingSafeEqual } from 'node:crypto';

function toBuffer(value: string): Buffer {
	return Buffer.from(value, 'utf8');
}

export function safeEquals(
	expected: string | null | undefined,
	actual: string | null | undefined
): boolean {
	if (!expected || !actual) return false;
	const expectedBuf = toBuffer(expected);
	const actualBuf = toBuffer(actual);
	if (expectedBuf.length !== actualBuf.length) return false;
	return timingSafeEqual(expectedBuf, actualBuf);
}

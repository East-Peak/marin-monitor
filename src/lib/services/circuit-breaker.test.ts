import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { CircuitBreaker, CircuitBreakerRegistry, CircuitBreakerStates } from './circuit-breaker';

describe('CircuitBreaker', () => {
	let breaker: CircuitBreaker;

	beforeEach(() => {
		vi.restoreAllMocks();
		vi.spyOn(console, 'log').mockImplementation(() => {});
		vi.spyOn(console, 'warn').mockImplementation(() => {});

		breaker = new CircuitBreaker('test-service', {
			failureThreshold: 3,
			resetTimeout: 1000,
			halfOpenMaxRequests: 1
		});
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe('initial state', () => {
		it('should start in CLOSED state', () => {
			expect(breaker.state).toBe(CircuitBreakerStates.CLOSED);
		});

		it('should allow requests when CLOSED', () => {
			expect(breaker.canRequest()).toBe(true);
		});
	});

	describe('failure tracking', () => {
		it('should remain CLOSED below failure threshold', () => {
			breaker.recordFailure();
			breaker.recordFailure();

			expect(breaker.state).toBe(CircuitBreakerStates.CLOSED);
			expect(breaker.canRequest()).toBe(true);
		});

		it('should transition to OPEN after reaching failure threshold', () => {
			breaker.recordFailure();
			breaker.recordFailure();
			breaker.recordFailure();

			expect(breaker.state).toBe(CircuitBreakerStates.OPEN);
			expect(breaker.canRequest()).toBe(false);
		});
	});

	describe('success tracking', () => {
		it('should reset failure count on success', () => {
			breaker.recordFailure();
			breaker.recordFailure();
			breaker.recordSuccess();

			const state = breaker.getState();
			expect(state.failures).toBe(0);
		});
	});

	describe('recovery', () => {
		it('should transition to HALF_OPEN after reset timeout', () => {
			vi.useFakeTimers();

			// Open the circuit
			breaker.recordFailure();
			breaker.recordFailure();
			breaker.recordFailure();

			expect(breaker.state).toBe(CircuitBreakerStates.OPEN);

			// Fast forward past reset timeout
			vi.advanceTimersByTime(1500);

			// canRequest() should transition to HALF_OPEN
			expect(breaker.canRequest()).toBe(true);
			expect(breaker.state).toBe(CircuitBreakerStates.HALF_OPEN);

			vi.useRealTimers();
		});

		it('should transition to CLOSED on success in HALF_OPEN', () => {
			vi.useFakeTimers();

			// Open and wait for HALF_OPEN
			breaker.recordFailure();
			breaker.recordFailure();
			breaker.recordFailure();
			vi.advanceTimersByTime(1500);
			breaker.canRequest();

			// Record success
			breaker.recordSuccess();

			expect(breaker.state).toBe(CircuitBreakerStates.CLOSED);

			vi.useRealTimers();
		});

		it('should transition back to OPEN on failure in HALF_OPEN', () => {
			vi.useFakeTimers();

			// Open and wait for HALF_OPEN
			breaker.recordFailure();
			breaker.recordFailure();
			breaker.recordFailure();
			vi.advanceTimersByTime(1500);
			breaker.canRequest();

			// Record failure
			breaker.recordFailure();

			expect(breaker.state).toBe(CircuitBreakerStates.OPEN);

			vi.useRealTimers();
		});
	});

	describe('reset', () => {
		it('should reset to initial state', () => {
			breaker.recordFailure();
			breaker.recordFailure();
			breaker.recordFailure();

			breaker.reset();

			expect(breaker.state).toBe(CircuitBreakerStates.CLOSED);
			expect(breaker.canRequest()).toBe(true);
		});
	});

	describe('getState', () => {
		it('should return current state information', () => {
			breaker.recordSuccess();
			breaker.recordSuccess();
			breaker.recordFailure();

			const state = breaker.getState();

			expect(state.state).toBe(CircuitBreakerStates.CLOSED);
			expect(state.failures).toBe(1);
			expect(state.successes).toBe(2);
			expect(state.canRequest).toBe(true);
		});

		// FIX-8 — getState() is a pure read. The earlier implementation called
		// canRequest() internally, which transitions OPEN→HALF_OPEN once the
		// reset timeout has elapsed. That meant a monitoring/debug read could
		// silently consume the recovery window without any real traffic.
		it('does NOT mutate state when called on an OPEN breaker past the reset timeout', () => {
			vi.useFakeTimers();
			const b = new CircuitBreaker('purity-test', {
				failureThreshold: 1,
				resetTimeout: 1000
			});
			b.recordFailure();
			expect(b.state).toBe(CircuitBreakerStates.OPEN);

			vi.advanceTimersByTime(2000); // past the reset timeout

			const state = b.getState();
			expect(state.canRequest).toBe(true); // it WOULD allow a request now
			expect(b.state).toBe(CircuitBreakerStates.OPEN); // ...but inspection didn't transition
			vi.useRealTimers();
		});

		it('canRequest() (the real gate) still transitions OPEN→HALF_OPEN past the reset timeout', () => {
			vi.useFakeTimers();
			const b = new CircuitBreaker('gate-test', {
				failureThreshold: 1,
				resetTimeout: 1000
			});
			b.recordFailure();
			expect(b.state).toBe(CircuitBreakerStates.OPEN);

			vi.advanceTimersByTime(2000);

			expect(b.canRequest()).toBe(true);
			expect(b.state).toBe(CircuitBreakerStates.HALF_OPEN); // gate transitions
			vi.useRealTimers();
		});
	});
});

describe('CircuitBreakerRegistry', () => {
	let registry: CircuitBreakerRegistry;

	beforeEach(() => {
		registry = new CircuitBreakerRegistry();
	});

	it('should create and return circuit breakers', () => {
		const breaker1 = registry.get('service-1');
		const breaker2 = registry.get('service-2');

		expect(breaker1.serviceId).toBe('service-1');
		expect(breaker2.serviceId).toBe('service-2');
	});

	it('should return same instance for same service', () => {
		const breaker1 = registry.get('service-1');
		const breaker2 = registry.get('service-1');

		expect(breaker1).toBe(breaker2);
	});

	it('should track open circuit count', () => {
		const breaker1 = registry.get('service-1', { failureThreshold: 1 });
		const breaker2 = registry.get('service-2', { failureThreshold: 1 });

		breaker1.recordFailure();
		breaker2.recordFailure();

		expect(registry.getOpenCount()).toBe(2);
	});

	it('should reset all circuit breakers', () => {
		const breaker1 = registry.get('service-1', { failureThreshold: 1 });
		const breaker2 = registry.get('service-2', { failureThreshold: 1 });

		breaker1.recordFailure();
		breaker2.recordFailure();

		registry.resetAll();

		expect(registry.getOpenCount()).toBe(0);
	});
});

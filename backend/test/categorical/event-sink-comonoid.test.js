/**
 * Event-Sink Comonoid Law Tests
 *
 * The dispatch system fans events to N sinks — comultiplication in (Set, x).
 * Each sink receives the full event (counit extracts what it needs).
 *
 * Laws tested:
 *   1. Comultiplication delivers the same event to all sinks (diagonal)
 *   2. Sink independence: one sink's failure doesn't affect others
 *   3. Order preservation: events arrive in dispatch order
 *   4. Counit: each sink can extract different projections from the same event
 */

const { registerSink, removeSink, clearSinks, dispatch, sinkCount } = require('../../src/events/dispatch');
const E = require('../../src/events/types');

describe('Event-Sink Comonoid', () => {
  beforeEach(() => {
    clearSinks();
  });

  afterAll(() => {
    clearSinks();
  });

  describe('Comultiplication: same event delivered to all sinks', () => {
    it('delivers identical events to two sinks', async () => {
      const captured1 = [];
      const captured2 = [];

      registerSink((e) => captured1.push(e));
      registerSink((e) => captured2.push(e));

      const event = E.tokenReserved({ tokenId: 1, expiry: 9999, transactionHash: '0xabc' });
      await dispatch([event]);

      expect(captured1).toHaveLength(1);
      expect(captured2).toHaveLength(1);
      // Both sinks receive the exact same event object
      expect(captured1[0]).toBe(captured2[0]);
      expect(captured1[0]).toBe(event);
    });

    it('delivers N events to M sinks (NxM deliveries)', async () => {
      const sinkResults = [[], [], []];
      sinkResults.forEach((arr) => registerSink((e) => arr.push(e)));

      const events = [
        E.tokenReserved({ tokenId: 1, expiry: 9999, transactionHash: '0x1' }),
        E.tokenReserved({ tokenId: 2, expiry: 9999, transactionHash: '0x2' }),
      ];
      await dispatch(events);

      for (const arr of sinkResults) {
        expect(arr).toHaveLength(2);
        expect(arr[0]).toBe(events[0]);
        expect(arr[1]).toBe(events[1]);
      }
    });
  });

  describe('Sink independence: failure isolation', () => {
    it('a throwing sink does not prevent other sinks from receiving events', async () => {
      const captured = [];

      registerSink(() => { throw new Error('Sink explosion'); });
      registerSink((e) => captured.push(e));

      const event = E.mintStarted({ mintId: 'test', wallet: '0x123' });
      await dispatch([event]);

      expect(captured).toHaveLength(1);
      expect(captured[0]).toBe(event);
    });

    it('an async-throwing sink does not prevent other sinks', async () => {
      const captured = [];

      registerSink(async () => { throw new Error('Async sink explosion'); });
      registerSink((e) => captured.push(e));

      const event = E.mintCompleted({ mintId: 'test', tokenId: 1, transactionHash: '0xabc' });
      await dispatch([event]);

      expect(captured).toHaveLength(1);
    });
  });

  describe('Order preservation', () => {
    it('events arrive in the order they were dispatched', async () => {
      const captured = [];
      registerSink((e) => captured.push(e.type));

      const events = [
        E.mintStarted({ mintId: 'x', wallet: '0x1' }),
        E.mintStep({ mintId: 'x', step: 'reserve' }),
        E.mintStep({ mintId: 'x', step: 'watermark' }),
        E.mintCompleted({ mintId: 'x', tokenId: 1, transactionHash: '0xabc' }),
      ];

      await dispatch(events);

      expect(captured).toEqual([
        'mint.started',
        'mint.step',
        'mint.step',
        'mint.completed',
      ]);
    });
  });

  describe('Counit: sinks extract different projections', () => {
    it('different sinks can extract different fields from the same event', async () => {
      const types = [];
      const tokenIds = [];

      registerSink((e) => types.push(e.type));
      registerSink((e) => { if (e.tokenId !== undefined) tokenIds.push(e.tokenId); });

      const events = [
        E.tokenMinted({
          tokenId: 42, to: '0x1', transactionHash: '0xabc',
          blockNumber: 100, imageHash: '0xh', ipfsUri: 'ipfs://x',
          uri: 'ar://y', licenseType: 2, mock: true
        }),
        E.mintStep({ mintId: 'x', step: 'test' }),
      ];

      await dispatch(events);

      expect(types).toEqual(['token.minted', 'mint.step']);
      expect(tokenIds).toEqual([42]);
    });
  });

  describe('Sink management', () => {
    it('removeSink stops delivery', async () => {
      const captured = [];
      const sink = (e) => captured.push(e);

      registerSink(sink);
      await dispatch([E.mintStarted({ mintId: 'x', wallet: '0x1' })]);
      expect(captured).toHaveLength(1);

      removeSink(sink);
      await dispatch([E.mintStarted({ mintId: 'y', wallet: '0x2' })]);
      expect(captured).toHaveLength(1); // no new events
    });

    it('clearSinks removes all sinks', () => {
      registerSink(() => {});
      registerSink(() => {});
      expect(sinkCount()).toBe(2);

      clearSinks();
      expect(sinkCount()).toBe(0);
    });

    it('dispatch to zero sinks is a no-op', async () => {
      // Should not throw
      await dispatch([E.mintStarted({ mintId: 'x', wallet: '0x1' })]);
    });
  });
});

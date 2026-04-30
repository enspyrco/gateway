/**
 * Writer Monad Law Tests
 *
 * The NFTmarket backend uses a Writer monad pattern: service functions return
 * [result, events] where events accumulate via array concatenation.
 *
 * Monoid: (AppEvent[], concat, [])
 * Unit:   a => [a, []]
 * Bind:   ([a, es], f) => let [b, es'] = f(a) in [b, [...es, ...es']]
 *
 * Laws tested:
 *   1. Left unit:    unit(a) >>= f  ===  f(a)
 *   2. Right unit:   m >>= unit     ===  m
 *   3. Associativity: (m >>= f) >>= g  ===  m >>= (x => f(x) >>= g)
 */

const { unit, bind, composeK, tell } = require('../../src/utils/writer');

// Test Kleisli arrows (service function stubs)
const double = async (x) => [x * 2, [{ type: 'doubled', value: x * 2 }]];
const addTen = async (x) => [x + 10, [{ type: 'added', value: x + 10 }]];
const toString = async (x) => [String(x), [{ type: 'stringified', value: String(x) }]];

// Helper: compare writer values (result equality + event type equality)
function writerEqual(a, b) {
  expect(a[0]).toEqual(b[0]);
  expect(a[1].map(e => e.type)).toEqual(b[1].map(e => e.type));
  expect(a[1].map(e => e.value)).toEqual(b[1].map(e => e.value));
}

describe('Writer Monad Laws', () => {
  describe('Left unit: unit(a) >>= f === f(a)', () => {
    it('holds for double', async () => {
      const a = 5;
      const lhs = await bind(unit(a), double);
      const rhs = await double(a);
      writerEqual(lhs, rhs);
    });

    it('holds for addTen', async () => {
      const a = 7;
      const lhs = await bind(unit(a), addTen);
      const rhs = await addTen(a);
      writerEqual(lhs, rhs);
    });

    it('holds for toString', async () => {
      const a = 42;
      const lhs = await bind(unit(a), toString);
      const rhs = await toString(a);
      writerEqual(lhs, rhs);
    });
  });

  describe('Right unit: m >>= unit === m', () => {
    it('holds for a value with events', async () => {
      const m = [42, [{ type: 'test', value: 42 }]];
      const lhs = await bind(m, async (x) => unit(x));
      writerEqual(lhs, m);
    });

    it('holds for a value with no events', async () => {
      const m = unit(99);
      const lhs = await bind(m, async (x) => unit(x));
      writerEqual(lhs, m);
    });

    it('holds after a computation', async () => {
      const m = await double(5);
      const lhs = await bind(m, async (x) => unit(x));
      writerEqual(lhs, m);
    });
  });

  describe('Associativity: (m >>= f) >>= g === m >>= (x => f(x) >>= g)', () => {
    it('holds for double then addTen', async () => {
      const m = [3, [{ type: 'initial', value: 3 }]];

      // Left grouping: (m >>= double) >>= addTen
      const lhs = await bind(await bind(m, double), addTen);

      // Right grouping: m >>= (x => double(x) >>= addTen)
      const rhs = await bind(m, async (x) => bind(await double(x), addTen));

      writerEqual(lhs, rhs);
    });

    it('holds for addTen then toString', async () => {
      const m = unit(7);

      const lhs = await bind(await bind(m, addTen), toString);
      const rhs = await bind(m, async (x) => bind(await addTen(x), toString));

      writerEqual(lhs, rhs);
    });

    it('holds for a three-step chain', async () => {
      const m = unit(2);

      // ((m >>= double) >>= addTen) >>= toString
      const lhs = await bind(await bind(await bind(m, double), addTen), toString);

      // m >>= (x => double(x) >>= (y => addTen(y) >>= toString))
      const rhs = await bind(m, async (x) =>
        bind(await double(x), async (y) =>
          bind(await addTen(y), toString)
        )
      );

      writerEqual(lhs, rhs);
    });
  });
});

describe('Kleisli Composition Laws', () => {
  describe('Left identity: composeK(unit, f) === f', () => {
    it('holds for double', async () => {
      const composed = composeK(async (x) => unit(x), double);
      const lhs = await composed(5);
      const rhs = await double(5);
      writerEqual(lhs, rhs);
    });
  });

  describe('Right identity: composeK(f, unit) === f', () => {
    it('holds for double', async () => {
      const composed = composeK(double, async (x) => unit(x));
      const lhs = await composed(5);
      const rhs = await double(5);
      writerEqual(lhs, rhs);
    });
  });

  describe('Associativity: composeK(composeK(f, g), h) === composeK(f, composeK(g, h))', () => {
    it('holds for double, addTen, toString', async () => {
      const lhs = composeK(composeK(double, addTen), toString);
      const rhs = composeK(double, composeK(addTen, toString));

      const resultL = await lhs(3);
      const resultR = await rhs(3);

      writerEqual(resultL, resultR);
    });
  });
});

describe('tell utility', () => {
  it('appends events without changing the value', () => {
    const w = unit(42);
    const extra = { type: 'note', detail: 'hello' };
    const result = tell(w, extra);

    expect(result[0]).toBe(42);
    expect(result[1]).toEqual([extra]);
  });

  it('preserves existing events', () => {
    const existing = { type: 'first' };
    const w = [10, [existing]];
    const extra = { type: 'second' };
    const result = tell(w, extra);

    expect(result[0]).toBe(10);
    expect(result[1]).toEqual([existing, extra]);
  });

  it('supports multiple events', () => {
    const w = unit(0);
    const result = tell(w, { type: 'a' }, { type: 'b' }, { type: 'c' });
    expect(result[1]).toHaveLength(3);
  });
});

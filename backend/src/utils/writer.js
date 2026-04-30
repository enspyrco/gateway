/**
 * Writer Monad Utilities
 *
 * The NFTmarket backend uses a Writer monad pattern where service functions
 * return [result, events] — a value paired with an accumulated log of AppEvents.
 * The monoid is (AppEvent[], concat, []).
 *
 * This module provides the bind (>>=) combinator so pipelines can be composed
 * without manually destructuring and pushing events at each step.
 *
 * Writer laws:
 *   Left unit:   unit(a) >>= f        === f(a)
 *   Right unit:  m >>= unit           === m
 *   Associativity: (m >>= f) >>= g   === m >>= (x => f(x) >>= g)
 *
 * where unit(a) = [a, []]
 */

/**
 * Writer unit (return/pure): wrap a value with no events.
 * @template T
 * @param {T} value
 * @returns {[T, import('../events/types').AppEvent[]]}
 */
function unit(value) {
  return [value, []];
}

/**
 * Writer bind (>>=): compose a Writer value with a Kleisli arrow.
 * @template A, B
 * @param {[A, import('../events/types').AppEvent[]]} writerA - Previous writer result
 * @param {(a: A) => Promise<[B, import('../events/types').AppEvent[]]>} f - Kleisli arrow
 * @returns {Promise<[B, import('../events/types').AppEvent[]]>}
 */
async function bind(writerA, f) {
  const [a, eventsA] = writerA;
  const [b, eventsB] = await f(a);
  return [b, [...eventsA, ...eventsB]];
}

/**
 * Compose two Kleisli arrows in the Writer monad.
 * composeK(f, g)(a) = f(a) >>= g
 * @template A, B, C
 * @param {(a: A) => Promise<[B, import('../events/types').AppEvent[]]>} f
 * @param {(b: B) => Promise<[C, import('../events/types').AppEvent[]]>} g
 * @returns {(a: A) => Promise<[C, import('../events/types').AppEvent[]]>}
 */
function composeK(f, g) {
  return async (a) => {
    const writerB = await f(a);
    return bind(writerB, g);
  };
}

/**
 * Append extra events to a writer value (for route-level narration).
 * @template T
 * @param {[T, import('../events/types').AppEvent[]]} writer
 * @param {...import('../events/types').AppEvent} extraEvents
 * @returns {[T, import('../events/types').AppEvent[]]}
 */
function tell(writer, ...extraEvents) {
  const [value, events] = writer;
  return [value, [...events, ...extraEvents]];
}

module.exports = { unit, bind, composeK, tell };

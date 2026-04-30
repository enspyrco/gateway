/**
 * License Semilattice Law Tests
 *
 * License types form a bounded join-semilattice (total order):
 *   Display (0) < Commercial (1) < Transfer (2)
 *
 * Laws tested:
 *   1. Reflexivity:   a <= a
 *   2. Antisymmetry:  a <= b && b <= a => a === b
 *   3. Transitivity:  a <= b && b <= c => a <= c
 *   4. Join idempotence:   join(a, a) === a
 *   5. Join commutativity: join(a, b) === join(b, a)
 *   6. Join associativity: join(join(a, b), c) === join(a, join(b, c))
 *   7. Meet idempotence:   meet(a, a) === a
 *   8. Meet commutativity: meet(a, b) === meet(b, a)
 *   9. Meet associativity: meet(meet(a, b), c) === meet(a, meet(b, c))
 *   10. canSell preserves order
 *   11. canUpgrade is strict order
 */

const {
  LICENSE_TYPE_MAP,
  canSell,
  canUpgrade,
  licenseJoin,
  licenseMeet,
} = require('../../src/utils/license-utils');

const Display = LICENSE_TYPE_MAP.display;    // 0
const Commercial = LICENSE_TYPE_MAP.commercial; // 1
const Transfer = LICENSE_TYPE_MAP.transfer;  // 2

const ALL = [Display, Commercial, Transfer];

describe('License Semilattice Laws', () => {
  describe('Partial order (total order)', () => {
    it('reflexivity: a <= a for all license types', () => {
      for (const a of ALL) {
        expect(a <= a).toBe(true);
      }
    });

    it('antisymmetry: a <= b && b <= a implies a === b', () => {
      for (const a of ALL) {
        for (const b of ALL) {
          if (a <= b && b <= a) {
            expect(a).toBe(b);
          }
        }
      }
    });

    it('transitivity: a <= b && b <= c implies a <= c', () => {
      for (const a of ALL) {
        for (const b of ALL) {
          for (const c of ALL) {
            if (a <= b && b <= c) {
              expect(a <= c).toBe(true);
            }
          }
        }
      }
    });

    it('totality: for all a, b, either a <= b or b <= a', () => {
      for (const a of ALL) {
        for (const b of ALL) {
          expect(a <= b || b <= a).toBe(true);
        }
      }
    });
  });

  describe('Join (least upper bound) laws', () => {
    it('idempotence: join(a, a) === a', () => {
      for (const a of ALL) {
        expect(licenseJoin(a, a)).toBe(a);
      }
    });

    it('commutativity: join(a, b) === join(b, a)', () => {
      for (const a of ALL) {
        for (const b of ALL) {
          expect(licenseJoin(a, b)).toBe(licenseJoin(b, a));
        }
      }
    });

    it('associativity: join(join(a, b), c) === join(a, join(b, c))', () => {
      for (const a of ALL) {
        for (const b of ALL) {
          for (const c of ALL) {
            expect(licenseJoin(licenseJoin(a, b), c)).toBe(licenseJoin(a, licenseJoin(b, c)));
          }
        }
      }
    });

    it('join is the least upper bound', () => {
      for (const a of ALL) {
        for (const b of ALL) {
          const j = licenseJoin(a, b);
          // j >= a and j >= b
          expect(j >= a).toBe(true);
          expect(j >= b).toBe(true);
          // j is the least such: for any upper bound u >= a and u >= b, u >= j
          for (const u of ALL) {
            if (u >= a && u >= b) {
              expect(u >= j).toBe(true);
            }
          }
        }
      }
    });
  });

  describe('Meet (greatest lower bound) laws', () => {
    it('idempotence: meet(a, a) === a', () => {
      for (const a of ALL) {
        expect(licenseMeet(a, a)).toBe(a);
      }
    });

    it('commutativity: meet(a, b) === meet(b, a)', () => {
      for (const a of ALL) {
        for (const b of ALL) {
          expect(licenseMeet(a, b)).toBe(licenseMeet(b, a));
        }
      }
    });

    it('associativity: meet(meet(a, b), c) === meet(a, meet(b, c))', () => {
      for (const a of ALL) {
        for (const b of ALL) {
          for (const c of ALL) {
            expect(licenseMeet(licenseMeet(a, b), c)).toBe(licenseMeet(a, licenseMeet(b, c)));
          }
        }
      }
    });
  });

  describe('Absorption laws (lattice)', () => {
    it('join(a, meet(a, b)) === a', () => {
      for (const a of ALL) {
        for (const b of ALL) {
          expect(licenseJoin(a, licenseMeet(a, b))).toBe(a);
        }
      }
    });

    it('meet(a, join(a, b)) === a', () => {
      for (const a of ALL) {
        for (const b of ALL) {
          expect(licenseMeet(a, licenseJoin(a, b))).toBe(a);
        }
      }
    });
  });
});

describe('canSell — order preservation', () => {
  it('owner with Transfer can sell any license type', () => {
    expect(canSell(Transfer, Display)).toBe(true);
    expect(canSell(Transfer, Commercial)).toBe(true);
    expect(canSell(Transfer, Transfer)).toBe(true);
  });

  it('owner with Commercial can sell Display and Commercial', () => {
    expect(canSell(Commercial, Display)).toBe(true);
    expect(canSell(Commercial, Commercial)).toBe(true);
    expect(canSell(Commercial, Transfer)).toBe(false);
  });

  it('owner with Display can only sell Display', () => {
    expect(canSell(Display, Display)).toBe(true);
    expect(canSell(Display, Commercial)).toBe(false);
    expect(canSell(Display, Transfer)).toBe(false);
  });

  it('canSell is equivalent to requestedLevel <= ownerLevel', () => {
    for (const owner of ALL) {
      for (const requested of ALL) {
        expect(canSell(owner, requested)).toBe(requested <= owner);
      }
    }
  });
});

describe('canUpgrade — strict order', () => {
  it('cannot upgrade to same level', () => {
    for (const a of ALL) {
      expect(canUpgrade(a, a)).toBe(false);
    }
  });

  it('can upgrade Display to Commercial or Transfer', () => {
    expect(canUpgrade(Display, Commercial)).toBe(true);
    expect(canUpgrade(Display, Transfer)).toBe(true);
  });

  it('can upgrade Commercial to Transfer', () => {
    expect(canUpgrade(Commercial, Transfer)).toBe(true);
  });

  it('cannot downgrade', () => {
    expect(canUpgrade(Commercial, Display)).toBe(false);
    expect(canUpgrade(Transfer, Display)).toBe(false);
    expect(canUpgrade(Transfer, Commercial)).toBe(false);
  });

  it('canUpgrade is equivalent to existingLevel < requestedLevel', () => {
    for (const existing of ALL) {
      for (const requested of ALL) {
        expect(canUpgrade(existing, requested)).toBe(requested > existing);
      }
    }
  });
});

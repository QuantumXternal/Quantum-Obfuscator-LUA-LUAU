// Server cache-key regression (Phase 1.2b R4): the key MUST discriminate
// seed types, so numeric 1234, string "1234", and string "1235" never share
// an entry. cacheKey is imported from the side-effect-free module
// (../dist/cacheKey.js) — never server.js (binds port 3000 on import).
import { cacheKey } from "../dist/cacheKey.js";

const OPTS = (polymorphicSeed) => ({
  profile: "MAXIMUM", target: "generic", noRename: false, noPreserve: false,
  encodeStringsOpt: true, scrambleOpt: true, oneLineOpt: false,
  vmType: "register", vmLevel: "max", seed: undefined,
  polymorphicSeed, disableFeatures: undefined,
});
const CODE = "local s = 0\nfor i = 1, 10 do s = s + i end\nprint(s)\n";

describe("cache key discriminates string seeds", () => {
  test("string seed A vs string seed B: keys differ", () => {
    expect(cacheKey(CODE, OPTS("alpha-seed-1"))).not.toBe(cacheKey(CODE, OPTS("alpha-seed-2")));
  });
  test("numeric 1234 vs string '1234': keys differ (type discriminator)", () => {
    expect(cacheKey(CODE, OPTS(1234))).not.toBe(cacheKey(CODE, OPTS("1234")));
  });
  test("identical inputs: keys identical (cache still hits)", () => {
    expect(cacheKey(CODE, OPTS("alpha-seed-1"))).toBe(cacheKey(CODE, OPTS("alpha-seed-1")));
    expect(cacheKey(CODE, OPTS(1234))).toBe(cacheKey(CODE, OPTS(1234)));
  });
  test("different code: keys differ even with equal seeds", () => {
    expect(cacheKey(CODE, OPTS("s"))).not.toBe(cacheKey(CODE + " ", OPTS("s")));
  });
});

/**
 * 每日挑战：同一天种子相同
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.GameDaily = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function dateKey(d) {
    const x = d || new Date();
    const y = x.getFullYear();
    const m = String(x.getMonth() + 1).padStart(2, '0');
    const day = String(x.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  function hashSeed(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function mulberry32(a) {
    return function () {
      let t = (a += 0x6d2b79f5);
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function shuffleSeeded(arr, seed) {
    const a = arr.slice();
    const rnd = mulberry32(seed);
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function getConfig(tilePool, key) {
    const dk = key || dateKey();
    const seed = hashSeed('doudou-daily-' + dk);
    const rnd = mulberry32(seed);
    const pool = tilePool.length ? tilePool : [];
    const minP = 8;
    const maxP = Math.min(14, pool.length || 14);
    const pairs = minP + Math.floor(rnd() * (maxP - minP + 1));

    const order = shuffleSeeded(
      pool.map((_, i) => i),
      seed + 1
    );
    const images = [];
    for (let i = 0; i < pairs; i++) {
      images.push(pool[order[i % pool.length]]);
    }

    const deckSeed = seed + 2;
    return { dateKey: dk, pairs, images, deckSeed };
  }

  function buildDeck(images, deckSeed) {
    const deck = [];
    images.forEach((src, pairId) => {
      deck.push({ pairId, src });
      deck.push({ pairId, src });
    });
    return shuffleSeeded(deck, deckSeed);
  }

  return { dateKey, getConfig, buildDeck, hashSeed };
});

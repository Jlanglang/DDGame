/**
 * 豆豆大战僵尸 · 放置策略的数值与格子
 * 卡片、花费、冷却、血量都是暂定，方便以后改这一张表。
 * 摆放规则不在这里：先选卡，再点空格子（见 sim.js）。
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.ZombieData = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  // 1280×720 横屏。左边卡槽，接着是屋子，再往右 5 行 9 列草坪。
  // 290 + 9*106 + 36 = 1280；5*144 = 720。
  const LAYOUT = {
    W: 1280,
    H: 720,
    ROWS: 5,
    COLS: 9,
    BANK_X: 8,
    BANK_W: 112,
    PANEL_W: 128,
    LAWN_X: 290,
    COL_W: 106,
    ROW_H: 144,
    SIDE_W: 36,
    PACKET_TOP: 8,
    PACKET_H: 90,
    PACKET_GAP: 4,
    SHOVEL_H: 64,
  };

  /** 暂定卡表。cd 是种下之后的冷却秒数。 */
  const CARDS = [
    {
      id: 'sun',
      name: '阳光豆',
      cost: 50,
      cd: 5,
      hp: 300,
      sunEvery: 10,
      blurb: '阳光豆 · 过一会儿结一颗阳光',
    },
    {
      id: 'pea',
      name: '豌豆豆',
      cost: 100,
      cd: 6,
      hp: 300,
      shot: { dmg: 22, interval: 1.4, speed: 360 },
      blurb: '豌豆豆 · 朝这一行右边吐豌豆',
    },
    {
      id: 'wall',
      name: '坚果豆',
      cost: 50,
      cd: 15,
      hp: 4000,
      blurb: '坚果豆 · 厚壳，专门站着挨打',
    },
    {
      id: 'mine',
      name: '土豆雷',
      cost: 25,
      cd: 16,
      hp: 300,
      arm: 14,
      boom: 1800,
      blurb: '土豆雷 · 先埋好，僵尸踩上才炸',
    },
    {
      id: 'ice',
      name: '冰豆',
      cost: 175,
      cd: 8,
      hp: 300,
      shot: { dmg: 22, interval: 1.4, speed: 360, slow: 3.2 },
      blurb: '冰豆 · 豌豆会把这一行的僵尸冻慢',
    },
    {
      id: 'cherry',
      name: '樱桃豆',
      cost: 150,
      cd: 24,
      hp: 300,
      fuse: 0.85,
      boom: 1800,
      blurb: '樱桃豆 · 短倒计时后，炸开周围九宫格',
    },
  ];

  /** 暂定僵尸。bite 是每一口的伤害。 */
  const ZOMBIES = {
    normal: { name: '僵尸', hp: 200, speed: 24, bite: 36, biteEvery: 0.5 },
    cone: { name: '路障僵尸', hp: 570, speed: 24, bite: 36, biteEvery: 0.5 },
    bucket: { name: '铁桶僵尸', hp: 1280, speed: 24, bite: 36, biteEvery: 0.5 },
  };

  /**
   * 前院第一天，三波。delay：这一波开打前要等的秒数
   * （第一波从开局算，后面的从上一波清完算）。
   * after：这一波内部，相对开波再晚几秒出场。
   */
  const LEVEL = {
    name: '前院',
    startSun: 150,
    sunValue: 25,
    sunFallEvery: 7.5,
    firstSun: 3.5,
    waves: [
      {
        delay: 16,
        spawns: [
          { kind: 'normal', row: 2, after: 0 },
          { kind: 'normal', row: 0, after: 7 },
          { kind: 'normal', row: 4, after: 8.5 },
        ],
      },
      {
        delay: 11,
        spawns: [
          { kind: 'normal', row: 1, after: 0 },
          { kind: 'normal', row: 3, after: 2 },
          { kind: 'cone', row: 2, after: 5 },
          { kind: 'normal', row: 2, after: 9 },
          { kind: 'normal', row: 4, after: 11 },
        ],
      },
      {
        delay: 12,
        flag: true,
        spawns: [
          { kind: 'normal', row: 0, after: 0 },
          { kind: 'normal', row: 1, after: 1.2 },
          { kind: 'normal', row: 2, after: 2.2 },
          { kind: 'normal', row: 3, after: 3.2 },
          { kind: 'normal', row: 4, after: 4.2 },
          { kind: 'cone', row: 1, after: 7 },
          { kind: 'cone', row: 3, after: 8 },
          { kind: 'bucket', row: 2, after: 10 },
          { kind: 'normal', row: 0, after: 13 },
          { kind: 'normal', row: 4, after: 14 },
        ],
      },
    ],
  };

  const cardMap = {};
  CARDS.forEach((c) => { cardMap[c.id] = c; });

  function cardById(id) {
    return cardMap[id] || null;
  }

  function cellCenterX(col) {
    return LAYOUT.LAWN_X + (col + 0.5) * LAYOUT.COL_W;
  }

  function feetY(row) {
    return (row + 1) * LAYOUT.ROW_H - 20;
  }

  function cellAt(x, y) {
    if (x < LAYOUT.LAWN_X || y < 0 || y >= LAYOUT.H) return null;
    const col = Math.floor((x - LAYOUT.LAWN_X) / LAYOUT.COL_W);
    const row = Math.floor(y / LAYOUT.ROW_H);
    if (row < 0 || row >= LAYOUT.ROWS || col < 0 || col >= LAYOUT.COLS) return null;
    return { row, col };
  }

  function cellRect(row, col) {
    return {
      x: LAYOUT.LAWN_X + col * LAYOUT.COL_W,
      y: row * LAYOUT.ROW_H,
      w: LAYOUT.COL_W,
      h: LAYOUT.ROW_H,
    };
  }

  function packetRect(index) {
    return {
      x: LAYOUT.BANK_X,
      y: LAYOUT.PACKET_TOP + index * (LAYOUT.PACKET_H + LAYOUT.PACKET_GAP),
      w: LAYOUT.BANK_W,
      h: LAYOUT.PACKET_H,
    };
  }

  function shovelRect() {
    const y = LAYOUT.PACKET_TOP + CARDS.length * (LAYOUT.PACKET_H + LAYOUT.PACKET_GAP) + 8;
    return { x: LAYOUT.BANK_X, y, w: LAYOUT.BANK_W, h: LAYOUT.SHOVEL_H };
  }

  function hitPacket(x, y) {
    for (let i = 0; i < CARDS.length; i++) {
      const r = packetRect(i);
      if (x >= r.x && y >= r.y && x < r.x + r.w && y < r.y + r.h) return i;
    }
    return -1;
  }

  function hitShovel(x, y) {
    const r = shovelRect();
    return x >= r.x && y >= r.y && x < r.x + r.w && y < r.y + r.h;
  }

  return {
    LAYOUT,
    CARDS,
    ZOMBIES,
    LEVEL,
    cardById,
    cellCenterX,
    feetY,
    cellAt,
    cellRect,
    packetRect,
    shovelRect,
    hitPacket,
    hitShovel,
  };
});

/* 豆豆暗黑传奇 · 第一版野外（只给 3D 用）
   128×128：西北角是鸡鸣村，南边和西边是荒田，北边一个洞口。
   不改原来的 24×24 主城。
*/
(function (global) {
  'use strict';
  const DL = (global.DL = global.DL || {});
  const N = 128;
  const OX = 52;
  const OY = 52;

  function hash(x, y) {
    let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return (h ^ (h >>> 16)) >>> 0;
  }

  function onRoad(x, y) {
    if (Math.abs(x - 64) <= 1 && y >= 26 && y <= 112) return true;
    if (Math.abs(y - 64) <= 1 && x >= 14 && x <= 90) return true;
    return false;
  }

  function inTown(x, y) {
    return x >= 48 && x <= 80 && y >= 48 && y <= 80;
  }

  function build() {
    const map = [];
    for (let y = 0; y < N; y++) {
      const row = [];
      for (let x = 0; x < N; x++) {
        const edge = x === 0 || y === 0 || x === N - 1 || y === N - 1;
        let wall = edge;
        if (!edge && !inTown(x, y) && !onRoad(x, y) && (hash(x, y) % 47) === 0) wall = true;
        row.push(wall ? 1 : 0);
      }
      map.push(row);
    }
    const cave = { x: 64, y: 28, direct: 'cave1', name: '稻草垛洞', tierMin: 1, tierMax: 10, lv: 1, room: 'cave1' };
    map[cave.y][cave.x] = 2;

    const terrain = [];
    for (let y = 0; y < N; y++) {
      const row = [];
      for (let x = 0; x < N; x++) row.push(map[y][x] === 1 ? 2 : (onRoad(x, y) ? 1 : 0));
      terrain.push(row);
    }

    const shift = (x, y) => ({ x: x + OX, y: y + OY });
    const props = [];
    const add = (sheet, index, x, y, opt) => {
      props.push(Object.assign({ sheet: sheet, index: index, x: x, y: y }, opt || {}));
    };
    add('town', 0, 12 + OX, 10 + OY);
    add('town', 1, 8 + OX, 7 + OY);
    add('town', 4, 16 + OX, 7 + OY);
    add('town', 2, 14 + OX, 14 + OY);
    add('town', 3, 9 + OX, 15 + OY);
    add('town', 5, 7 + OX, 12 + OY, { w: 96 });
    add('town', 5, 17 + OX, 12 + OY, { w: 96 });
    add('town', 6, 4 + OX, 14 + OY);
    add('town', 7, 5 + OX, 17 + OY);
    add('town', 8, 10 + OX, 9 + OY);
    add('town', 8, 15 + OX, 16 + OY);
    add('town', 9, 18 + OX, 12 + OY);
    add('flora', 0, 3 + OX, 5 + OY);
    add('flora', 1, 90, 70);
    add('flora', 2, 40, 100);
    add('flora', 0, 20, 50);
    add('flora', 8, 78, 96);
    add('flora', 4, 30, 90);
    add('flora', 6, 100, 40);

    const mobs = [
      { id: 'chicken', x: 70, y: 96 },
      { id: 'chicken', x: 78, y: 104 },
      { id: 'chicken', x: 60, y: 108 },
      { id: 'chicken', x: 88, y: 100 },
      { id: 'scarecrow', x: 74, y: 112 },
      { id: 'scarecrow', x: 52, y: 100 },
      { id: 'dog', x: 24, y: 60 },
      { id: 'dog', x: 18, y: 72 },
      { id: 'dog', x: 30, y: 48 },
      { id: 'boar', x: 22, y: 40 },
      { id: 'boar', x: 16, y: 88 },
    ];

    return {
      map: map,
      terrain: terrain,
      props: props,
      mobs: mobs,
      spawn: shift(3, 12),
      npc: shift(12, 12),
      bookNpc: shift(8, 8),
      trialNpc: shift(16, 8),
      stashNpc: shift(4, 16),
      doors: [cave],
      cave: cave,
    };
  }

  DL.Overworld = { N: N, build: build };
})(typeof window !== 'undefined' ? window : globalThis);

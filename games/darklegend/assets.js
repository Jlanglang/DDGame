/* 豆豆暗黑传奇 · 图集加载
   单张 404 不抛错。没加载到时 ready 为 false，画面退回 emoji / 色块。
*/
(function (global) {
  'use strict';
  const DL = (global.DL = global.DL || {});
  const images = {};
  const ok = {};

  function loadOne(key, src, cb) {
    ok[key] = false;
    images[key] = null;
    if (typeof Image === 'undefined') {
      if (cb) cb(false);
      return;
    }
    const im = new Image();
    im.onload = function () {
      images[key] = im;
      ok[key] = true;
      if (cb) cb(true);
    };
    im.onerror = function () {
      images[key] = null;
      ok[key] = false;
      if (cb) cb(false);
    };
    im.src = src;
  }

  // dx/dy 是锚点在屏幕上的位置。flip 以锚点所在的竖线镜像。
  function draw(ctx, key, index, cols, cell, dx, dy, opt) {
    const im = images[key];
    if (!im || !ok[key]) return false;
    opt = opt || {};
    const col = index % cols;
    const row = (index / cols) | 0;
    const dw = opt.w || cell;
    const dh = opt.h || cell;
    const ax = opt.anchorX != null ? opt.anchorX : cell / 2;
    const ay = opt.anchorY != null ? opt.anchorY : cell / 2;
    const x = Math.round(dx - dw * (ax / cell));
    const y = Math.round(dy - dh * (ay / cell));
    ctx.save();
    if (opt.flip) {
      ctx.translate(Math.round(dx), 0);
      ctx.scale(-1, 1);
      ctx.translate(-Math.round(dx), 0);
    }
    ctx.drawImage(im, col * cell, row * cell, cell, cell, x, y, dw, dh);
    ctx.restore();
    return true;
  }

  DL.Assets = {
    loadOne: loadOne,
    ready: function (key) { return !!ok[key]; },
    image: function (key) { return images[key] || null; },
    draw: draw,
  };
})(typeof window !== 'undefined' ? window : globalThis);

/* 后台生成关卡的 Worker：主线程不再卡住 */
self.importScripts('logic.js');

self.onmessage = function (e) {
  var d = e.data || {};
  try {
    var level = self.CatchAlien.generateLevel(d.band, d.seed);
    self.postMessage({ id: d.id, seed: d.seed, level: level });
  } catch (err) {
    self.postMessage({ id: d.id, seed: d.seed, error: String(err && err.message || err) });
  }
};

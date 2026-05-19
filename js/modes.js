/**
 * 游戏模式：普通 / 困难 / 挑战
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.GameModes = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const MODES = {
    normal: {
      id: 'normal',
      label: '普通',
      desc: '仅限制时间',
      hasTimeLimit: true,
      hasMoveLimit: false,
      hasIdlePenalty: false,
    },
    hard: {
      id: 'hard',
      label: '困难',
      desc: '限时 + 限步，5~20 对',
      hasTimeLimit: true,
      hasMoveLimit: true,
      hasIdlePenalty: false,
      minPairs: 5,
    },
    challenge: {
      id: 'challenge',
      label: '挑战',
      desc: '不限时，随机一对倒计时，超时盖住再换一对，10~20 对',
      hasTimeLimit: false,
      hasMoveLimit: false,
      hasIdlePenalty: true,
      idleSeconds: 10,
      minPairs: 10,
      hintCount: 0,
    },
    endless: {
      id: 'endless',
      label: '无尽',
      desc: '从 4 对起，每过一关加 1 对，看你能撑到几对',
      hasTimeLimit: true,
      hasMoveLimit: true,
      hasIdlePenalty: false,
      isEndless: true,
      hintCount: 2,
    },
  };

  MODES.normal.hintCount = 3;
  MODES.hard.hintCount = 1;

  const LIST = [MODES.normal, MODES.hard, MODES.challenge, MODES.endless];

  function hintCountFor(mode) {
    if (!mode) return 0;
    if (typeof mode.hintCount === 'number') return mode.hintCount;
    return 2;
  }

  function get(id) {
    return MODES[id] || MODES.normal;
  }

  return { MODES, LIST, get, hintCountFor };
});

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
      desc: '限时，3 关难度递增，表情包可重复',
      hasTimeLimit: true,
      hasMoveLimit: false,
      hasIdlePenalty: false,
    },
    hard: {
      id: 'hard',
      label: '困难',
      desc: '限时 + 限步，8 关难度递增，图可重复',
      hasTimeLimit: true,
      hasMoveLimit: true,
      hasIdlePenalty: false,
    },
    challenge: {
      id: 'challenge',
      label: '挑战',
      desc: '不限时，配对后倒计时惩罚，10 关难度递增，图可重复',
      hasTimeLimit: false,
      hasMoveLimit: false,
      hasIdlePenalty: true,
      idleSeconds: 10,
      hintCount: 0,
    },
  };

  MODES.normal.hintCount = 3;
  MODES.hard.hintCount = 1;

  const LIST = [MODES.normal, MODES.hard, MODES.challenge];

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

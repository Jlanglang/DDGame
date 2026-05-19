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
    },
  };

  const LIST = [MODES.normal, MODES.hard, MODES.challenge];

  function get(id) {
    return MODES[id] || MODES.normal;
  }

  return { MODES, LIST, get };
});

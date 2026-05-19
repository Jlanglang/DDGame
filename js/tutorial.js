/**
 * 首局引导
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.Tutorial = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const STEPS = [
    { text: '点击翻开两张牌，找出相同表情包即可配对。' },
    { text: '普通模式要留意剩余时间；配对越快越轻松。' },
    { text: '挑战模式里，已配对的牌可能被倒计时盖回，要抓紧消除哦！' },
  ];

  let overlayEl = null;
  let stepIndex = 0;
  let onDoneCb = null;

  function ensureOverlay() {
    if (overlayEl) return overlayEl;
    overlayEl = document.createElement('div');
    overlayEl.id = 'tutorial-overlay';
    overlayEl.className = 'tutorial-overlay hidden';
    overlayEl.innerHTML =
      '<div class="tutorial-card">' +
      '<p class="tutorial-text"></p>' +
      '<button type="button" class="tutorial-next">知道了</button>' +
      '</div>';
    document.body.appendChild(overlayEl);
    overlayEl.querySelector('.tutorial-next').addEventListener('click', next);
    return overlayEl;
  }

  function showStep() {
    const el = ensureOverlay();
    const mode = typeof GameModes !== 'undefined' ? GameModes.get('normal') : null;
    let steps = STEPS.slice();
    if (typeof GameModes !== 'undefined' && GameModes.get) {
      const m = GameModes.get(
        document.querySelector('.mode-btn.active')?.dataset?.mode || 'normal'
      );
      if (m?.hasIdlePenalty) {
        steps = [STEPS[0], STEPS[2]];
      } else if (m?.hasMoveLimit) {
        steps = [STEPS[0], STEPS[1]];
      } else {
        steps = [STEPS[0], STEPS[1]];
      }
    }
    if (stepIndex >= steps.length) {
      hide(true);
      return;
    }
    el.querySelector('.tutorial-text').textContent = steps[stepIndex].text;
    el.classList.remove('hidden');
    el.setAttribute('aria-hidden', 'false');
  }

  function next() {
    stepIndex += 1;
    showStep();
  }

  function hide(markDone) {
    if (overlayEl) {
      overlayEl.classList.add('hidden');
      overlayEl.setAttribute('aria-hidden', 'true');
    }
    if (markDone && typeof Progress !== 'undefined') {
      Progress.setTutorialDone();
    }
    if (onDoneCb) onDoneCb();
    onDoneCb = null;
  }

  function shouldRun() {
    return typeof Progress !== 'undefined' && !Progress.isTutorialDone();
  }

  function startAfterDelay(onDone) {
    if (!shouldRun()) {
      if (onDone) onDone();
      return;
    }
    onDoneCb = onDone;
    stepIndex = 0;
    setTimeout(showStep, 400);
  }

  return { startAfterDelay, shouldRun, hide };
});

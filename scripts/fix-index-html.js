const fs = require('fs');
const path = require('path');

const D = 'div';
const e = (tag, attrs, inner) =>
  inner === undefined
    ? `<${tag}${attrs ? ' ' + attrs : ''}></${tag}>`
    : `<${tag}${attrs ? ' ' + attrs : ''}>${inner}</${tag}>`;

const t = {
  title: '\u8c46\u8c46\u5927\u6311\u6218',
  desc: '\u8868\u60c5\u5305\u8bb0\u5fc6\u914d\u5bf9\u5c0f\u6e38\u620f',
  home: '\u9996\u9875',
  sound: '\u97f3\u6548\u5f00\u5173',
  soundShort: '\u97f3\u6548',
  hintHome: '\u9009\u5173\u6216\u5feb\u901f\u5f00\u59cb \u00b7 \u6bcf\u5c40\u968f\u673a\u8868\u60c5\u5305',
  modeGroup: '\u6e38\u620f\u6a21\u5f0f',
  modeTitle: '\u6e38\u620f\u6a21\u5f0f',
  quick: '\u5feb\u901f\u5f00\u59cb',
  pick: '\u9009\u5173',
  ach: '\u6210\u5c31',
  bag: '\u80cc\u5305',
  lotteryLog: '\u62bd\u5956\u8bb0\u5f55',
  back: '\u8fd4\u56de',
  lotteryResultHint: '\u8bb0\u5f97\u7ed9\u5bb6\u957f\u770b\uff0c\u6309\u7ea6\u5b9a\u5151\u73b0\u54e6\uff5e',
  lotteryTake: '\u6536\u4e0b',
  lotteryTagReward: '\u6b63\u5411\u5956\u52b1',
  lotteryTagDeal: '\u5bb6\u5ead\u7ea6\u5b9a',
  game: '\u6e38\u620f',
  combo: '\u8fde\u51fb x0',
  level1: '\u7b2c 1 \u5173',
  moves: '\u6b65\u6570: 0',
  time: '\u65f6\u95f4: 0s',
  tip: '\u63d0\u793a',
  menu: '\u9009\u5173',
  homeBtn: '\u9996\u9875',
  board: '\u6e38\u620f\u68cb\u76d8',
  pickLevel: '\u9009\u62e9\u5173\u5361',
  close: '\u5173\u95ed',
  synthTitle: '\u9009\u62e9\u5408\u6210\u5361\u7247',
  lotteryTitle: '\u9009\u62e9\u62bd\u5956\u5361\u7247',
  win: '\u8fc7\u5173!',
  share: '\u5206\u4eab\u6210\u7ee9',
  replay: '\u518d\u73a9\u4e00\u6b21',
  next: '\u4e0b\u4e00\u5173',
};

const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="theme-color" content="#16213e">
  <meta name="description" content="${t.desc}">
  <link rel="apple-touch-icon" href="assets/tiles/1.png">
  <title>${t.title}</title>
  <link rel="stylesheet" href="css/style.css">
  <script>
    (function () {
      if (location.protocol === 'http:' || location.protocol === 'https:') {
        var link = document.createElement('link');
        link.rel = 'manifest';
        link.href = 'manifest.json';
        document.head.appendChild(link);
      }
    })();
  </script>
</head>
<body>
  ${e(D, 'id="combo-toast" class="combo-toast hidden" aria-live="polite"')}
  ${e(D, 'id="app" class="app-shell"', `
    ${e('section', 'id="home-page" class="page page--home" aria-label="' + t.home + '"', `
      <header class="home-header">
        <h1 class="home-title"><span class="home-title-icon" aria-hidden="true">\ud83e\uded8</span>${t.title}</h1>
        <button id="btn-sound" type="button" class="btn-sound" aria-label="${t.sound}" title="${t.soundShort}">\ud83d\udd0a</button>
      </header>
      ${e(D, 'id="home-menu" class="home-menu"', `
        <p id="home-hint" class="home-hint">${t.hintHome}</p>
        ${e(D, 'class="mode-select" role="group" aria-label="' + t.modeGroup + '"', `
          <p class="mode-select-title">${t.modeTitle}</p>
          ${e(D, 'id="mode-list" class="mode-list"')}
        `)}
        ${e(D, 'id="daily-card" class="daily-card hidden"')}
        ${e(D, 'class="home-actions"', `
          <button type="button" id="btn-quick-start" class="home-btn home-btn--primary">${t.quick}</button>
          <button type="button" id="btn-pick-level" class="home-btn">${t.pick}</button>
        `)}
        ${e(D, 'class="home-toolbar"', `
          <button type="button" id="btn-achievements" class="toolbar-btn">${t.ach}</button>
          <button type="button" id="btn-backpack" class="toolbar-btn">${t.bag}</button>
          <button type="button" id="btn-lottery-log" class="toolbar-btn">${t.lotteryLog}</button>
        `)}
      `)}
      ${e('section', 'id="sub-panel" class="sub-panel hidden" aria-hidden="true"', `
        ${e(D, 'class="sub-panel-head"', `
          <h2 id="sub-panel-title"></h2>
          <button type="button" id="btn-sub-back" class="toolbar-btn">${t.back}</button>
        `)}
        ${e(D, 'id="sub-panel-body" class="sub-panel-body"')}
      `)}
      <p id="error-msg" class="error-msg hidden"></p>
    `)}
    ${e('section', 'id="game-page" class="page page--game hidden" aria-label="' + t.game + '" aria-hidden="true"', `
      <header class="header game-header">
        ${e(D, 'id="combo-hud" class="combo-hud hidden"', t.combo)}
        ${e(D, 'class="stats"', `
          <span id="level-label">${t.level1}</span>
          <span id="moves-label">${t.moves}</span>
          <span id="timer-label">${t.time}</span>
        `)}
        ${e(D, 'class="header-actions"', `
          <button id="btn-hint" type="button" class="btn-hint hidden" title="${t.tip}">\ud83d\udca1<span id="hint-count"></span></button>
          <button id="btn-sound-game" type="button" class="btn-sound" aria-label="${t.sound}" title="${t.soundShort}">\ud83d\udd0a</button>
          <button id="btn-menu" type="button" class="btn-menu">${t.menu}</button>
          <button id="btn-home" type="button" class="btn-home">${t.homeBtn}</button>
        `)}
      </header>
      <p id="drop-rate-hud" class="drop-rate-hud hidden" aria-live="polite"></p>
      ${e(D, 'id="board-viewport" class="board-viewport"', `
        ${e(D, 'id="board-scaler" class="board-scaler"', `
          <main id="board" class="board" aria-label="${t.board}"></main>
        `)}
      `)}
    `)}
  `)}
  ${e(D, 'id="level-picker" class="level-picker hidden" aria-hidden="true"', `
    ${e(D, 'class="level-picker-sheet" role="dialog" aria-labelledby="level-picker-title"', `
      ${e(D, 'class="level-picker-head"', `
        <h2 id="level-picker-title">${t.pickLevel}</h2>
        <button type="button" id="btn-level-picker-close" class="level-picker-close" aria-label="${t.close}">\u00d7</button>
      `)}
      <p id="level-select-hint" class="level-select-hint"></p>
      ${e(D, 'id="level-list" class="level-list"')}
    `)}
  `)}
  ${e(D, 'id="synth-picker" class="level-picker synth-picker hidden" aria-hidden="true"', `
    ${e(D, 'class="level-picker-sheet synth-picker-sheet" role="dialog" aria-labelledby="synth-picker-title"', `
      ${e(D, 'class="level-picker-head"', `
        <h2 id="synth-picker-title">${t.synthTitle}</h2>
        <button type="button" id="btn-synth-picker-close" class="level-picker-close" aria-label="${t.close}">\u00d7</button>
      `)}
      <p id="synth-picker-hint" class="level-select-hint synth-picker-hint"></p>
      ${e(D, 'id="synth-picker-list" class="synth-picker-list"')}
    `)}
  `)}
  ${e(D, 'id="lottery-picker" class="level-picker lottery-picker hidden" aria-hidden="true"', `
    ${e(D, 'class="level-picker-sheet lottery-picker-sheet" role="dialog" aria-labelledby="lottery-picker-title"', `
      ${e(D, 'class="level-picker-head"', `
        <h2 id="lottery-picker-title">${t.lotteryTitle}</h2>
        <button type="button" id="btn-lottery-picker-close" class="level-picker-close" aria-label="${t.close}">\u00d7</button>
      `)}
      <p id="lottery-picker-hint" class="level-select-hint lottery-picker-hint"></p>
      ${e(D, 'id="lottery-picker-list" class="lottery-picker-list"')}
    `)}
  `)}
  ${e(D, 'id="lottery-result" class="level-picker lottery-result hidden" aria-hidden="true"', `
    ${e(D, 'class="level-picker-sheet lottery-result-sheet" role="dialog" aria-labelledby="lottery-result-title"', `
      ${e(D, 'class="lottery-result-body"', `
        <span id="lottery-result-emoji" class="lottery-result-emoji" aria-hidden="true">\ud83c\udf80</span>
        <span id="lottery-result-tag" class="lottery-result-tag lottery-result-tag--reward">${t.lotteryTagReward}</span>
        <h2 id="lottery-result-title" class="lottery-result-title"></h2>
        <p id="lottery-result-desc" class="lottery-result-desc"></p>
        <p class="lottery-result-hint">${t.lotteryResultHint}</p>
        <button type="button" id="btn-lottery-result-close" class="home-btn home-btn--primary">${t.lotteryTake}</button>
      `)}
    `)}
  `)}
  ${e(D, 'id="overlay" class="overlay hidden" aria-hidden="true"', `
    ${e(D, 'id="achievement-pop" class="achievement-pop hidden"')}
    ${e(D, 'class="modal"', `
      <h2 id="overlay-title">${t.win}</h2>
      <p id="overlay-text"></p>
      ${e(D, 'id="overlay-drops" class="overlay-drops hidden" aria-hidden="true"')}
      ${e(D, 'class="modal-actions"', `
        <button id="btn-share" type="button" class="hidden">${t.share}</button>
        <button id="btn-replay" type="button">${t.replay}</button>
        <button id="btn-overlay-close" type="button" class="hidden">${t.close}</button>
        <button id="btn-next" type="button" class="primary">${t.next}</button>
        <button id="btn-select" type="button">${t.pick}</button>
      `)}
    `)}
  `)}
  <script src="js/difficulty.js"></script>
  <script src="js/rarity.js"></script>
  <script src="js/modes.js"></script>
  <script src="js/progress.js"></script>
  <script src="js/lottery-rewards.js"></script>
  <script src="js/backpack.js"></script>
  <script src="js/daily.js"></script>
  <script src="js/achievements.js"></script>
  <script src="js/tutorial.js"></script>
  <script src="js/levels-data.js"></script>
  <script src="js/audio.js"></script>
  <script src="js/game.js"></script>
</body>
</html>
`;

const target = path.join(__dirname, '..', 'index.html');
fs.writeFileSync(target, html, 'utf8');
console.log('Fixed index.html', fs.readFileSync(target, 'utf8').includes(t.title));

/**
 * 现实奖券抽奖：谢谢惠顾 20%，其余 10 种各 8%
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.LotteryRewards = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const MAX_LOG = 100;

  const WEIGHT_THANKS = 200;
  const WEIGHT_NORMAL = 80;

  const POOL = [
    {
      id: 'snack_plus',
      type: 'reward',
      weight: WEIGHT_NORMAL,
      title: '加1次零食',
      emoji: '🍪',
      desc: '本周可多享受 1 次零食（由家长兑现）',
    },
    {
      id: 'time_plus',
      type: 'reward',
      weight: WEIGHT_NORMAL,
      title: '加30分钟',
      emoji: '⏰',
      desc: '屏幕或娱乐时间增加 30 分钟',
    },
    {
      id: 'toy_buy',
      type: 'reward',
      weight: WEIGHT_NORMAL,
      title: '买1个小玩具',
      emoji: '🧸',
      desc: '可购买 1 个小玩具（由家长兑现）',
    },
    {
      id: 'money_5',
      type: 'reward',
      weight: WEIGHT_NORMAL,
      title: '5元',
      emoji: '💵',
      desc: '零花钱 +5 元（由家长兑现）',
    },
    {
      id: 'money_10',
      type: 'reward',
      weight: WEIGHT_NORMAL,
      title: '10元',
      emoji: '💰',
      desc: '零花钱 +10 元（由家长兑现）',
    },
    {
      id: 'snack_less',
      type: 'deal',
      weight: WEIGHT_NORMAL,
      title: '少1次零食',
      emoji: '🚫',
      desc: '约定：本周少吃 1 次零食',
    },
    {
      id: 'time_minus',
      type: 'deal',
      weight: WEIGHT_NORMAL,
      title: '减30分钟',
      emoji: '⏳',
      desc: '约定：屏幕或娱乐时间减少 30 分钟',
    },
    {
      id: 'dishes_or_toy_less',
      type: 'deal',
      weight: WEIGHT_NORMAL,
      title: '洗1次碗/少买一个玩具',
      emoji: '🍽️',
      desc: '约定：洗碗 1 次，或少买 1 个小玩具（家长选一项）',
    },
    {
      id: 'money_minus_5',
      type: 'deal',
      weight: WEIGHT_NORMAL,
      title: '-5元',
      emoji: '💸',
      desc: '约定：零花钱 -5 元',
    },
    {
      id: 'money_minus_10',
      type: 'deal',
      weight: WEIGHT_NORMAL,
      title: '-10元',
      emoji: '💸',
      desc: '约定：零花钱 -10 元',
    },
    {
      id: 'thanks',
      type: 'thanks',
      weight: WEIGHT_THANKS,
      title: '谢谢惠顾',
      emoji: '🎫',
      desc: '本次无额外奖励，下次好运！',
    },
  ];

  const POOL_BY_ID = Object.fromEntries(POOL.map((p) => [p.id, p]));

  function totalWeight() {
    let n = 0;
    POOL.forEach((p) => {
      n += p.weight || 0;
    });
    return n;
  }

  function getLog() {
    if (typeof Progress === 'undefined') return [];
    const log = Progress.getMeta().lotteryLog;
    return Array.isArray(log) ? log : [];
  }

  function saveLog(log) {
    if (typeof Progress === 'undefined') return;
    Progress.setMeta({ lotteryLog: log.slice(0, MAX_LOG) });
  }

  function formatTime(ts) {
    const d = new Date(ts);
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getMonth() + 1}/${d.getDate()} ${p(d.getHours())}:${p(d.getMinutes())}`;
  }

  function cardLabel(src) {
    if (!src) return '';
    if (/\/25\.png$/i.test(src) || src.includes('tiles/25')) return 'SSS卡 ×1';
    return (src.split('/').pop() || '卡片').replace(/\.[^.]+$/, '');
  }

  function roll(rng) {
    const random = typeof rng === 'function' ? rng : Math.random;
    const total = totalWeight();
    let r = random() * total;
    for (let i = 0; i < POOL.length; i++) {
      r -= POOL[i].weight;
      if (r <= 0) return { ...POOL[i] };
    }
    return { ...POOL[POOL.length - 1] };
  }

  function addRecord(item, cardSrc) {
    const entry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      itemId: item.id,
      type: item.type,
      title: item.title,
      emoji: item.emoji,
      desc: item.desc,
      cardSrc: cardSrc || '',
      cardLabel: cardLabel(cardSrc),
      drawnAt: Date.now(),
      redeemed: item.type === 'thanks',
    };
    const log = [entry, ...getLog()];
    saveLog(log);
    return entry;
  }

  function toggleRedeemed(recordId) {
    const log = getLog().map((r) => {
      if (r.id !== recordId) return r;
      if (r.type === 'thanks') return r;
      return { ...r, redeemed: !r.redeemed };
    });
    saveLog(log);
    return log.find((r) => r.id === recordId) || null;
  }

  function probabilityText() {
    const pctOther = Math.round((WEIGHT_NORMAL / totalWeight()) * 1000) / 10;
    const pctThanks = Math.round((WEIGHT_THANKS / totalWeight()) * 1000) / 10;
    return `谢谢惠顾 ${pctThanks}% · 其余 10 种各 ${pctOther}%`;
  }

  function tagLabel(type) {
    if (type === 'reward') return '正向';
    if (type === 'deal') return '约定';
    return '谢谢惠顾';
  }

  function renderLogListHtml() {
    const log = getLog();
    if (!log.length) {
      return '<p class="lottery-log-empty">还没有抽奖记录，去背包抽一张吧～</p>';
    }
    return (
      '<ul class="lottery-log-list">' +
      log
        .map((r) => {
          const typeCls =
            r.type === 'reward'
              ? 'lottery-log-item--reward'
              : r.type === 'deal'
                ? 'lottery-log-item--deal'
                : 'lottery-log-item--thanks';
          const doneCls = r.redeemed ? ' lottery-log-item--done' : '';
          const tag = tagLabel(r.type);
          const card = r.cardLabel ? ` · 消耗 ${r.cardLabel}` : '';
          const action =
            r.type === 'thanks'
              ? '<span class="lottery-log-note">无需兑现</span>'
              : '<button type="button" class="lottery-log-toggle" data-id="' +
                r.id +
                '">' +
                (r.redeemed ? '已兑现' : '标记兑现') +
                '</button>';
          return (
            '<li class="lottery-log-item ' +
            typeCls +
            doneCls +
            '" data-id="' +
            r.id +
            '">' +
            '<div class="lottery-log-main">' +
            `<span class="lottery-log-emoji" aria-hidden="true">${r.emoji || '🎀'}</span>` +
            '<div class="lottery-log-text">' +
            `<p class="lottery-log-title"><span class="lottery-log-tag">${tag}</span> ${r.title}</p>` +
            `<p class="lottery-log-desc">${r.desc}${card}</p>` +
            `<p class="lottery-log-time">${formatTime(r.drawnAt)}</p>` +
            '</div>' +
            '</div>' +
            action +
            '</li>'
          );
        })
        .join('') +
      '</ul>'
    );
  }

  function renderPoolLegendHtml() {
    const rewards = POOL.filter((p) => p.type === 'reward');
    const deals = POOL.filter((p) => p.type === 'deal');
    const thanks = POOL.filter((p) => p.type === 'thanks');
    const chip = (p) =>
      `<span class="lottery-pool-chip lottery-pool-chip--${p.type}">${p.emoji} ${p.title}</span>`;
    return (
      '<div class="lottery-pool-legend">' +
      '<p class="lottery-pool-legend-title">正向</p>' +
      '<div class="lottery-pool-chips">' +
      rewards.map(chip).join('') +
      '</div>' +
      '<p class="lottery-pool-legend-title">约定</p>' +
      '<div class="lottery-pool-chips">' +
      deals.map(chip).join('') +
      '</div>' +
      '<p class="lottery-pool-legend-title">谢谢惠顾</p>' +
      '<div class="lottery-pool-chips">' +
      thanks.map(chip).join('') +
      '</div>' +
      `<p class="lottery-pool-meta">${probabilityText()}</p>` +
      '</div>'
    );
  }

  return {
    POOL,
    POOL_BY_ID,
    WEIGHT_THANKS,
    WEIGHT_NORMAL,
    roll,
    addRecord,
    getLog,
    toggleRedeemed,
    probabilityText,
    tagLabel,
    formatTime,
    renderLogListHtml,
    renderPoolLegendHtml,
  };
});

/* 唯一入口：按依赖顺序 import，扫一眼就知道谁依赖谁。 */
import './namespace.js';
import './boot.js';      // 单实例守卫：必须排在 game.js 之前
import './data.js';
import './core.js';
import './world.js';
import './overworld.js';
import './combat.js';
import './status.js';
import './sfx.js';
import './three-pick.js';
import './hd-draw.js';
import './iso-ground.js';
import './iso-art.js';
import './tile-plate.js';
import './render-three.js';
import './game.js';      // 末尾按 DL.SingleTab 决定开局；debug 下顺带挂 window.__dl

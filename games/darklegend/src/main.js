/* 唯一入口：按依赖顺序 import，扫一眼就知道谁依赖谁。 */
import { DL } from './namespace.js';
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
import './game.js';

if (typeof window !== 'undefined' && window.__dl) window.__dl.DL = DL;

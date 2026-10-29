/* 单实例守卫的创建点：必须排在 game.js 之前。
   game.js 在模块体里就会看 DL.SingleTab 决定「现在开局」还是「先等锁」，
   而打包成单文件后动态 import 会被内联成同步执行，靠 .then 拦不住——
   所以守卫既要在 game.js 之前建好，game.js 自己也要按它决定开不开局。 */
import { DL } from './namespace.js';
import { createSingleTab } from './single-tab.js';

DL.SingleTab = createSingleTab();

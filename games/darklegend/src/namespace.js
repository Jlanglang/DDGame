/* DL 命名空间（模块注册表）。
   保留它是为了让 window.__dl、渲染层桥、以及全部既有测试继续有效。 */
if (typeof globalThis.window === 'undefined') globalThis.window = globalThis;
export const DL = (globalThis.DL = globalThis.DL || {});

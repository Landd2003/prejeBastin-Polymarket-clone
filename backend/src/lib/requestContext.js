import { createNamespace } from 'cls-hooked';
export const ns = createNamespace('req');
export const setCtx = (k, v) => ns.set(k, v);
export const getCtx = (k) => ns.get(k);
export const runWithCtx = (req, res, next) => ns.run(() => next());

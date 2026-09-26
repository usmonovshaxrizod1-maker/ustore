import { createPort } from './simple.js';
export const createCartPort = (adapter) => createPort(adapter, ['load','mergeGuest','updateLine','clear','quote'], 'cart');

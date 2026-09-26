import { createPort } from './simple.js';
export const createCartPort = (adapter) => createPort(adapter, ['load','mergeGuest','addLine','updateLine','clear','quote'], 'cart');

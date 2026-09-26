import { createPort } from './simple.js';
export const createOrdersPort = (adapter) => createPort(adapter, ['create','listMine','getMine','cancelMine','confirmReceived'], 'orders');

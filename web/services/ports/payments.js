import { createPort } from './simple.js';
export const createPaymentsPort = (adapter) => createPort(adapter, ['start','getStatus'], 'payments');

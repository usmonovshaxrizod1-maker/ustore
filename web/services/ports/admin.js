import { createPort } from './simple.js';
export const createAdminPort = (adapter) => createPort(adapter, ['invoke'], 'admin');

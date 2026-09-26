import { createPort } from './simple.js';
export const createPlatformPort = (adapter) => createPort(adapter, ['invoke'], 'platform');

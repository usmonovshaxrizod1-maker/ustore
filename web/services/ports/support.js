import { createPort } from './simple.js';
export const createSupportPort = (adapter) => createPort(adapter, ['listThreads','getMessages','sendMessage','uploadAttachment'], 'support');

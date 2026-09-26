import { createPort } from './simple.js';
export const createProfilePort = (adapter) => createPort(adapter, ['get','update','listFavorites','setFavorite'], 'profile');

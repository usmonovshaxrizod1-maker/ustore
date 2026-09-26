import { createPort } from './simple.js';
const REQUIRED = ['list','add','verify','setPrimary','remove'];
const OPTIONAL = ['getMiniAppTarget','setMiniAppTarget'];
export function createDomainsPort(adapter) {
  const base = createPort(adapter, REQUIRED, 'domains');
  const port = { ...base };
  for (const method of OPTIONAL) if (typeof adapter?.[method] === 'function') port[method] = createPort(adapter, [method], 'domains')[method];
  return Object.freeze(port);
}

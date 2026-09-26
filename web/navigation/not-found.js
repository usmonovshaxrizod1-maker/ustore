import { createStatePanel } from '../components/ui.js';
import { createTranslator } from '../i18n/index.js';

export function createNotFoundView(options = {}, documentRef) {
  const tr = createTranslator(options.locale || 'uz');
  const {
    title = tr.t('route.notFound.title', 'Sahifa topilmadi'),
    message = tr.t('route.notFound.message', 'Havola noto‘g‘ri yoki sahifa boshqa manzilga ko‘chirilgan.'),
    actionLabel = tr.t('route.notFound.home', 'Bosh sahifaga qaytish'),
    onHome,
  } = options;
  const panel = createStatePanel({
    kind: 'error',
    title,
    message,
    actionLabel,
    onAction: onHome,
    iconText: '404',
  }, documentRef);
  panel.dataset.routeState = 'not-found';
  return panel;
}

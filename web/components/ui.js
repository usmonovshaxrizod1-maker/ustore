const BUTTON_VARIANTS = new Set(['primary', 'secondary', 'ghost', 'danger']);
const BUTTON_SIZES = new Set(['sm', 'md', 'lg']);
const TOAST_TONES = new Set(['success', 'warning', 'danger', 'info']);
const STATE_KINDS = new Set(['empty', 'error', 'permission', 'offline', 'warning', 'success', 'loading']);

function getDocument(documentRef) {
  const doc = documentRef ?? globalThis.document;
  if (!doc?.createElement) throw new Error('DOM document is required to build UStorE web UI components.');
  return doc;
}

function appendContent(target, content) {
  if (content == null) return;
  if (Array.isArray(content)) {
    content.forEach((item) => appendContent(target, item));
    return;
  }
  if (typeof content === 'string' || typeof content === 'number') {
    target.append(String(content));
    return;
  }
  target.append(content);
}

function uid(prefix = 'uw') {
  if (globalThis.crypto?.randomUUID) return `${prefix}-${globalThis.crypto.randomUUID()}`;
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function createButton(options = {}, documentRef) {
  const doc = getDocument(documentRef);
  const {
    label = '',
    variant = 'primary',
    size = 'md',
    type = 'button',
    disabled = false,
    busy = false,
    ariaLabel,
    onClick,
  } = options;
  if (!BUTTON_VARIANTS.has(variant)) throw new Error(`Unknown button variant: ${variant}`);
  if (!BUTTON_SIZES.has(size)) throw new Error(`Unknown button size: ${size}`);

  const button = doc.createElement('button');
  button.type = type;
  button.className = `uw-button uw-button--${variant} uw-button--${size}`;
  button.disabled = Boolean(disabled || busy);
  if (ariaLabel) button.setAttribute('aria-label', ariaLabel);
  if (busy) {
    button.setAttribute('aria-busy', 'true');
    button.dataset.loading = 'true';
    const spinner = doc.createElement('span');
    spinner.className = 'uw-button__spinner';
    spinner.setAttribute('aria-hidden', 'true');
    button.append(spinner);
  }
  const labelNode = doc.createElement('span');
  labelNode.className = 'uw-button__label';
  labelNode.textContent = String(label);
  button.append(labelNode);
  if (typeof onClick === 'function') button.addEventListener('click', onClick);
  return button;
}

export function createTextField(options = {}, documentRef) {
  const doc = getDocument(documentRef);
  const {
    id = uid('field'),
    label,
    name = '',
    type = 'text',
    value = '',
    placeholder = '',
    help = '',
    error = '',
    required = false,
    disabled = false,
    autocomplete,
    inputMode,
  } = options;
  if (!label) throw new Error('Text field label is required.');

  const wrapper = doc.createElement('div');
  wrapper.className = 'uw-field';

  const labelNode = doc.createElement('label');
  labelNode.className = 'uw-field__label';
  labelNode.htmlFor = id;
  labelNode.textContent = String(label);
  if (required) {
    const mark = doc.createElement('span');
    mark.className = 'uw-field__required';
    mark.textContent = '*';
    mark.setAttribute('aria-hidden', 'true');
    labelNode.append(mark);
  }

  const input = doc.createElement('input');
  input.className = 'uw-field__control';
  input.id = id;
  input.name = name;
  input.type = type;
  input.value = value;
  input.placeholder = placeholder;
  input.required = Boolean(required);
  input.disabled = Boolean(disabled);
  if (autocomplete) input.autocomplete = autocomplete;
  if (inputMode) input.inputMode = inputMode;

  const describedBy = [];
  if (help) {
    const helpNode = doc.createElement('p');
    helpNode.className = 'uw-field__help';
    helpNode.id = `${id}-help`;
    helpNode.textContent = String(help);
    describedBy.push(helpNode.id);
    wrapper.append(labelNode, input, helpNode);
  } else {
    wrapper.append(labelNode, input);
  }

  if (error) {
    const errorNode = doc.createElement('p');
    errorNode.className = 'uw-field__error';
    errorNode.id = `${id}-error`;
    errorNode.textContent = String(error);
    input.setAttribute('aria-invalid', 'true');
    describedBy.push(errorNode.id);
    wrapper.append(errorNode);
  }
  if (describedBy.length) input.setAttribute('aria-describedby', describedBy.join(' '));

  return { element: wrapper, input, label: labelNode };
}

export function createSelectField(options = {}, documentRef) {
  const doc = getDocument(documentRef);
  const {
    id = uid('select'),
    label,
    name = '',
    value = '',
    options: choices = [],
    help = '',
    error = '',
    required = false,
    disabled = false,
  } = options;
  if (!label) throw new Error('Select field label is required.');

  const wrapper = doc.createElement('div');
  wrapper.className = 'uw-field';
  const labelNode = doc.createElement('label');
  labelNode.className = 'uw-field__label';
  labelNode.htmlFor = id;
  labelNode.textContent = String(label);

  const select = doc.createElement('select');
  select.className = 'uw-field__control';
  select.id = id;
  select.name = name;
  select.required = Boolean(required);
  select.disabled = Boolean(disabled);

  for (const choice of choices) {
    const option = doc.createElement('option');
    const item = typeof choice === 'string' ? { value: choice, label: choice } : choice;
    option.value = String(item.value ?? '');
    option.textContent = String(item.label ?? item.value ?? '');
    option.disabled = Boolean(item.disabled);
    option.selected = option.value === String(value);
    select.append(option);
  }

  const describedBy = [];
  wrapper.append(labelNode, select);
  if (help) {
    const helpNode = doc.createElement('p');
    helpNode.className = 'uw-field__help';
    helpNode.id = `${id}-help`;
    helpNode.textContent = String(help);
    describedBy.push(helpNode.id);
    wrapper.append(helpNode);
  }
  if (error) {
    const errorNode = doc.createElement('p');
    errorNode.className = 'uw-field__error';
    errorNode.id = `${id}-error`;
    errorNode.textContent = String(error);
    select.setAttribute('aria-invalid', 'true');
    describedBy.push(errorNode.id);
    wrapper.append(errorNode);
  }
  if (describedBy.length) select.setAttribute('aria-describedby', describedBy.join(' '));
  return { element: wrapper, select, label: labelNode };
}

export function createCard(options = {}, documentRef) {
  const doc = getDocument(documentRef);
  const { title = '', description = '', body, actions = [] } = options;
  const card = doc.createElement('section');
  card.className = 'uw-card';
  if (title || description) {
    const header = doc.createElement('header');
    header.className = 'uw-card__header';
    if (title) {
      const titleNode = doc.createElement('h3');
      titleNode.className = 'uw-card__title';
      titleNode.textContent = String(title);
      header.append(titleNode);
    }
    if (description) {
      const descriptionNode = doc.createElement('p');
      descriptionNode.className = 'uw-card__description';
      descriptionNode.textContent = String(description);
      header.append(descriptionNode);
    }
    card.append(header);
  }
  if (body != null) {
    const bodyNode = doc.createElement('div');
    bodyNode.className = 'uw-card__body';
    appendContent(bodyNode, body);
    card.append(bodyNode);
  }
  if (actions.length) {
    const actionsNode = doc.createElement('div');
    actionsNode.className = 'uw-card__actions';
    appendContent(actionsNode, actions);
    card.append(actionsNode);
  }
  return card;
}

export function createToast(options = {}, documentRef) {
  const doc = getDocument(documentRef);
  const {
    tone = 'info',
    title = '',
    message = '',
    actionLabel = '',
    onAction,
    closeLabel = 'Yopish',
    onClose,
  } = options;
  if (!TOAST_TONES.has(tone)) throw new Error(`Unknown toast tone: ${tone}`);

  const toast = doc.createElement('div');
  toast.className = 'uw-toast';
  toast.dataset.tone = tone;
  toast.setAttribute('role', tone === 'danger' ? 'alert' : 'status');
  toast.setAttribute('aria-live', tone === 'danger' ? 'assertive' : 'polite');
  toast.setAttribute('aria-atomic', 'true');

  const content = doc.createElement('div');
  content.className = 'uw-toast__content';
  if (title) {
    const titleNode = doc.createElement('p');
    titleNode.className = 'uw-toast__title';
    titleNode.textContent = String(title);
    content.append(titleNode);
  }
  if (message) {
    const messageNode = doc.createElement('p');
    messageNode.className = 'uw-toast__message';
    messageNode.textContent = String(message);
    content.append(messageNode);
  }
  toast.append(content);

  const actions = doc.createElement('div');
  actions.className = 'uw-toast__actions';
  if (actionLabel) actions.append(createButton({ label: actionLabel, variant: 'ghost', size: 'sm', onClick: onAction }, doc));
  const close = createButton({ label: '×', variant: 'ghost', size: 'sm', ariaLabel: closeLabel, onClick: onClose }, doc);
  close.dataset.toastClose = 'true';
  actions.append(close);
  toast.append(actions);
  return toast;
}

export function createSkeleton(options = {}, documentRef) {
  const doc = getDocument(documentRef);
  const { width, height, radius, label = 'Yuklanmoqda' } = options;
  const node = doc.createElement('span');
  node.className = 'uw-skeleton';
  if (width) node.style.width = width;
  if (height) node.style.height = height;
  if (radius) node.style.borderRadius = radius;
  if (label) {
    node.setAttribute('role', 'status');
    node.setAttribute('aria-label', label);
  } else {
    node.setAttribute('aria-hidden', 'true');
  }
  return node;
}

export function createStatePanel(options = {}, documentRef) {
  const doc = getDocument(documentRef);
  const {
    kind = 'empty',
    title,
    message = '',
    actionLabel = '',
    onAction,
    iconText = 'i',
  } = options;
  if (!STATE_KINDS.has(kind)) throw new Error(`Unknown state kind: ${kind}`);
  if (!title) throw new Error('State panel title is required.');

  const panel = doc.createElement('section');
  panel.className = 'uw-state';
  panel.dataset.kind = kind;
  if (kind === 'error') panel.setAttribute('role', 'alert');
  if (kind === 'loading') {
    panel.setAttribute('role', 'status');
    panel.setAttribute('aria-live', 'polite');
    panel.setAttribute('aria-busy', 'true');
  }

  const inner = doc.createElement('div');
  inner.className = 'uw-state__inner';
  const icon = doc.createElement('span');
  icon.className = 'uw-state__icon';
  icon.setAttribute('aria-hidden', 'true');
  icon.textContent = iconText;
  const titleNode = doc.createElement('h2');
  titleNode.className = 'uw-state__title';
  titleNode.textContent = String(title);
  inner.append(icon, titleNode);
  if (message) {
    const messageNode = doc.createElement('p');
    messageNode.className = 'uw-state__message';
    messageNode.textContent = String(message);
    inner.append(messageNode);
  }
  if (actionLabel) {
    const actionWrap = doc.createElement('div');
    actionWrap.className = 'uw-state__action';
    actionWrap.append(createButton({ label: actionLabel, variant: kind === 'error' ? 'secondary' : 'primary', onClick: onAction }, doc));
    inner.append(actionWrap);
  }
  panel.append(inner);
  return panel;
}

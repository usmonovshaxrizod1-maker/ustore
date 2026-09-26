const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

function focusableElements(container) {
  if (!container?.querySelectorAll) return [];
  return Array.from(container.querySelectorAll(FOCUSABLE_SELECTOR)).filter((element) => {
    if (element.hidden) return false;
    if (element.getAttribute?.('aria-hidden') === 'true') return false;
    return typeof element.focus === 'function';
  });
}

export function createFocusTrap(container, options = {}) {
  if (!container?.addEventListener) throw new Error('Focus trap requires a DOM container.');
  const documentRef = options.documentRef || container.ownerDocument || globalThis.document;
  let previousFocus = null;
  let active = false;

  const onKeyDown = (event) => {
    if (!active) return;
    if (event.key === 'Escape') {
      event.preventDefault?.();
      options.onEscape?.();
      return;
    }
    if (event.key !== 'Tab') return;
    const items = focusableElements(container);
    if (!items.length) {
      event.preventDefault?.();
      container.focus?.();
      return;
    }
    const first = items[0];
    const last = items[items.length - 1];
    const current = documentRef?.activeElement;
    if (event.shiftKey && (current === first || !items.includes(current))) {
      event.preventDefault?.();
      last.focus();
    } else if (!event.shiftKey && (current === last || !items.includes(current))) {
      event.preventDefault?.();
      first.focus();
    }
  };

  return {
    activate() {
      if (active) return;
      active = true;
      previousFocus = documentRef?.activeElement || null;
      container.addEventListener('keydown', onKeyDown);
      const [first] = focusableElements(container);
      if (first) first.focus();
      else {
        if (container.tabIndex == null || container.tabIndex < 0) container.tabIndex = -1;
        container.focus?.();
      }
    },
    deactivate({ restoreFocus = true } = {}) {
      if (!active) return;
      active = false;
      container.removeEventListener?.('keydown', onKeyDown);
      if (restoreFocus && previousFocus?.focus) previousFocus.focus();
      previousFocus = null;
    },
    isActive() { return active; },
  };
}

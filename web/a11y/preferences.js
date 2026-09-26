export function prefersReducedMotion(windowRef = globalThis.window) {
  try {
    return windowRef?.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true;
  } catch (_) {
    return false;
  }
}

export function preferredScrollBehavior(windowRef = globalThis.window) {
  return prefersReducedMotion(windowRef) ? 'auto' : 'smooth';
}

export function scrollElementIntoView(element, options = {}, windowRef = globalThis.window) {
  if (!element?.scrollIntoView) return false;
  const behavior = options.behavior === 'auto' ? 'auto' : preferredScrollBehavior(windowRef);
  element.scrollIntoView({ block: options.block || 'start', inline: options.inline || 'nearest', behavior });
  return true;
}

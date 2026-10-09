// Bound startup reads, including response-body stalls. Callers keep their
// existing error mapping; timed-out writes are never retried automatically.
export async function fetchJsonWithTimeout(fetchImpl, url, options, timeoutMs = 20000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, { ...options, signal: controller.signal });
    const data = await response.json();
    return { response, data };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Shared SWR fetcher with consistent error handling and API envelope unwrapping.
 * Use this across all useSWR calls for consistent behavior.
 */
function getApiErrorMessage(payload: unknown): string | undefined {
  if (!payload || typeof payload !== 'object') return undefined;
  const candidate = payload as { [key: string]: unknown };

  const errorValue = candidate.error;
  if (typeof errorValue === 'string') return errorValue;
  if (errorValue && typeof errorValue === 'object') {
    const nested = errorValue as { message?: unknown; [key: string]: unknown };
    if (typeof nested.message === 'string') return nested.message;
  }

  if (typeof candidate.message === 'string') return candidate.message;
  return undefined;
}

function formatApiError(status: number, statusText: string, payloadMessage?: string) {
  return payloadMessage ? `${payloadMessage} (${status})` : `API error: ${status}${statusText ? ` ${statusText}` : ''}`;
}

export async function fetcher<T = unknown>(url: string): Promise<T> {
  const res = await fetch(url);
  const json = await res.json().catch(() => undefined);
  if (!res.ok) {
    const message = getApiErrorMessage(json);
    throw new Error(formatApiError(res.status, res.statusText, message));
  }

  // Some callsites still use legacy non-enveloped responses; preserve their
  // direct payload shape.
  if (json && typeof json === 'object' && 'success' in json && json.success === false) {
    const message = getApiErrorMessage(json);
    throw new Error(formatApiError(res.status, res.statusText, message));
  }

  // Unwrap standard API envelope { success, data } if present.
  return (json && typeof json === 'object' && 'data' in json) ? (json as { data: T }).data : (json as T);
}

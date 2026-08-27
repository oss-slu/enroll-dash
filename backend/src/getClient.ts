export interface requestOptions {
    headers?: Record<string, string>;
    signal?: AbortSignal;
    timeoutMs?: number;
}

export class HttpError extends Error {
  readonly status: number;
  readonly statusText: string;
  readonly url: string;
  readonly body?: unknown;

  constructor(status: number, statusText: string, url: string, body?: unknown) {
    super(`HTTP ${status} ${statusText} for ${url}`);
    this.name = "HttpError";
    this.status = status;
    this.statusText = statusText;
    this.url = url;
    this.body = body;
  }
}

const DEFAULT_HEADERS: Record<string, string> = {
    Accept: 'application/json'
};

const DEFAULT_TIMEOUT_MS = 10_000;

export async function getJSON<T>(url: string, options: requestOptions = {}): Promise<T> {
    const { headers = {}, signal, timeoutMs = DEFAULT_TIMEOUT_MS } = options; 
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    if (signal) {
        signal.addEventListener('abort', () => controller.abort(), { once: true });
    }

    try {
        const resp = await fetch(url, {
            method: 'GET',
            headers: { ...DEFAULT_HEADERS, ...headers },
            signal: controller.signal,
        });

        if (!resp.ok) {
            let body: unknown;
            try {
                body = await resp.json();
            } catch {
                body = await resp.text().catch(() => undefined);
            }
            throw new HttpError(resp.status, resp.statusText, url, body);
        }
        return (await resp.json()) as T;
    } catch (err) {
        if (err instanceof HttpError) throw err;
        if (err instanceof Error && err.name === 'AbortError') {
            throw new Error(`Request to ${url} timed out after ${timeoutMs}`);
        }
        throw err;
    } finally {
        clearTimeout(timeout);
    }
}
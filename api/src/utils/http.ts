import type { requestOptions } from "../types/http";
import HttpError from "../errs/http";

const DEFAULT_HEADERS: Record<string, string> = {
    Accept: 'application/json',
};

const DEFAULT_TIMEOUT_MS = 10_000;

// Send an HTTP GET request expecting JSON response of type <T>
export async function getJson<T>(
    url: string,
    options: requestOptions = {},
): Promise<T> {
    const { headers = {}, signal, timeoutMs = DEFAULT_TIMEOUT_MS } = options;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    if (signal) {
        signal.addEventListener('abort', () => controller.abort(), {
            once: true,
        });
    }

    try {
        const resp = await fetch(url, {
            method: 'GET',
            headers: { ...DEFAULT_HEADERS, ...headers },
            signal: controller.signal,
        });

        if (!resp.ok) {
            let body: unknown;
            let parseErr: unknown;
            try {
                body = await resp.json();
            } catch (err) {
                parseErr = err;
                body = await resp.text().catch(() => undefined);
            }
            throw new HttpError(resp.status, resp.statusText, url, body, {
                cause: parseErr,
            });
        }
        return (await resp.json()) as T;
    } catch (err) {
        if (err instanceof HttpError) {
            throw err;
        }
        if (err instanceof Error && err.name === 'AbortError') {
            throw new Error(
                `Request to ${url} timed out after ${timeoutMs}ms`,
                { cause: err },
            );
        }
        throw err;
    } finally {
        clearTimeout(timeout);
    }
}
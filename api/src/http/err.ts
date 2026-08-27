export default class HttpError extends Error {
    readonly status: number;
    readonly statusText: string;
    readonly url: string;
    readonly body?: unknown;

    constructor(
        status: number,
        statusText: string,
        url: string,
        body?: unknown,
        options?: { cause: unknown },
    ) {
        super(`HTTP ${status} ${statusText} for ${url}`, options);
        this.name = 'HttpError';
        this.status = status;
        this.statusText = statusText;
        this.url = url;
        this.body = body;
    }
}
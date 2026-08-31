// Options for HTTP get request
export type requestOptions = {
    headers?: Record<string, string>;
    signal?: AbortSignal;
    timeoutMs?: number;
};

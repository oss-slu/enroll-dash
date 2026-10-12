import { jest } from '@jest/globals';
import { getJson } from '../../utils/http';

afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
});

it('uses a caller cancellation signal and refuses an already cancelled request', async () => {
    const controller = new AbortController();
    controller.abort(new Error('cancelled'));
    const fetchMock = jest
        .spyOn(globalThis, 'fetch')
        .mockImplementation(async (_url, options) => {
            const signal = options!.signal!;
            expect(signal.aborted).toBe(true);
            throw signal.reason;
        });
    await expect(
        getJson('https://example.com', { signal: controller.signal }),
    ).rejects.toThrow('cancelled');
    expect(fetchMock).toHaveBeenCalledTimes(1);
});

it('aborts an outstanding request at its per-call deadline and clears the timer', async () => {
    jest.useFakeTimers();
    let upstream: AbortSignal;
    jest.spyOn(globalThis, 'fetch').mockImplementation(
        (_url, options) =>
            new Promise((_resolve, reject) => {
                upstream = options!.signal!;
                upstream.addEventListener(
                    'abort',
                    () => reject(upstream.reason),
                    { once: true },
                );
            }),
    );
    const pending = getJson('https://example.com', { timeoutMs: 10 });
    const rejected = expect(pending).rejects.toMatchObject({
        name: 'TimeoutError',
    });
    await jest.advanceTimersByTimeAsync(11);
    await rejected;
    expect(upstream!.aborted).toBe(true);
    expect(jest.getTimerCount()).toBe(0);
});

it('removes the caller abort listener when a request completes', async () => {
    const controller = new AbortController();
    const remove = jest.spyOn(controller.signal, 'removeEventListener');
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response('{"ok":true}', { status: 200 }),
    );
    expect(
        await getJson('https://example.com', { signal: controller.signal }),
    ).toEqual({ ok: true });
    expect(remove).toHaveBeenCalledWith('abort', expect.any(Function));
});

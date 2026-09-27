import { jest } from '@jest/globals';
import request from 'supertest';
import HttpError from '../../errs/http';
import type { censusGeocodeResp } from '../../types/census';

const getJson = jest.fn<(url: string) => Promise<censusGeocodeResp>>();
jest.unstable_mockModule('../../utils/http', () => ({ getJson }));
const { createApp } = await import('../../app');
const app = createApp();
const address = '6957 Chippewa St, Saint Louis, MO 63109';
const response: censusGeocodeResp = {
    result: {
        input: { address: { address } },
        addressMatches: [
            {
                matchedAddress: address,
                coordinates: { x: -90, y: 38 },
                geographies: {
                    'Census Block Groups': [
                        {
                            GEOID: '290000000000',
                            STATE: '29',
                            COUNTY: '189',
                            TRACT: '000000',
                            BLKGRP: '1',
                            BASENAME: '1',
                        },
                    ],
                },
            },
        ],
    },
};

describe.each(['get', 'post'] as const)('%s /geocode', (method) => {
    const send = (addr: unknown) =>
        method === 'get'
            ? request(app).get('/geocode').query({ addr })
            : request(app).post('/geocode').send({ addr });

    beforeEach(() => getJson.mockReset());

    it.each(['', '   ', 'PO Box 123, Saint Louis, MO 63109'])(
        'rejects invalid input without calling Census: %s',
        async (addr) => {
            const res = await send(addr);
            expect(res.status).toBe(400);
            expect(res.body.ok).toBe(false);
            expect(res.body.suggested).toBeUndefined();
            expect(getJson).not.toHaveBeenCalled();
        },
    );

    it.each([
        undefined,
        ['123 Main St', '456 Main St'],
        { street: '123 Main St' },
    ])('rejects missing or non-string input: %j', async (addr) => {
        const res = await send(addr);
        expect(res.status).toBe(400);
        expect(res.body.ok).toBe(false);
        expect(getJson).not.toHaveBeenCalled();
    });

    it('returns a suggestion without silently applying it', async () => {
        const original = `  ${address} `;
        const res = await send(original);
        expect(res.status).toBe(400);
        expect(res.body).toEqual({
            ok: false,
            original,
            suggested: address,
            error: 'Unsupported address format',
        });
        expect(getJson).not.toHaveBeenCalled();
    });

    it('geocodes the original valid address unchanged', async () => {
        getJson.mockResolvedValue(response);
        const res = await send(address);
        expect(res.status).toBe(200);
        expect(res.body).toEqual({
            matchedAddress: address,
            latitude: 38,
            longitude: -90,
            blockGeoid: '290000000000',
            state: '29',
            county: '189',
            tract: '000000',
            blkgrp: '1',
        });
        expect(getJson).toHaveBeenCalledTimes(1);
        expect(
            new URL(getJson.mock.calls[0][0]).searchParams.get('address'),
        ).toBe(address);
    });

    it('returns a single no-match response', async () => {
        getJson.mockResolvedValue({
            result: { input: { address: { address } }, addressMatches: [] },
        });
        const res = await send(address);
        expect(res.status).toBe(200);
        expect(res.body).toEqual({
            ok: false,
            error: `No address matches for ${address}`,
        });
    });

    it('preserves the Census error response', async () => {
        getJson.mockRejectedValue(
            new HttpError(503, 'Service Unavailable', 'https://example.com'),
        );
        const res = await send(address);
        expect(res.body).toEqual({
            ok: false,
            error: 'Census API error: 503 Service Unavailable',
        });
    });

    it('handles an unexpected upstream failure', async () => {
        getJson.mockRejectedValue(new Error('Connection failed'));
        const res = await send(address);
        expect(res.body).toEqual({
            ok: false,
            error: 'Unexpected error: Error: Connection failed',
        });
    });
});

it('rejects a POST without a body', async () => {
    getJson.mockReset();
    const res = await request(app).post('/geocode');
    expect(res.status).toBe(400);
    expect(getJson).not.toHaveBeenCalled();
});

it.each([123, null, true])(
    'rejects a non-string POST address: %j',
    async (addr) => {
        getJson.mockReset();
        const res = await request(app).post('/geocode').send({ addr });
        expect(res.status).toBe(400);
        expect(getJson).not.toHaveBeenCalled();
    },
);

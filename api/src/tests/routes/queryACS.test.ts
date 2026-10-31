import { jest } from '@jest/globals';
import request from 'supertest';
import type { geocodeBlockResult } from '../../types/census';

type QueryRow = Record<string, unknown>;

const query = jest.fn<
    (text: string, params?: unknown[]) => Promise<{ rows: QueryRow[] }>
>();

const getGeocodeFromAddr = jest.fn<
    (address: string) => Promise<geocodeBlockResult | null>
>();

jest.unstable_mockModule('../../db/connect', () => ({ query }));
jest.unstable_mockModule('../../utils/census', () => ({
    getGeocodeFromAddr,
}));

const { createApp } = await import('../../app');
const app = createApp();

const address = '6957 Chippewa St, Saint Louis, MO 63109';
const rawGeoid = '290000000000';
const normalizedGeoid = `15000US${rawGeoid}`;

const geocodeResult: geocodeBlockResult = {
    matchedAddress: '6957 Chippewa St, Saint Louis, MO 63109',
    latitude: 38,
    longitude: -90,
    blockGeoid: rawGeoid,
    state: '29',
    county: '189',
    tract: '000000',
    blkgrp: '1',
};

const metadataRows = [
    { table_id: 'b02001', column_id: 'b02001001' },
    { table_id: 'b02001', column_id: 'b02001002' },
    { table_id: 'b02001', column_id: 'b02001003' },
];

describe('/query-acs', () => {
    beforeEach(() => {
        query.mockReset();
        getGeocodeFromAddr.mockReset();
    });

    it ('queries ACS data using a raw GEOID', async () => {
        query
        .mockResolvedValueOnce({ rows: [metadataRows[0]] })
        .mockResolvedValueOnce({
            rows: [{ geoid: normalizedGeoid, B02001001: 17 }],
        });

        const response = await request(app)
            .post('/query-acs')
            .send({
                geoid: rawGeoid,
                tables: ['B02001'],
                columns: ['B02001001'],
            });
        
        expect(response.status).toBe(200);
        expect(response.body).toEqual({
            ok: true,
            geoid: normalizedGeoid,
            data: { geoid: normalizedGeoid, B02001001: 17 },
        });
        expect(getGeocodeFromAddr).not.toHaveBeenCalled();
        expect(query).toHaveBeenCalledTimes(2);
        expect(query.mock.calls[1][1]).toEqual([normalizedGeoid]);
    });

    it('geocodes an address before querying ACS data', async () => {
        getGeocodeFromAddr.mockResolvedValue(geocodeResult);
        query
            .mockResolvedValueOnce({ rows: [metadataRows[0]] })
            .mockResolvedValueOnce({
                rows: [{ geoid: normalizedGeoid, B02001001: 17}],
            });

        const response = await request(app)
            .post('/query-acs')
            .send({
                address,
                tables: ['B02001'],
                columns: ['B02001001'],
            });
        
        expect(response.status).toBe(200);
        expect(getGeocodeFromAddr).toHaveBeenCalledWith(address);
        expect(query.mock.calls[1][1]).toEqual([normalizedGeoid]);
        expect(response.body.data.B02001001).toBe(17);
    });

    it('accepts a GEOID with the 15000 prefix', async () => {
        query
            .mockResolvedValueOnce({ rows: [metadataRows[0]] })
            .mockResolvedValueOnce({ rows: [{geoid: normalizedGeoid, B02001001: 17}], 
            });

         const response = await request(app)
            .post('/query-acs')
            .send({
                geoid: normalizedGeoid,
                tables: ['B02001'],
                columns: ['B02001001'],
            });
    
    expect(response.status).toBe(200);
    expect(query.mock.calls[1][1]).toEqual([normalizedGeoid]);
    });

    it.each([
        [{ tables: ['B02001'], columns: ['B02001001'] }],
        [
            {
                address,
                geoid: rawGeoid,
                tables: ['B02001'],
                columns: ['B02001001'],
            },
        ],
    ])('rejects a request without 1 location: %j', async (body) => {
        const response = await request(app).post('/query-acs').send(body);
        expect(response.status).toBe(400);
        expect(query).not.toHaveBeenCalled();
        expect(getGeocodeFromAddr).not.toHaveBeenCalled();
    });

    it('rejects an invalid address without calling the geocoder', async () => {
        const response = await request(app)
            .post('/query-acs')
            .send({
                address: 'PO Box 123, Saint Louis, MO 63109',
                tables: ['B02001'],
                columns: ['B02001001'],
            });

        expect(response.status).toBe(400);
        expect(getGeocodeFromAddr).not.toHaveBeenCalled();
        expect(query).not.toHaveBeenCalled();
    });

    it('returns not found when the geocoder has no match', async () => {
        getGeocodeFromAddr.mockResolvedValue(null);

        const response = await request(app)
            .post('/query-acs')
            .send({
                address,
                tables: ['B02001'],
                columns: ["B02001001"],
            });

        expect(response.status).toBe(404);
        expect(query).not.toHaveBeenCalled();
    });

    it('rejects a malformed GEOID before querying the database', async () => {
        const response = await request(app)
            .post('/query-acs')
            .send({
                geoid: '12345',
                tables: ['B02001'],
                columns: ["B02001001"],
            });

        expect(response.status).toBe(400);
        expect(query).not.toHaveBeenCalled();
    });

    it('rejects columns not in requested table', async () => {
        query.mockResolvedValueOnce({ rows: [] });
        const response = await request(app)
            .post('/query-acs')
            .send({
                geoid: rawGeoid,
                tables: ['B02001'],
                columns: ["B02001999"],
            });

        expect(response.status).toBe(400);
        expect(query).toHaveBeenCalledTimes(1);
    });

    it('returns not found when ACS has no row for the GEOID', async () => {
        query
            .mockResolvedValueOnce({ rows: [metadataRows[0]] })
            .mockResolvedValueOnce({ rows: [] });
        const response = await request(app)
            .post('/query-acs')
            .send({
                geoid: rawGeoid,
                tables: ['B02001'],
                columns: ["B02001001"],
            });

        expect(response.status).toBe(404);
    });

    it('supports GET requests with table and column parameters', async () => {
        query
            .mockResolvedValueOnce({ rows: [metadataRows[0]] })
            .mockResolvedValueOnce({ 
                rows: [{ geoid: normalizedGeoid, B02001001: 17 }], 
            });
        const response = await request(app)
            .get('/query-acs')
            .query({
                geoid: normalizedGeoid,
                tables: 'B02001',
                columns: "B02001001",
            });

        expect(response.status).toBe(200);
        expect(response.body.data.B02001001).toBe(17);
    });

    it('does not interpolate GEOID value in SQL', async () => {
        query
            .mockResolvedValueOnce({ rows: [metadataRows[0]] })
            .mockResolvedValueOnce({ 
                rows: [{ geoid: normalizedGeoid, B02001001: 17 }], 
            });

    await request(app)
            .post('/query-acs')
            .send({
                geoid: rawGeoid,
                tables: ['B02001'],
                columns: ["B02001001"],
            });

        expect(query.mock.calls[1][0]).not.toContain(normalizedGeoid);
        expect(query.mock.calls[1][1]).toEqual([normalizedGeoid]);
    });

});
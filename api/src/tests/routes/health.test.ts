import request from 'supertest';
import { createApp } from '../../app';

describe('GET /health', () => {
    it('returns ok:true with a status of 200', async () => {
        const app = createApp();
        const res = await request(app).get('/health');
        expect(res.status).toBe(200);
        expect(res.body.ok).toBe(true);
    });
});

import request from 'supertest';
import { createApp } from '../app';
import { VITE_ORIGIN } from '../consts';

describe('createApp', () => {
    it('sets the CORS origin from given argument', async () => {
        const app = createApp(VITE_ORIGIN);
        const res = await request(app)
            .get('/health')
            .set('Origin', VITE_ORIGIN);
        expect(res.headers['access-control-allow-origin']).toBe(VITE_ORIGIN);
        expect(res.headers['access-control-allow-credentials']).toBe('true');
    });

    it('omits CORS origin header when no origin configured', async () => {
        const app = createApp();
        const res = await request(app)
            .get('/health')
            .set('Origin', VITE_ORIGIN);
        expect(res.headers['access-control-allow-origin']).toBeUndefined();
    });

    it('returns 404 for an unmounted route', async () => {
        const app = createApp();
        const res = await request(app).get('/route-does-not-exist');
        expect(res.status).toBe(404);
    });
});

import express from 'express';
import cors from 'cors';
import health from './routes/health';
import geocode from './routes/geocode';
import addressFields from './routes/addressFields';

export const ROUTES = [
    { router: health, route: '/health' },
    { router: geocode, route: '/geocode' },
    { router: addressFields, route: '/address-fields' },
];

export function createApp(origin?: string) {
    const app = express();
    app.use(express.json());
    app.use(cors({ origin: origin, credentials: true }));

    // register routes
    ROUTES.forEach((r) => app.use(r.router));

    return app;
}

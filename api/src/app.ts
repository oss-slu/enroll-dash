import cors from 'cors';
import express, { type ErrorRequestHandler } from 'express';
import health from './routes/health';
import upload from './routes/upload';
import geocode from './routes/geocode';
import addressFields from './routes/addressFields';
import geocodeFile from './routes/geocodeFile';
import datasetFile from './routes/datasetFile';
import { FILE_LIMITS } from './utils/fileLimits';

export const ROUTES = [
    { router: health, route: '/health' },
    { router: geocode, route: '/geocode' },
    { router: upload, route: '/upload' },
    { router: addressFields, route: '/address-fields' },
    { router: geocodeFile, route: '/geocode-file' },
    { router: datasetFile, route: '/dataset-file' },
];

export function createApp(origin?: string) {
    const app = express();
    app.use(express.json({ limit: FILE_LIMITS.bytes }));
    app.use(cors({ origin: origin, credentials: true }));

    // register routes
    ROUTES.forEach((r) => app.use(r.router));

    const bodyError: ErrorRequestHandler = (err, req, res, next) => {
        if (req.path !== '/geocode-file' && req.path !== '/dataset-file')
            return next(err);
        const status =
            err.type === 'entity.too.large'
                ? 413
                : err.type === 'entity.parse.failed'
                  ? 400
                  : 500;
        res.status(status).json({
            success: false,
            code: status === 413 ? 'BODY_TOO_LARGE' : 'INVALID_BODY',
            error: 'Unable to read request body',
        });
    };
    app.use(bodyError);

    return app;
}

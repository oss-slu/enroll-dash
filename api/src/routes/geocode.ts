import { Router, type RequestHandler } from 'express';
import HttpError from '../errs/http';
import { getGeocodeFromAddr } from '../utils/census';
import { validateAddress } from '../utils/validateAddress';

const router = Router();

const geocode: RequestHandler = async (req, res) => {
    const addr: unknown =
        req.method === 'POST' ? req.body?.addr : req.query.addr;

    if (typeof addr !== 'string' || !addr) {
        return res.status(400).json({
            ok: false,
            error: 'addr must be a non-empty string',
        });
    }

    const validation = validateAddress(addr);
    if (!validation.ok) {
        return res.status(400).json({
            ...validation,
            error: 'Unsupported address format',
        });
    }

    try {
        const result = await getGeocodeFromAddr(validation.original);

        if (!result) {
            return res.json({
                ok: false,
                error: `No address matches for ${addr}`,
            });
        }

        return res.json(result);
    } catch (err) {
        if (err instanceof HttpError) {
            return res.json({
                ok: false,
                error: `Census API error: ${err.status} ${err.statusText}`,
            });
        } else {
            return res.json({
                ok: false,
                error: `Unexpected error: ${err}`,
            });
        }
    }
};

router.get('/geocode', geocode);
router.post('/geocode', geocode);

export default router;

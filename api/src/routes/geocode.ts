import { Router } from 'express';
import HttpError from '../errs/http';
import { getGeocodeFromAddr } from '../utils/census';
import type { addressFromUser } from '../types/census';
import { MMDDYY_HHMMSS } from '../utils/datetime';

const router = Router();

router.get('/geocode', async (_req, res) => {
    res.json({
        ok: true,
        message: `/geocode endpoint available at ${MMDDYY_HHMMSS(new Date())}`,
    });
});

// User sends an address as { addr: string }, call the Geocoder API, return response
router.post('/geocode', async (req, res) => {
    const fromUser: addressFromUser = req.body;

    try {
        const result = await getGeocodeFromAddr(fromUser.addr);

        if (!result) {
            res.json({
                ok: false,
                error: `No address matches for ${fromUser}`,
            });
        }
        res.json(result);
    } catch (err) {
        if (err instanceof HttpError) {
            res.json({
                ok: false,
                error: `Census API error: ${err.status} ${err.statusText}`,
            });
        } else {
            res.json({
                ok: false,
                error: `Unexpected error: ${err}`,
            });
            throw err;
        }
    }
});

export default router;

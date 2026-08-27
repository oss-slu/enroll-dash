import { Router } from 'express';
import getGeocodeFromAddr from "../census/getGeocodeFromAddr";
import HttpError from '../http/err';

const router = Router();

router.post('/geocode', async (req, res) => {
    const fromUser = req.body.addr;

    try {
        const result = await getGeocodeFromAddr(fromUser);

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
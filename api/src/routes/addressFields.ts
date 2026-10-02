import { Router } from 'express';
import { findAddressFields } from '../utils/addressFields';

const router = Router();

router.get('/address-fields', (req, res) => {
    const filePath = req.query.path as string;

    if (!filePath) {
        return res.status(400).json({
            ok: false,
            error: 'Missing required query parameter: path',
        });
    }

    try {
        const matches = findAddressFields(filePath);
        return res.json(matches);
    } catch (err) {
        return res.status(400).json({
            ok: false,
            error: `Unable to read file: ${err}`,
        });
    }
});

export default router;

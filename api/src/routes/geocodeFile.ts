import { Router } from 'express';
import { FileError } from '../errs/file';
import { enrichFile } from '../utils/enrichFile';
import { fileResponseError } from '../utils/fileResponse';

const router = Router();
router.get('/geocode-file', (_req, res) => {
    res.status(405).json({ success: false, error: 'Method Not Allowed' });
});
router.post('/geocode-file', async (req, res) => {
    const controller = new AbortController();
    const cancel = () => {
        if (!res.writableEnded) controller.abort();
    };
    req.on('aborted', cancel);
    res.on('close', cancel);
    try {
        if (typeof req.query.path !== 'string' || !req.query.path)
            throw new FileError(400, 'INVALID_PATH', 'path is required');
        const result = await enrichFile(
            req.query.path,
            req.body,
            controller.signal,
        );
        res.status(201).json({ success: true, ...result });
    } catch (err) {
        fileResponseError(res, err);
    } finally {
        req.off('aborted', cancel);
        res.off('close', cancel);
    }
});
export default router;

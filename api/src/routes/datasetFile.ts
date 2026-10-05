import { Router } from 'express';
import { FileError } from '../errs/file';
import { fileType, saveDataset, validateDataset } from '../utils/dataset';
import { validateSessionId } from '../utils/storage';
import { fileResponseError } from '../utils/fileResponse';

const router = Router();
router.get('/dataset-file', (_req, res) => {
    res.status(405).json({ success: false, error: 'Method Not Allowed' });
});
router.post('/dataset-file', async (req, res) => {
    const controller = new AbortController();
    const cancel = () => {
        if (!res.writableEnded)
            controller.abort(
                new FileError(504, 'CANCELLED', 'File save was cancelled'),
            );
    };
    req.on('aborted', cancel);
    res.on('close', cancel);
    try {
        const body = req.body;
        if (!body || typeof body !== 'object' || Array.isArray(body))
            throw new FileError(
                400,
                'INVALID_OPTIONS',
                'A JSON object is required',
            );
        validateSessionId(body.sessionId);
        if (
            typeof body.filename !== 'string' ||
            !['csv', 'xls', 'xlsx'].includes(body.format)
        )
            throw new FileError(
                400,
                'INVALID_OPTIONS',
                'filename and format are required',
            );
        if (fileType(body.filename) !== body.format)
            throw new FileError(
                400,
                'FORMAT_MISMATCH',
                'filename extension must match format',
            );
        validateDataset(body.dataset);
        const saved = await saveDataset(
            body.sessionId,
            body.filename,
            body.dataset,
            body.format,
            controller.signal,
        );
        res.status(201).json({ success: true, ...saved });
    } catch (err) {
        fileResponseError(res, err);
    } finally {
        req.off('aborted', cancel);
        res.off('close', cancel);
    }
});
export default router;

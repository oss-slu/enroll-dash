import type { Response } from 'express';
import { FileError } from '../errs/file';

export function fileResponseError(res: Response, err: unknown): void {
    if (res.destroyed) return;
    if (err instanceof FileError)
        res.status(err.status).json({
            success: false,
            code: err.code,
            error: err.message,
            ...(err.candidates ? { candidates: err.candidates } : {}),
        });
    else
        res.status(500).json({
            success: false,
            code: 'FILE_OPERATION_FAILED',
            error: 'Unable to complete file operation',
        });
}

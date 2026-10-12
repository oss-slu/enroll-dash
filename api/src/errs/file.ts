export class FileError extends Error {
    constructor(
        readonly status: number,
        readonly code: string,
        message: string,
        readonly candidates?: string[],
    ) {
        super(message);
    }
}

import fs from 'fs';
import path from 'path';

const BASE_TEMP_DIR = path.resolve('/tmp', 'enroll-dash');

// Helper to ensure the final path doesn't break out of the base directory
const getSafeTempDir = (sessionId: string): string => {
    const tempDir = path.resolve(BASE_TEMP_DIR, sessionId);
    if (!tempDir.startsWith(BASE_TEMP_DIR)) {
        throw new Error('Invalid session ID: Path traversal detected');
    }
    return tempDir;
};

export const saveSessionFile = async (
    sessionId: string,
    filename: string,
    buffer: Buffer,
): Promise<string> => {
    const tempDir = getSafeTempDir(sessionId);
    await fs.promises.mkdir(tempDir, { recursive: true });

    // Ensure filename doesn't contain path traversal characters
    const safeFilename = path.basename(filename);
    const outputPath = path.resolve(tempDir, safeFilename);

    await fs.promises.writeFile(outputPath, buffer);
    return outputPath;
};

export const deleteSessionDir = async (sessionId: string): Promise<void> => {
    const tempDir = getSafeTempDir(sessionId);
    await fs.promises.rm(tempDir, { recursive: true, force: true });
};

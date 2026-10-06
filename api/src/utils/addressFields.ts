import { validateAddress } from './validateAddress';
import { readDatasetFile, type Dataset, type ReadOptions } from './dataset';

export function detectAddressFields(dataset: Dataset): string[] {
    // Bounded sampling tolerates blank first rows without applying suggested corrections.
    return dataset.columns
        .filter((_, index) =>
            dataset.rows.slice(0, 20).some((row) => {
                const value = row[index];
                return (
                    typeof value === 'string' &&
                    !!value.trim() &&
                    validateAddress(value).ok
                );
            }),
        )
        .map((col) => col.id);
}

// Retain the #14 wrapper and its header-label response for existing callers.
export function findAddressFields(
    filePath: string,
    options: ReadOptions = {},
): string[] {
    try {
        const dataset = readDatasetFile(filePath, options);
        const candidates = new Set(detectAddressFields(dataset));
        return dataset.columns
            .filter((col) => candidates.has(col.id))
            .map((col) => col.label);
    } catch (err) {
        if (
            err instanceof Error &&
            'code' in err &&
            err.code === 'EMPTY_DATASET'
        )
            return [];
        throw err;
    }
}

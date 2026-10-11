import { useState } from 'react';
import * as XLSX from 'xlsx';
import { DATA_SOURCE_OPTIONS, type DataSource } from '../consts';

const API_BASE_URL = '/api';

type UploadResponse = {
    success: boolean;
    sessionId: string;
    filename: string;
    tempPath: string;
};

type CellValue = string | number | boolean | null;
type PreviewData = {
    headers: string[];
    rows: CellValue[][];
};

const PREVIEW_LIMIT = 5;

function DatasetGeoJoiner() {
    const [dataSource, setDataSource] = useState<DataSource>('File Upload');
    const [sessionId, setSessionId] = useState('');
    const [tempPath, setTempPath] = useState('');
    const [filename, setFilename] = useState('');
    const [joinField, setJoinField] = useState('');
    const [addressFields, setAddressFields] = useState<string[]>([]);
    const [preview, setPreview] = useState<PreviewData | null>(null);
    const [showAllRows, setShowAllRows] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    async function handleFileChange(
        event: React.ChangeEvent<HTMLInputElement>,
    ) {
        const file = event.target.files?.[0];
        if (!file) return;

        setError('');
        setSessionId('');
        setTempPath('');
        setFilename('');
        setAddressFields([]);
        setJoinField('');
        setPreview(null);
        setShowAllRows(false);

        const extension = file.name.split('.').pop()?.toLowerCase();
        if (!extension || !['csv', 'xls', 'xlsx'].includes(extension)) {
            setError('Please select a CSV or Excel file (.csv, .xls, .xlsx).');
            return;
        }

        setLoading(true);

        try {
            // Read the selected file in the browser for the preview.
            const workbook = XLSX.read(await file.arrayBuffer(), {
                type: 'array',
                cellDates: true,
            });
            const firstSheet = workbook.Sheets[workbook.SheetNames[0]];

            if (!firstSheet) {
                throw new Error('The selected file has no readable worksheet.');
            }

            const matrix = XLSX.utils.sheet_to_json<unknown[]>(firstSheet, {
                header: 1,
                defval: '',
            });

            if (matrix.length === 0) {
                throw new Error('The selected file contains no data.');
            }

            const headers = matrix[0].map((value, index) =>
                String(value || `Column ${index + 1}`),
            );
            const rows = matrix.slice(1).map((row) =>
                headers.map((_, index) => {
                    const value = row[index];
                    if (
                        typeof value === 'string' ||
                        typeof value === 'number' ||
                        typeof value === 'boolean'
                    ) {
                        return value;
                    }
                    return value == null ? '' : String(value);
                }),
            );

            setPreview({ headers, rows });

            // Upload the file to the API's temporary session directory.
            const formData = new FormData();
            formData.append('file', file);

            const uploadResponse = await fetch(`${API_BASE_URL}/upload`, {
                method: 'POST',
                body: formData,
            });

            const uploadResult = (await uploadResponse.json()) as
                UploadResponse | { error?: string };

            if (
                !uploadResponse.ok ||
                !('sessionId' in uploadResult) ||
                !uploadResult.sessionId ||
                !uploadResult.tempPath
            ) {
                throw new Error(
                    'error' in uploadResult
                        ? uploadResult.error || 'File upload failed.'
                        : 'File upload failed.',
                );
            }

            setSessionId(uploadResult.sessionId);
            setTempPath(uploadResult.tempPath);
            setFilename(uploadResult.filename);

            // Ask the API to identify possible address fields.
            const query = new URLSearchParams({
                path: uploadResult.tempPath,
                sessionId: uploadResult.sessionId,
            });

            const fieldsResponse = await fetch(
                `${API_BASE_URL}/address-fields?${query.toString()}`,
            );
            const fieldsResult: unknown = await fieldsResponse.json();

            if (!fieldsResponse.ok || !Array.isArray(fieldsResult)) {
                throw new Error('Could not detect potential address fields.');
            }

            const fields = fieldsResult.filter(
                (field): field is string => typeof field === 'string',
            );
            setAddressFields(fields);
            setJoinField(fields[0] ?? '');
        } catch (err) {
            setError(
                err instanceof Error
                    ? err.message
                    : 'An unexpected error occurred.',
            );
        } finally {
            setLoading(false);
        }
    }

    const visibleRows = showAllRows
        ? (preview?.rows ?? [])
        : (preview?.rows ?? []).slice(0, PREVIEW_LIMIT);

    return (
        <section aria-labelledby="dataset-joiner-heading">
            <h2 id="dataset-joiner-heading">Dataset Geo Joiner</h2>

            <label htmlFor="data-source">Data source</label>
            <select
                id="data-source"
                value={dataSource}
                onChange={(event) =>
                    setDataSource(event.target.value as DataSource)
                }
            >
                {DATA_SOURCE_OPTIONS.map((source) => (
                    <option key={source} value={source}>
                        {source}
                    </option>
                ))}
            </select>

            {dataSource === 'File Upload' ? (
                <>
                    <label htmlFor="dataset-file">
                        Upload CSV or Excel file
                    </label>
                    <input
                        id="dataset-file"
                        type="file"
                        accept=".csv,.xls,.xlsx"
                        onChange={handleFileChange}
                    />
                </>
            ) : (
                <button
                    type="button"
                    onClick={() => console.log('Search data source')}
                >
                    Search
                </button>
            )}

            {loading && <p role="status">Processing file…</p>}
            {error && <p role="alert">{error}</p>}

            {sessionId && (
                <>
                    <p>Uploaded: {filename}</p>

                    <label htmlFor="join-field">Potential address field</label>
                    <select
                        id="join-field"
                        value={joinField}
                        onChange={(event) => setJoinField(event.target.value)}
                        disabled={addressFields.length === 0}
                    >
                        {addressFields.map((field) => (
                            <option key={field} value={field}>
                                {field}
                            </option>
                        ))}
                    </select>

                    <button
                        type="button"
                        disabled={!joinField}
                        onClick={() => console.log(`Geocode ${joinField}`)}
                    >
                        Geocode {joinField || 'field'}
                    </button>
                </>
            )}

            {preview && (
                <div>
                    <h3>Dataset preview</h3>
                    <p>
                        Showing {visibleRows.length} of {preview.rows.length}{' '}
                        data rows.
                    </p>

                    <div style={{ overflowX: 'auto' }}>
                        <table>
                            <thead>
                                <tr>
                                    {preview.headers.map((header, index) => (
                                        <th key={`${header}-${index}`}>
                                            {header}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {visibleRows.map((row, rowIndex) => (
                                    <tr key={rowIndex}>
                                        {preview.headers.map(
                                            (_, columnIndex) => (
                                                <td key={columnIndex}>
                                                    {String(
                                                        row[columnIndex] ?? '',
                                                    )}
                                                </td>
                                            ),
                                        )}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {preview.rows.length > PREVIEW_LIMIT && (
                        <button
                            type="button"
                            onClick={() =>
                                setShowAllRows((current) => !current)
                            }
                        >
                            {showAllRows ? 'Show fewer rows' : 'Show more rows'}
                        </button>
                    )}
                </div>
            )}

            {tempPath && (
                <p>
                    <small>Temporary file stored by the API.</small>
                </p>
            )}
        </section>
    );
}

export default DatasetGeoJoiner;

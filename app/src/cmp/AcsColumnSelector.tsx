import { useEffect, useState } from 'react';

type MetadataRow = {
    table_id: string;
    table_title: string;
    column_id: string;
    column_title: string;
};

type MetadataResponse = {
    ok: boolean;
    data?: MetadataRow[];
    message?: string;
};

const TABLE_PATTERNS = [
    'b02001%',
    'b03003%',
    'b08201%',
    'b08202%',
    'b09002%',
    'b11012%',
    'b14003%',
    'b15003%',
    'b15012%',
    'b16007%',
    'b24030',
    'b25003',
    'b25061',
    'b25075',
    'b25024',
];

function AcsColumnSelector() {
    const [metadata, setMetadata] = useState<MetadataRow[]>([]);
    const [expandedTables, setExpandedTables] = useState<Set<string>>(
        new Set(),
    );
    const [selectedColumns, setSelectedColumns] = useState<Set<string>>(
        new Set(),
    );
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const controller = new AbortController();

        async function loadMetadata() {
            try {
                const params = new URLSearchParams();

                TABLE_PATTERNS.forEach((table) => {
                    params.append('tables', table);
                });

                const response = await fetch(
                    `/api/acs-metadata?${params.toString()}`,
                    { signal: controller.signal },
                );

                const result: MetadataResponse = await response.json();

                if (!response.ok || !result.ok) {
                    throw new Error(
                        result.message ?? 'Failed to load ACS metadata.',
                    );
                }

                setMetadata(result.data ?? []);
            } catch (err) {
                if (controller.signal.aborted) return;

                setError(
                    err instanceof Error
                        ? err.message
                        : 'Failed to load ACS metadata.',
                );
            } finally {
                if (!controller.signal.aborted) {
                    setLoading(false);
                }
            }
        }

        void loadMetadata();

        return () => controller.abort();
    }, []);

    function toggleTable(tableId: string) {
        setExpandedTables((current) => {
            const next = new Set(current);

            if (next.has(tableId)) {
                next.delete(tableId);
            } else {
                next.add(tableId);
            }

            return next;
        });
    }

    function toggleColumn(columnId: string) {
        setSelectedColumns((current) => {
            const next = new Set(current);

            if (next.has(columnId)) {
                next.delete(columnId);
            } else {
                next.add(columnId);
            }

            return next;
        });
    }

    const tables = Array.from(
        new Map(
            metadata.map((row) => [
                row.table_id,
                {
                    table_id: row.table_id,
                    table_title: row.table_title,
                },
            ]),
        ).values(),
    );

    return (
        <section aria-labelledby="acs-selector-heading">
            <h2 id="acs-selector-heading">ACS Columns to Append</h2>
            <p>Select a table to view its available columns.</p>

            {loading && <p role="status">Loading ACS metadata...</p>}

            {error && <p role="alert">{error}</p>}

            {!loading && !error && tables.length === 0 && (
                <p>No ACS metadata available.</p>
            )}

            {!loading && !error && tables.length > 0 && (
                <ul>
                    {tables.map((table) => {
                        const expanded = expandedTables.has(table.table_id);
                        const columns = metadata.filter(
                            (row) => row.table_id === table.table_id,
                        );

                        return (
                            <li key={table.table_id}>
                                <button
                                    type="button"
                                    aria-expanded={expanded}
                                    onClick={() => toggleTable(table.table_id)}
                                >
                                    {table.table_title} ({table.table_id})
                                </button>

                                {expanded && (
                                    <ul>
                                        {columns.map((column) => (
                                            <li key={column.column_id}>
                                                <label>
                                                    <input
                                                        type="checkbox"
                                                        checked={selectedColumns.has(
                                                            column.column_id,
                                                        )}
                                                        onChange={() =>
                                                            toggleColumn(
                                                                column.column_id,
                                                            )
                                                        }
                                                    />
                                                    {column.column_title} (
                                                    {column.column_id})
                                                </label>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </li>
                        );
                    })}
                </ul>
            )}

            <p aria-live="polite">{selectedColumns.size} columns selected</p>
        </section>
    );
}

export default AcsColumnSelector;

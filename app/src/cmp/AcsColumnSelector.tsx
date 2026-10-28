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

function AcsColumnSelector({ table_ids }: { table_ids: string[] }) {
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

                table_ids.forEach((table) => {
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

    function clearColumns(tableId?: string) {
        if (tableId) {
            setSelectedColumns((current) => {
                const next = new Set(current);
                metadata.filter((row) => row.table_id === tableId).forEach((row) => next.delete(row.column_id));
                return next;
            })
        } else {
            setSelectedColumns(new Set());
        }
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
            <h2 id="acs-selector-heading">American Community Survey data fields available:</h2>
            <span>Select a table to view available data fields</span>

            {loading && <p role="status">Loading ACS metadata...</p>}

            {error && <p role="alert">{error}</p>}

            {!loading && !error && tables.length === 0 && (
                <p>No ACS metadata available.</p>
            )}

            {!loading && !error && tables.length > 0 && (
                <div className='col-sel-cont'>
                    {tables.map((table) => {
                        const expanded = expandedTables.has(table.table_id);
                        const columns = metadata.filter(
                            (row) => row.table_id === table.table_id,
                        );

                        return (
                            <div key={table.table_id} className='col-sel-opt-outer-cont'>
                                <button
                                    type="button"
                                    aria-expanded={expanded}
                                    onClick={() => toggleTable(table.table_id)}
                                > { expanded ? '^' : 'v'}| <b>{table.table_id}:</b> {table.table_title}
                                </button>

                                {expanded && (
                                    <div className='col-sel-opt-inner-cont'>
                                        {columns.map((column) => (
                                            <div key={column.column_id} className='col-sel-inner-opt'>
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
                                                    /><b>{column.column_id}:</b> {column.column_title}
                                                </label>
                                            </div>
                                        ))}
                                        <button onClick={() => clearColumns(table.table_id)}>
                                            Clear {table.table_id} columns
                                        </button>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
            <button onClick={() => clearColumns()}>
                Clear all columns
            </button>
            <p aria-live="polite">{selectedColumns.size} columns selected</p>
        </section>
    );
}

export default AcsColumnSelector;

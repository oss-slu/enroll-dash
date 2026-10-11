import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import DatasetGeoJoiner from '../../cmp/DatasetGeoJoiner';

describe('DatasetGeoJoiner', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it('renders the data source and file upload controls', () => {
        render(<DatasetGeoJoiner />);

        expect(
            screen.getByRole('heading', { name: 'Dataset Geo Joiner' }),
        ).toBeInTheDocument();

        expect(screen.getByLabelText('Data source')).toHaveValue('File Upload');

        expect(
            screen.getByLabelText('Upload CSV or Excel file'),
        ).toBeInTheDocument();
    });

    it('rejects unsupported file types', async () => {
        render(<DatasetGeoJoiner />);

        const file = new File(['not a spreadsheet'], 'notes.txt', {
            type: 'text/plain',
        });

        fireEvent.change(screen.getByLabelText('Upload CSV or Excel file'), {
            target: { files: [file] },
        });

        expect(await screen.findByRole('alert')).toHaveTextContent(
            'Please select a CSV or Excel file',
        );
    });

    it('shows an error when the API upload fails', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(
            new Response(JSON.stringify({ error: 'Upload failed for test' }), {
                status: 500,
                headers: { 'Content-Type': 'application/json' },
            }),
        );

        render(<DatasetGeoJoiner />);

        const file = new File(
            ['Address,City\n123 Main Street,St. Louis'],
            'addresses.csv',
            { type: 'text/csv' },
        );

        fireEvent.change(screen.getByLabelText('Upload CSV or Excel file'), {
            target: { files: [file] },
        });

        expect(await screen.findByRole('alert')).toHaveTextContent(
            'Upload failed for test',
        );
    });

    it('uploads a CSV, detects address fields, and displays the preview', async () => {
        vi.spyOn(globalThis, 'fetch')
            .mockResolvedValueOnce(
                new Response(
                    JSON.stringify({
                        success: true,
                        sessionId: 'test-session',
                        filename: 'addresses.csv',
                        tempPath: '/tmp/enroll-dash/test-session/addresses.csv',
                    }),
                    {
                        status: 200,
                        headers: { 'Content-Type': 'application/json' },
                    },
                ),
            )
            .mockResolvedValueOnce(
                new Response(JSON.stringify(['Address']), {
                    status: 200,
                    headers: { 'Content-Type': 'application/json' },
                }),
            );

        render(<DatasetGeoJoiner />);

        const file = new File(
            [
                'Address,City,State,ZIP\n123 Main Street,St. Louis,MO,63101\n456 Market Street,St. Louis,MO,63103',
            ],
            'addresses.csv',
            { type: 'text/csv' },
        );

        fireEvent.change(screen.getByLabelText('Upload CSV or Excel file'), {
            target: { files: [file] },
        });

        expect(
            await screen.findByText('Uploaded: addresses.csv'),
        ).toBeInTheDocument();

        expect(screen.getByLabelText('Potential address field')).toHaveValue(
            'Address',
        );

        expect(
            screen.getByRole('button', { name: 'Geocode Address' }),
        ).toBeInTheDocument();

        expect(
            screen.getByRole('heading', { name: 'Dataset preview' }),
        ).toBeInTheDocument();

        expect(screen.getByText('123 Main Street')).toBeInTheDocument();

        expect(globalThis.fetch).toHaveBeenCalledTimes(2);
    });

    it('allows users to show more and fewer preview rows', async () => {
        vi.spyOn(globalThis, 'fetch')
            .mockResolvedValueOnce(
                new Response(
                    JSON.stringify({
                        success: true,
                        sessionId: 'test-session',
                        filename: 'addresses.csv',
                        tempPath: '/tmp/enroll-dash/test-session/addresses.csv',
                    }),
                    {
                        status: 200,
                        headers: { 'Content-Type': 'application/json' },
                    },
                ),
            )
            .mockResolvedValueOnce(
                new Response(JSON.stringify(['Address']), {
                    status: 200,
                    headers: { 'Content-Type': 'application/json' },
                }),
            );

        render(<DatasetGeoJoiner />);

        const rows = [
            'Address,City',
            '123 Main Street,St. Louis',
            '456 Market Street,St. Louis',
            '789 Oak Avenue,St. Louis',
            '100 Pine Street,St. Louis',
            '200 Elm Street,St. Louis',
            '300 Cedar Street,St. Louis',
        ].join('\n');

        const file = new File([rows], 'addresses.csv', {
            type: 'text/csv',
        });

        fireEvent.change(screen.getByLabelText('Upload CSV or Excel file'), {
            target: { files: [file] },
        });

        expect(
            await screen.findByText('Showing 5 of 6 data rows.'),
        ).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: 'Show more rows' }));

        expect(
            screen.getByText('Showing 6 of 6 data rows.'),
        ).toBeInTheDocument();

        expect(screen.getByText('300 Cedar Street')).toBeInTheDocument();

        fireEvent.click(
            screen.getByRole('button', { name: 'Show fewer rows' }),
        );

        expect(
            screen.getByText('Showing 5 of 6 data rows.'),
        ).toBeInTheDocument();
    });
});
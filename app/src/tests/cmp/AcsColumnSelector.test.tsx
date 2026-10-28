import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import AcsColumnSelector from '../../cmp/AcsColumnSelector';
import { TABLE_IDS } from '../../consts';

const metadata = [
    {
        table_id: 'B02001',
        table_title: 'Race',
        column_id: 'B02001001',
        column_title: 'Total:',
    },
    {
        table_id: 'B02001',
        table_title: 'Race',
        column_id: 'B02001002',
        column_title: 'White alone',
    },
    {
        table_id: 'B15003',
        table_title: 'Educational Attainment',
        column_id: 'B15003001',
        column_title: 'Total:',
    },
];

function mockMetadataResponse(data: typeof metadata = metadata) {
    vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ ok: true, data }),
        }),
    );
}

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('AcsColumnSelector', () => {
    it('loads and displays ACS tables', async () => {
        mockMetadataResponse();

        render(<AcsColumnSelector table_ids={TABLE_IDS}/>);

        expect(screen.getByRole('status')).toHaveTextContent(
            'Loading ACS metadata',
        );

        expect(
            await screen.findByRole('button', {
                name: /B02001.*Race/,
            }),
        ).toBeInTheDocument();

        expect(
            screen.getByRole('button', {
                name: /B15003.*Educational Attainment/,
            }),
        ).toBeInTheDocument();
    });

    it('expands a table and displays its columns', async () => {
        mockMetadataResponse();

        render(<AcsColumnSelector table_ids={TABLE_IDS}/>);

        const tableButton = await screen.findByRole('button', {
            name: /B02001.*Race/,
        });

        fireEvent.click(tableButton);

        expect(tableButton).toHaveAttribute('aria-expanded', 'true');

        expect(
            screen.getByLabelText(/B02001002.*White alone/),
        ).toBeInTheDocument();
    });

    it('allows columns to be selected and deselected', async () => {
        mockMetadataResponse();

        render(<AcsColumnSelector table_ids={TABLE_IDS}/>);

        fireEvent.click(
            await screen.findByRole('button', {
                name: /B02001.*Race/,
            }),
        );

        const column = screen.getByRole('checkbox', {
            name: /B02001002.*White alone/,
        });

        fireEvent.click(column);

        expect(column).toBeChecked();
        expect(screen.getByText('1 columns selected')).toBeInTheDocument();

        fireEvent.click(column);

        expect(column).not.toBeChecked();
        expect(screen.getByText('0 columns selected')).toBeInTheDocument();
    });

    it('displays an error when the API request fails', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn().mockRejectedValue(new Error('Network error')),
        );

        render(<AcsColumnSelector table_ids={TABLE_IDS}/>);

        expect(await screen.findByRole('alert')).toHaveTextContent(
            'Network error',
        );

        await waitFor(() => {
            expect(
                screen.queryByText('Loading ACS metadata...'),
            ).not.toBeInTheDocument();
        });
    });
});

import { render } from '@testing-library/react';
import App from '../../cmp/App';

describe('App', () => {
    it('renders without crashing', () => {
        render(<App />);
    });
});

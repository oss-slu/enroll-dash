import '@testing-library/jest-dom';

vi.stubGlobal(
    'ResizeObserver',
    class {
        observe() {}
        unobserve() {}
        disconnect() {}
    },
);

Object.defineProperties(HTMLElement.prototype, {
    offsetWidth: {
        configurable: true,
        value: 500,
    },
    offsetHeight: {
        configurable: true,
        value: 500,
    },
});

Element.prototype.getBoundingClientRect = () => ({
    width: 500,
    height: 500,
    top: 0,
    left: 0,
    bottom: 500,
    right: 500,
    x: 0,
    y: 0,
    toJSON: () => {},
});

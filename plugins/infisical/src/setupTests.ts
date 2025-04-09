/**
 * Setup for Jest tests
 */

import '@testing-library/jest-dom';

// Mock fetch for testing
global.fetch = jest.fn();

// Mock missing DOM APIs that might be used in tests
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: jest.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: jest.fn(),
    removeListener: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  })),
});

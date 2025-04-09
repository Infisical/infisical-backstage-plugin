import '@testing-library/jest-dom';
import { TextDecoder, TextEncoder } from 'util';
import { installGlobals } from '@backstage/backend-test-utils';

jest.setTimeout(30000);

global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;

const fixedTestDate = new Date('2023-01-01T12:00:00Z');
jest
  .spyOn(global.Date, 'now')
  .mockImplementation(() => fixedTestDate.getTime());

if (!global.fetch) {
  installGlobals();
}

afterEach(() => {
  jest.resetAllMocks();
});

expect.extend({
  toBeWithinRange(received, floor, ceiling) {
    const pass = received >= floor && received <= ceiling;
    if (pass) {
      return {
        message: () =>
          `expected ${received} not to be within range ${floor} - ${ceiling}`,
        pass: true,
      };
    }
    return {
      message: () =>
        `expected ${received} to be within range ${floor} - ${ceiling}`,
      pass: false,
    };
  },
});

declare global {
  namespace jest {
    interface Matchers<R> {
      toBeWithinRange(floor: number, ceiling: number): R;
    }
  }
}

module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'jsdom',
  transform: {
    '^.+\\.(ts|tsx)$': 'ts-jest',
  },
  globals: {
    'ts-jest': {
      tsconfig: 'tsconfig.jest.json'
    }
  },
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    // Stub stylesheet imports (e.g. @xyflow/react/dist/style.css) — jest can't parse CSS
    '\\.(css|less|scss|sass)$': '<rootDir>/__mocks__/styleMock.js',
    // react-markdown / remark-gfm ship pure-ESM and can't be parsed by ts-jest;
    // map them to lightweight mocks so components using them can be tested.
    '^react-markdown$': '<rootDir>/__mocks__/react-markdown.tsx',
    '^remark-gfm$': '<rootDir>/__mocks__/remark-gfm.js',
  },
  // Playwright e2e specs use their own runner — jest must not pick them up
  testPathIgnorePatterns: ['/node_modules/', '/e2e/'],
  setupFilesAfterEnv: ['@testing-library/jest-dom'],
};

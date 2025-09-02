import base from './packages/config/eslint/base.js';

export default [
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.next/**',
      '**/build/**',
      '**/coverage/**',
      '**/.turbo/**',
      'apps/api/prisma/generated/**',
    ],
  },
  ...base,
];

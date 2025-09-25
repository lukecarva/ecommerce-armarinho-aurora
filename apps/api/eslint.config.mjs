import base from '@aurora/config/eslint/base';

export default [
  ...base,
  {
    files: ['**/*.ts'],
    rules: {
      // Decorators do Nest exigem classes sem membros públicos declarados.
      '@typescript-eslint/no-extraneous-class': 'off',
    },
  },
];

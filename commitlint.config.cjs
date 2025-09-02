/** @type {import('@commitlint/types').UserConfig} */
module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'scope-enum': [
      2,
      'always',
      [
        'web',
        'admin',
        'api',
        'ui',
        'types',
        'config',
        'db',
        'catalogo',
        'pedidos',
        'importacao',
        'exportacao',
        'cms',
        'cursos',
        'infra',
        'docs',
        'deps',
      ],
    ],
    'subject-case': [0],
  },
};

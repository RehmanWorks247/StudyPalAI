module.exports = {
  forbidden: [
    {
      name: 'domain-cannot-import-node',
      severity: 'error',
      from: { path: '^apps/api/src/modules/[^/]+/domain/' },
      to: { dependencyTypes: ['core'] },
    },
    { name: 'no-circular-dependencies', severity: 'error', from: {}, to: { circular: true } },
    {
      name: 'web-cannot-import-server',
      severity: 'error',
      from: { path: '^apps/web/' },
      to: { path: '^(apps/api/|packages/database/)|node_modules/(?:@nestjs/|drizzle-orm/|pg/)' },
    },
    {
      name: 'packages-cannot-import-apps',
      severity: 'error',
      from: { path: '^packages/' },
      to: { path: '^apps/' },
    },
    {
      name: 'api-cannot-import-web',
      severity: 'error',
      from: { path: '^apps/api/' },
      to: { path: '^apps/web/|^packages/api-client/' },
    },
    {
      name: 'database-has-no-application-dependencies',
      severity: 'error',
      from: { path: '^packages/database/' },
      to: { path: '^packages/(?!database/)|node_modules/(?:@nestjs/|react/)' },
    },
    {
      name: 'domain-is-pure',
      severity: 'error',
      from: { path: '^apps/api/src/modules/[^/]+/domain/' },
      to: {
        path: 'node_modules/|^packages/|^apps/api/src/(?:platform|common)/|/(?:infrastructure|presentation|application)/',
      },
    },
    {
      name: 'module-internals-are-private',
      severity: 'error',
      from: { path: '^apps/api/src/modules/([^/]+)/' },
      to: { path: '^apps/api/src/modules/(?!$1/)[^/]+/(?!index\\.ts$)' },
    },
    {
      name: 'web-features-use-public-entrypoints',
      severity: 'error',
      from: { path: '^apps/web/src/features/([^/]+)/' },
      to: { path: '^apps/web/src/features/(?!$1/)[^/]+/(?!index\\.tsx?$)' },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    exclude: { path: '(^|/)(dist|dist-test|coverage|generated)/' },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.boundaries.json' },
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['types', 'import', 'require', 'default'],
    },
  },
};

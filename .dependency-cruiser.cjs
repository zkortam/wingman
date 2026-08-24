module.exports = {
  forbidden: [
    {
      name: 'config-not-pipeline',
      severity: 'error',
      comment: 'THE hard boundary. If the pipeline is broken, config must still resolve.',
      from: { path: '^services/config' },
      to: { path: '^services/pipeline' },
    },
    {
      name: 'sdk-schema-only',
      severity: 'error',
      comment: 'Customers install the SDK. Every transitive dep is a reason not to.',
      from: { path: '^packages/sdk/src' },
      to: { pathNot: '^(packages/sdk|packages/schema|node_modules|@wingman/schema$|openredaction$|node:|crypto$|fs$|os$|path$)' },
    },
    {
      name: 'schema-is-leaf',
      severity: 'error',
      from: { path: '^packages/schema' },
      to: { path: '^(packages|services|apps|fixtures)', pathNot: '^packages/schema' },
    },
    {
      name: 'web-no-db',
      severity: 'error',
      comment: 'The UI reads through PipelineReader, never raw SQL.',
      from: { path: '^apps/web' },
      to: { path: '^packages/db' },
    },
    {
      name: 'fixtures-is-leaf',
      severity: 'error',
      from: { path: '^fixtures' },
      to: { path: '^(services|apps)' },
    },
    {
      name: 'demo-sdk-only',
      severity: 'error',
      comment:
        'demo/ is a mock customer, so it may only reach Wingman through the SDK and the ' +
        'published schema types. This is what makes the folder deletable and what stops ' +
        'the product from quietly growing a special case for it.',
      from: { path: '^demo/amazoff' },
      to: { path: '^(services|apps|packages)', pathNot: '^packages/(sdk|schema)' },
    },
    {
      name: 'nothing-depends-on-demo',
      severity: 'error',
      comment: 'Deleting demo/ must never break the product.',
      from: { pathNot: '^demo' },
      to: { path: '^demo' },
    },
    {
      name: 'no-cycles',
      severity: 'error',
      from: {},
      to: { circular: true },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    exclude: ['(^|/)\.next/', '(^|/)coverage/', '\\.test\\.[tj]sx?$'],
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.base.json' },
  },
}

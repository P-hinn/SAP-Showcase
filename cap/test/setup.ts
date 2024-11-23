/**
 * Jest setup, executed before any test module is imported.
 *
 * CAP resolves the implementation of `srv/procurement-service.cds` by looking
 * for a sibling module of the same name, and the list of extensions it
 * considers is built like this (@sap/cds/lib/srv/factory.js):
 *
 *   const exts = process.env.CDS_TYPESCRIPT ? ['.ts','.js','.mjs'] : ['.js','.mjs']
 *
 * So without this flag a TypeScript implementation is simply not found. The
 * service still starts - it just serves the model with no custom handlers, and
 * every action answers 501. `cds-ts` and `cds-tsx` set the flag for you; a
 * Jest run has to set it itself.
 */
process.env.CDS_TYPESCRIPT = 'true';

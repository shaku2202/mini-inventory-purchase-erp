/**
 * Table definitions map camelCase API property names to snake_case columns.
 * `selectColumns` turns a definition into an aliased SELECT list, so rows come
 * back from PostgreSQL already in API shape - no manual row mapping.
 */
export interface TableDefinition<C extends Record<string, string>> {
  readonly name: string;
  readonly columns: C;
}

export function defineTable<const C extends Record<string, string>>(name: string, columns: C): TableDefinition<C> {
  return { name, columns };
}

export function selectColumns<C extends Record<string, string>>(
  table: TableDefinition<C>,
  alias?: string,
  only?: ReadonlyArray<keyof C & string>,
): string {
  const prefix = alias ? `${alias}.` : '';
  const keys = only ?? (Object.keys(table.columns) as Array<keyof C & string>);
  return keys.map((key) => `${prefix}${table.columns[key]} AS "${key}"`).join(', ');
}

export interface PageQuery {
  page: number;
  limit: number;
}

export function toOffset({ page, limit }: PageQuery): number {
  return (page - 1) * limit;
}

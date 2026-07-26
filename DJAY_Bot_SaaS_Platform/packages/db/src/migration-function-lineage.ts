/**
 * Migration function lineage analysis — guards against recreating a SECURITY DEFINER
 * function from a *stale* base.
 *
 * Why this exists: a migration that copies an older definition of a function silently
 * drops every clause added between that base and the current definition. This actually
 * happened — a draft migration recreated `tenancy.claim_ai_social_delivery` from its
 * 0024 definition while 0026 and 0027 had since redefined it, which would have dropped
 * `delivered_part_count` and Meta's `interval '24 hours'` service-window guard. Nothing
 * in typecheck, the unit suite, or the existing migration invariants detects that class
 * of defect, because the SQL is perfectly valid — just old.
 *
 * This module is a build-time analyser used by tests. It is deliberately not re-exported
 * from the package index: it is not runtime code.
 */

export type FunctionDefinition = Readonly<{
  /** Fully qualified name, e.g. `tenancy.claim_ai_social_delivery`. */
  name: string;
  /** Numeric migration prefix. */
  migration: number;
  file: string;
  /** Source text from `CREATE … FUNCTION` through the closing `$$;`. */
  body: string;
}>;

export type MigrationSource = Readonly<{ file: string; sql: string }>;

const definitionPattern = /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+([a-z_]+\.[a-z_0-9]+)\s*\(/gi;

/**
 * Every function definition in one migration. All definitions in this repo use `$$`
 * dollar quoting (asserted by a test), so the terminator is unambiguous.
 */
export function parseFunctionDefinitions(source: MigrationSource): FunctionDefinition[] {
  const migration = Number(source.file.slice(0, 4));
  const found: FunctionDefinition[] = [];
  for (const match of source.sql.matchAll(definitionPattern)) {
    const end = source.sql.indexOf("$$;", match.index);
    if (end === -1) continue;
    found.push({
      name: match[1]!.toLowerCase(), migration, file: source.file,
      body: source.sql.slice(match.index, end + 3),
    });
  }
  return found;
}

/** Definitions per function, ordered by migration number. */
export function buildFunctionLineage(sources: readonly MigrationSource[]): Map<string, FunctionDefinition[]> {
  const lineage = new Map<string, FunctionDefinition[]>();
  for (const source of [...sources].sort((left, right) => left.file.localeCompare(right.file))) {
    for (const definition of parseFunctionDefinitions(source)) {
      const existing = lineage.get(definition.name);
      if (existing) existing.push(definition); else lineage.set(definition.name, [definition]);
    }
  }
  return lineage;
}

function returnsTableColumns(body: string): string[] {
  const match = /RETURNS\s+TABLE\s*\(/i.exec(body);
  if (!match) return [];
  let index = match.index + match[0].length;
  let depth = 1;
  let inner = "";
  while (index < body.length) {
    const character = body[index]!;
    if (character === "(") depth += 1;
    else if (character === ")") { depth -= 1; if (depth === 0) break; }
    inner += character;
    index += 1;
  }
  return inner.split(",").map((part) => part.trim().split(/\s+/)[0] ?? "").filter(Boolean);
}

/**
 * Names a guard admits, from either the `IS DISTINCT FROM 'x'` / `<> 'x'` single form or
 * the `NOT IN ('a', 'b')` set form, so legitimately widening a guard is not mistaken for
 * dropping one.
 */
function guardedNames(body: string, subjectPattern: string): string[] {
  const names = new Set<string>();
  for (const pattern of [
    new RegExp(`${subjectPattern}[^\\n]{0,40}?IS\\s+DISTINCT\\s+FROM\\s*'([a-z_]+)'`, "gi"),
    new RegExp(`${subjectPattern}[^\\n]{0,40}?<>\\s*'([a-z_]+)'`, "gi"),
  ]) for (const match of body.matchAll(pattern)) names.add(match[1]!);
  for (const match of body.matchAll(new RegExp(`${subjectPattern}[^\\n]{0,40}?NOT\\s+IN\\s*\\(([^)]*)\\)`, "gi"))) {
    for (const part of match[1]!.split(",")) {
      const value = part.trim().replace(/^'|'$/g, "");
      if (value) names.add(value);
    }
  }
  return [...names];
}

/**
 * The clauses a redefinition must preserve. Each is chosen because losing it is silent
 * and consequential, and because it is a *set* membership question rather than a
 * semantic equivalence question — so widening stays legal and dropping does not.
 */
const preservedClauses: Readonly<Record<string, (body: string) => string[]>> = {
  /** Losing SECURITY DEFINER makes a privileged lookup fail closed or leak, depending. */
  security_definer: (body) => (/SECURITY\s+DEFINER/i.test(body) ? ["SECURITY DEFINER"] : []),
  /** A dropped schema from a pinned search_path breaks resolution at runtime, not at parse time. */
  search_path_schemas: (body) => {
    const match = /SET\s+search_path\s*=\s*([^\n]*)/i.exec(body);
    if (!match) return [];
    return match[1]!.replace(/\bAS\s*\$\$.*$/i, "").split(",")
      .map((part) => part.trim()).filter((part) => /^[a-z_]+$/.test(part));
  },
  /** The caller-role guard is the only thing stopping any role invoking a definer function. */
  session_user_guard: (body) => guardedNames(body, "session_user"),
  /** The service-context guard narrows a role to one worker path. */
  app_service_guard: (body) => guardedNames(body, "current_setting\\('app\\.service'[^)]*\\)"),
  /** A dropped returned column silently removes a feature from every caller. */
  returns_table_columns: returnsTableColumns,
  /** Time-window guards encode provider policy — e.g. Meta's 24-hour service window. */
  interval_guards: (body) => [...body.matchAll(/interval\s+'([^']+)'/gi)].map((match) => match[1]!),
};

export type LineageFinding = Readonly<{
  name: string;
  fromMigration: number;
  toMigration: number;
  file: string;
  clause: string;
  missing: readonly string[];
}>;

/**
 * `ALTER FUNCTION x … RENAME TO y` means the previous definition still exists under a new
 * name, so a same-migration `CREATE FUNCTION x` is a new wrapper rather than a
 * replacement and nothing was dropped. Detected structurally rather than allowlisted.
 */
function renamesAway(sql: string, name: string): boolean {
  const bare = name.split(".")[1] ?? name;
  return new RegExp(`ALTER\\s+FUNCTION\\s+(?:[a-z_]+\\.)?${bare}\\s*\\([^)]*\\)\\s*(?:\\n\\s*)?RENAME\\s+TO`, "i").test(sql);
}

/** Whether a migration removes a function outright, which also drops its grants. */
function dropsFunction(sql: string, name: string): boolean {
  const bare = name.split(".")[1] ?? name;
  return new RegExp(`DROP\\s+FUNCTION\\s+(?:IF\\s+EXISTS\\s+)?(?:[a-z_]+\\.)?${bare}\\s*\\(`, "i").test(sql);
}

function grantsExecute(sql: string, name: string): boolean {
  const bare = name.split(".")[1] ?? name;
  return new RegExp(`GRANT\\s+EXECUTE\\s+ON\\s+FUNCTION\\s+(?:[a-z_]+\\.)?${bare}\\s*\\(`, "i").test(sql);
}

/**
 * Every clause a redefinition dropped relative to the **latest prior** definition of the
 * same function.
 *
 * What this catches: a redefinition derived from any base older than the newest one,
 * whenever the skipped migrations added a returned column, a time-window guard, a
 * role/service guard, a search_path schema, or SECURITY DEFINER. That is precisely the
 * 0084 failure mode.
 *
 * What this does NOT catch: a semantic change that removes no tracked clause — for
 * example rewriting a WHERE predicate, dropping a plain boolean condition, or changing
 * a column's type or order. It is a staleness detector, not a SQL equivalence checker.
 */
export function findStaleRedefinitions(sources: readonly MigrationSource[]): LineageFinding[] {
  const byFile = new Map(sources.map((source) => [source.file, source.sql]));
  const findings: LineageFinding[] = [];
  for (const [name, definitions] of buildFunctionLineage(sources)) {
    for (let index = 1; index < definitions.length; index += 1) {
      const previous = definitions[index - 1]!;
      const current = definitions[index]!;
      if (renamesAway(byFile.get(current.file) ?? "", name)) continue;
      for (const [clause, extract] of Object.entries(preservedClauses)) {
        const kept = new Set(extract(current.body));
        const missing = extract(previous.body).filter((value) => !kept.has(value));
        if (missing.length) {
          findings.push({
            name, fromMigration: previous.migration, toMigration: current.migration,
            file: current.file, clause, missing,
          });
        }
      }
    }
  }
  return findings;
}

/**
 * A migration that DROPs a function must re-GRANT it: DROP discards grants, so omitting
 * the regrant leaves the function uncallable by the runtime roles.
 */
export function findMissingRegrants(sources: readonly MigrationSource[]): LineageFinding[] {
  const findings: LineageFinding[] = [];
  const lineage = buildFunctionLineage(sources);
  for (const source of sources) {
    for (const [name, definitions] of lineage) {
      if (!dropsFunction(source.sql, name) || grantsExecute(source.sql, name)) continue;
      const everGranted = definitions.some((definition) => {
        const sql = sources.find((candidate) => candidate.file === definition.file)?.sql ?? "";
        return grantsExecute(sql, name);
      });
      if (!everGranted) continue;
      findings.push({
        name, fromMigration: Number(source.file.slice(0, 4)), toMigration: Number(source.file.slice(0, 4)),
        file: source.file, clause: "regrant_after_drop", missing: ["GRANT EXECUTE"],
      });
    }
  }
  return findings;
}

export function describeFinding(finding: LineageFinding): string {
  return `${finding.file}: ${finding.name} redefined from ${String(finding.fromMigration).padStart(4, "0")}`
    + ` drops ${finding.clause} ${JSON.stringify(finding.missing)}`;
}

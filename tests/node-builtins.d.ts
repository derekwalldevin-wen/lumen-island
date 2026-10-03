/**
 * Minimal ambient declarations for the Node built-ins the tests use.
 *
 * The project has no @types/node, and adding it would pull a dependency into a
 * build that deliberately has none. Only the surface actually used is declared,
 * so a test that starts reaching for more will fail to typecheck rather than
 * silently depending on the whole Node type graph.
 */

declare module 'node:fs' {
  export function readFileSync(path: string, encoding: 'utf8'): string;
}

declare module 'node:path' {
  export function resolve(...segments: string[]): string;
}

/** The bit of the Node global the tests reach for. */
declare const process: { cwd(): string };
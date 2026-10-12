// @vitest-environment node
/**
 * Decision 10: v2 never surfaces the keyword alert classification (a G1 trust-contract bug
 * that flags city boilerplate). This guard parses v2 code and fails on executable use of the
 * classification (identifiers and quoted keys), never on words.
 */
import {
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	statSync,
	writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ts from 'typescript';
import { parse } from 'svelte/compiler';
import { describe, expect, it } from 'vitest';

const BANNED = new Set(['isAlert', 'alertKeyword', 'containsAlertKeyword']);
const ROOTS = ['src/lib/dashboard', 'src/lib/components/dashboard-v2'];

/** Every non-test .ts/.svelte file under the roots, recursively (Codex r3 #6). */
function v2Files(roots: readonly string[] = ROOTS): string[] {
	const out: string[] = [];
	const walkDir = (dir: string) => {
		for (const name of readdirSync(dir)) {
			const path = join(dir, name);
			if (statSync(path).isDirectory()) walkDir(path);
			else if (/\.(ts|js|svelte)$/.test(name) && !/\.(test|spec)\.(ts|js)$|\.d\.ts$/.test(name))
				out.push(path);
		}
	};
	roots.forEach(walkDir);
	return out.sort();
}

/** A string literal in a key position: element access, quoted destructuring/property/member keys, indexed types. */
function isKeyLiteral(node: ts.Node): boolean {
	const p = node.parent;
	if (!p) return false;
	if (ts.isElementAccessExpression(p)) return p.argumentExpression === node;
	if (ts.isBindingElement(p)) return p.propertyName === node;
	if (
		ts.isPropertyAssignment(p) ||
		ts.isPropertySignature(p) ||
		ts.isPropertyDeclaration(p) ||
		ts.isMethodDeclaration(p)
	)
		return p.name === node;
	if (ts.isComputedPropertyName(p)) return true;
	// Quoted module export names: import { 'containsAlertKeyword' as f } (Codex 9b2 #4).
	if (ts.isImportSpecifier(p) || ts.isExportSpecifier(p)) return true;
	return ts.isLiteralTypeNode(p) && ts.isIndexedAccessTypeNode(p.parent);
}

function tsHits(source: string, name = 'probe.ts'): string[] {
	const file = ts.createSourceFile(name, source, ts.ScriptTarget.Latest, true);
	const hits: string[] = [];
	// Constants that hold a banned name, so row[key] is a read of it (Codex 9b2 #3).
	const keyConsts = new Map<string, string>();
	const collect = (node: ts.Node) => {
		if (
			ts.isVariableDeclaration(node) &&
			ts.isIdentifier(node.name) &&
			node.initializer &&
			ts.isStringLiteralLike(node.initializer) &&
			BANNED.has(node.initializer.text)
		)
			keyConsts.set(node.name.text, node.initializer.text);
		ts.forEachChild(node, collect);
	};
	collect(file);
	const visit = (node: ts.Node) => {
		if (ts.isIdentifier(node) && BANNED.has(node.text)) hits.push(node.text);
		if (ts.isStringLiteralLike(node) && BANNED.has(node.text) && isKeyLiteral(node))
			hits.push(node.text);
		if (ts.isElementAccessExpression(node) && ts.isIdentifier(node.argumentExpression)) {
			const banned = keyConsts.get(node.argumentExpression.text);
			if (banned) hits.push(banned);
		}
		ts.forEachChild(node, visit);
	};
	visit(file);
	return hits;
}

const literalValue = (n: unknown): string | null => {
	const x = n as { type?: string; value?: unknown; literal?: { value?: unknown } } | null;
	if (x?.type === 'Literal' && typeof x.value === 'string') return x.value;
	if (x?.type === 'TSLiteralType' && typeof x.literal?.value === 'string') return x.literal.value;
	// A backtick key with no substitutions: row[`isAlert`] (Codex 9b2 #2).
	const t = n as {
		type?: string;
		expressions?: unknown[];
		quasis?: { value: { cooked: string } }[];
	};
	if (t?.type === 'TemplateLiteral' && t.expressions?.length === 0)
		return t.quasis?.[0]?.value.cooked ?? null;
	return null;
};

function svelteHits(source: string): string[] {
	const ast = parse(source, { modern: true });
	const hits: string[] = [];
	const hit = (v: string | null) => {
		if (v !== null && BANNED.has(v)) hits.push(v);
	};
	// Constants that hold a banned name, so row[key] is a read of it (Codex 9b2 #3).
	const keyConsts = new Map<string, string>();
	const collect = (node: unknown): void => {
		if (!node || typeof node !== 'object') return;
		if (Array.isArray(node)) return node.forEach(collect);
		const n = node as Record<string, unknown>;
		const id = n.id as { type?: string; name?: string } | undefined;
		const value = n.type === 'VariableDeclarator' ? literalValue(n.init) : null;
		if (value !== null && BANNED.has(value) && id?.type === 'Identifier' && id.name)
			keyConsts.set(id.name, value);
		for (const [k, v] of Object.entries(n)) if (k !== 'parent' && k !== 'loc') collect(v);
	};
	[ast.instance, ast.module, ast.fragment].forEach(collect);
	const walk = (node: unknown): void => {
		if (!node || typeof node !== 'object') return;
		if (Array.isArray(node)) return node.forEach(walk);
		const n = node as Record<string, unknown>;
		if (n.type === 'Identifier' && BANNED.has(n.name as string)) hits.push(n.name as string);
		// Quoted module export names: import { 'containsAlertKeyword' as f } (Codex 9b2 #4).
		if (n.type === 'ImportSpecifier') hit(literalValue(n.imported));
		if (n.type === 'ExportSpecifier') {
			hit(literalValue(n.local));
			hit(literalValue(n.exported));
		}
		// Quoted keys: { "isAlert": x } (Property, TSPropertySignature, PropertyDefinition, MethodDefinition).
		if ('key' in n) hit(literalValue(n.key));
		// Computed member access: row["alertKeyword"].
		if (n.type === 'MemberExpression' && n.computed) {
			hit(literalValue(n.property));
			const p = n.property as { type?: string; name?: string };
			if (p?.type === 'Identifier' && p.name) hit(keyConsts.get(p.name) ?? null);
		}
		// Indexed types: Item['isAlert'].
		if (n.type === 'TSIndexedAccessType') hit(literalValue(n.indexType));
		for (const [k, v] of Object.entries(n)) if (k !== 'parent' && k !== 'loc') walk(v);
	};
	walk(ast.instance);
	walk(ast.module);
	walk(ast.fragment);
	return hits;
}

const hitsOf = (path: string) => {
	const source = readFileSync(path, 'utf8');
	return path.endsWith('.svelte') ? svelteHits(source) : tsHits(source, path);
};

describe('the guard itself (it must neither go hollow nor ban words)', () => {
	it('inventories the v2 modules that exist', () => {
		const files = v2Files();
		for (const expected of [
			'src/lib/dashboard/latest-reporting.ts',
			'src/lib/dashboard/measured.ts',
			'src/lib/dashboard/v2-map-data.ts',
			'src/lib/components/dashboard-v2/V2Map.svelte',
			'src/lib/components/dashboard-v2/NewsRow.svelte'
		])
			expect(files).toContain(expected);
	});

	it('finds and flags a file in a nested folder (Codex r3 #6)', () => {
		const root = mkdtempSync(join(tmpdir(), 'v2-guard-'));
		mkdirSync(join(root, 'a', 'b'), { recursive: true });
		writeFileSync(
			join(root, 'a', 'b', 'probe.svelte'),
			'<script lang="ts">let { row } = $props();</script>{#if row.isAlert}!{/if}'
		);
		writeFileSync(join(root, 'a', 'probe.ts'), 'export const f = (o: { isAlert?: boolean }) => o;');
		writeFileSync(join(root, 'a', 'probe.js'), 'export const g = (item) => item.alertKeyword;');
		const files = v2Files([root]);
		expect(files.map((f) => f.slice(root.length))).toEqual(
			expect.arrayContaining(['/a/b/probe.svelte', '/a/probe.ts', '/a/probe.js'])
		);
		// Each probe on its own, through hitsOf: no file kind can go hollow behind another (Codex 9b2 #5, #6).
		expect(hitsOf(join(root, 'a', 'b', 'probe.svelte'))).toEqual(['isAlert']);
		expect(hitsOf(join(root, 'a', 'probe.ts'))).toEqual(['isAlert']);
		expect(hitsOf(join(root, 'a', 'probe.js'))).toEqual(['alertKeyword']);
		expect(statSync(root).isDirectory()).toBe(true);
	});

	it('flags backtick keys, quoted import names and constant-key reads (Codex 9b2 #2–#4)', () => {
		expect(
			svelteHits(
				'<script lang="ts">let { row } = $props();</script><span title={row[`isAlert`]}></span>'
			)
		).toEqual(['isAlert']);
		expect(
			tsHits("import { 'containsAlertKeyword' as classify } from '$lib/config/keywords';")
		).toEqual(['containsAlertKeyword']);
		expect(
			svelteHits(
				`<script lang="ts">import { 'containsAlertKeyword' as classify } from '$lib/config/keywords';</script>`
			)
		).toEqual(['containsAlertKeyword']);
		expect(tsHits("const key = 'isAlert'; const flag = row[key];")).toEqual(['isAlert']);
		expect(
			svelteHits(
				`<script lang="ts">const key = 'isAlert'; let { row } = $props();</script>{#if row[key]}!{/if}`
			)
		).toEqual(['isAlert']);
		// A plain value that is never used as a key is still just a word.
		expect(tsHits("const label = 'isAlert'; console.log(label);")).toEqual([]);
	});

	it('flags identifiers in TypeScript and in Svelte scripts and templates', () => {
		expect(tsHits('export const f = (item: { isAlert?: boolean }) => item.isAlert;')).toContain(
			'isAlert'
		);
		expect(tsHits("import { containsAlertKeyword } from '$lib/config/keywords';")).toContain(
			'containsAlertKeyword'
		);
		expect(
			svelteHits('<script lang="ts">let { row } = $props();</script>{#if row.isAlert}<b>!</b>{/if}')
		).toEqual(['isAlert']);
	});

	it('flags quoted destructuring, quoted keys and element access (Codex r3 #6)', () => {
		expect(tsHits('const { "isAlert": flagged } = item;')).toEqual(['isAlert']);
		expect(tsHits("const k = item['alertKeyword'];")).toEqual(['alertKeyword']);
		expect(tsHits("const o = { 'isAlert': true };")).toEqual(['isAlert']);
		expect(tsHits("type F = Item['isAlert'];")).toEqual(['isAlert']);
		expect(svelteHits('<script lang="ts">const { "isAlert": flagged } = item;</script>')).toEqual([
			'isAlert'
		]);
		expect(
			svelteHits(
				'<script lang="ts">let { row } = $props();</script>{#if row["alertKeyword"]}!{/if}'
			)
		).toEqual(['alertKeyword']);
	});

	it('ignores words: comments, string values, template text, URLs, ALERTCalifornia', () => {
		expect(
			tsHits(
				'// isAlert is never read here\nconst s = "isAlert alertKeyword"; const o = { title: \'isAlert\' };'
			)
		).toEqual([]);
		expect(
			svelteHits(
				'<script lang="ts">/* alertKeyword */ const href = "https://local.nixle.com/alert/123/";</script>' +
					'<a {href}>Library alert list goes live at noon</a><span>ALERTCalifornia · isAlert</span>'
			)
		).toEqual([]);
	});
});

describe('v2 code never reads the keyword alert classification (Decision 10)', () => {
	it.each(v2Files())('%s', (path) => {
		expect(hitsOf(path)).toEqual([]);
	});
});

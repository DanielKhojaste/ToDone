import * as fs from 'fs';
import * as path from 'path';
import * as oniguruma from 'vscode-oniguruma';
import * as vsctm from 'vscode-textmate';

export const ROOT = path.resolve(__dirname, '..', '..', '..');
export const FIXTURES = path.join(ROOT, 'test', 'fixtures');

export interface Token {
  text: string;
  scopes: string[];
}

let grammarPromise: Promise<vsctm.IGrammar> | undefined;

function loadGrammar(): Promise<vsctm.IGrammar> {
  if (!grammarPromise) {
    const wasmPath = require.resolve('vscode-oniguruma/release/onig.wasm');
    const wasm = fs.readFileSync(wasmPath);
    const onigLib = oniguruma.loadWASM(wasm.buffer.slice(wasm.byteOffset, wasm.byteOffset + wasm.byteLength)).then(() => ({
      createOnigScanner: (patterns: string[]) => new oniguruma.OnigScanner(patterns),
      createOnigString: (s: string) => new oniguruma.OnigString(s),
    }));
    const registry = new vsctm.Registry({
      onigLib,
      loadGrammar: async () => {
        const file = path.join(ROOT, 'syntaxes', 'todone.tmLanguage.json');
        return vsctm.parseRawGrammar(fs.readFileSync(file, 'utf8'), file);
      },
    });
    grammarPromise = registry.loadGrammar('text.todone').then((g) => {
      if (!g) {
        throw new Error('Could not load the ToDone grammar');
      }
      return g;
    });
  }
  return grammarPromise;
}

/** Tokenizes text the same way VS Code does, one line at a time. */
export async function tokenize(text: string): Promise<Token[][]> {
  const grammar = await loadGrammar();
  let stack = vsctm.INITIAL;
  return text.split(/\r?\n/).map((line) => {
    const result = grammar.tokenizeLine(line, stack);
    stack = result.ruleStack;
    return result.tokens.map((t) => ({ text: line.slice(t.startIndex, t.endIndex), scopes: t.scopes }));
  });
}

/** Scopes of the first token on a line whose text equals or contains `needle`. */
export function scopesOf(line: Token[], needle: string): string[] {
  const exact = line.find((t) => t.text === needle);
  const token = exact ?? line.find((t) => t.text.includes(needle));
  if (!token) {
    throw new Error(`No token "${needle}" in line: ${JSON.stringify(line.map((t) => t.text))}`);
  }
  return token.scopes;
}

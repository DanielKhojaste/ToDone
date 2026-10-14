/**
 * Mocha entry point for the integration tests when they are launched with
 * `--extensionTestsPath` (for example by @vscode/test-electron's runTests or a
 * VS Code server). `npm run test:integration` uses @vscode/test-cli instead,
 * which does not need this file.
 */
import * as fs from 'fs';
import * as path from 'path';
import Mocha = require('mocha');

export function run(): Promise<void> {
  const reportFile = process.env.TODONE_TEST_REPORT;
  const mocha = new Mocha({
    ui: 'bdd',
    color: false,
    timeout: 20000,
    reporter: reportFile ? 'json' : 'spec',
    reporterOptions: reportFile ? { output: reportFile } : undefined,
  });
  for (const file of fs.readdirSync(__dirname)) {
    if (file.endsWith('.test.js')) {
      mocha.addFile(path.join(__dirname, file));
    }
  }
  return new Promise((resolve, reject) => {
    mocha.run((failures) => (failures ? reject(new Error(`${failures} integration test(s) failed`)) : resolve()));
  });
}

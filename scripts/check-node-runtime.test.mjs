import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assess } from './check-node-runtime.mjs';

const releases = [
  { version: 'v24.23.0', security: false },
  { version: 'v24.22.1', security: true },
  { version: 'v22.23.4', security: true },
];
const schedule = { v20: { end: '2026-04-30' }, v22: { end: '2027-04-30' }, v24: { end: '2028-04-30' } };
const check = (files) => assess(files, releases, schedule, '2026-10-23');

test('rejects vulnerable Node pins in Docker, Netlify and CI', () => {
  const result = check({
    Dockerfile: 'FROM --platform=linux/amd64 node:22.18-alpine AS build\n',
    'netlify.toml': '[build.environment]\nNODE_VERSION = "24.14.1"\n',
    '.github/workflows/ci.yml': "node-version: '22.13.0'\n",
  });
  assert.equal(result.entries.length, 3);
  assert.equal(result.errors.length, 3);
});

test('requires supported lines even for floating tags', () => {
  assert.match(check({ '.nvmrc': '20\n' }).errors[0], /unsupported/);
});

test('accepts the security baseline and later non-security releases', () => {
  assert.deepEqual(check({ '.nvmrc': '24.22.1\n', Dockerfile: 'FROM node:24.22.1-alpine@sha256:abc\n' }).errors, []);
  assert.deepEqual(check({ '.nvmrc': '24.23.0\n' }).errors, []);
});

test('rejects drift between independently patched environments', () => {
  const result = check({ '.nvmrc': '24.22.1\n', 'netlify.toml': 'NODE_VERSION="22.23.4"' });
  assert.ok(result.errors.some((error) => error.includes('major differs')));
});

test('reports floating and dynamic selectors without claiming installed patch coverage', () => {
  const result = check({ '.nvmrc': '24\n', '.github/workflows/ci.yml': 'node-version: ${{ matrix.node }}\n' });
  assert.equal(result.errors.length, 0);
  assert.equal(result.warnings.length, 2);
});

test('fails visibly on missing official release data', () => {
  assert.throws(() => assess({}, [], schedule, '2026-10-23'), /malformed/);
});

test('does not misinterpret engines or commented declarations as installed versions', () => {
  const result = check({ 'package.json': '{"engines":{"node":">=20"}}', Dockerfile: '# FROM node:20\nFROM nginx:alpine\n' });
  assert.equal(result.entries.length, 0);
});

import assert from 'node:assert/strict';
import {
  buildMcpServerDraft,
  createEmptyMcpDraft,
  describeMcpMutationResult,
  hydrateMcpEditorState,
  mcpListToText,
  mcpObjectToText,
  mcpTextToList,
  mcpTextToObject,
  normalizeMcpTransport,
} from './mcpEditor.js';

assert.deepEqual(createEmptyMcpDraft(), {
  name: '',
  transport: 'stdio',
  command: '',
  args: [],
  url: '',
  env: {},
  headers: {},
  timeout_ms: 10000,
});

assert.equal(normalizeMcpTransport('http'), 'http');
assert.equal(normalizeMcpTransport('sse'), 'stdio');
assert.equal(normalizeMcpTransport(null), 'stdio');

assert.equal(mcpListToText(['--allow-hosts=a,b', '--flag']), '--allow-hosts=a,b\n--flag');
assert.deepEqual(mcpTextToList('--allow-hosts=a,b\n--flag\n\n'), ['--allow-hosts=a,b', '--flag']);
assert.deepEqual(mcpTextToList('--comma=a,b,c'), ['--comma=a,b,c']);

assert.equal(mcpObjectToText({ A: '1', B: 'two=parts' }), 'A=1\nB=two=parts');
assert.deepEqual(mcpTextToObject('A=1\nB=two=parts\nEMPTY\n'), {
  A: '1',
  B: 'two=parts',
  EMPTY: '',
});
assert.deepEqual(mcpTextToObject('  HEADER = value with spaces  '), {
  HEADER: 'value with spaces',
});

const stdioState = hydrateMcpEditorState({
  name: 'context7',
  transport: 'stdio',
  command: 'npx',
  args: ['-y', '@upstash/context7-mcp'],
  timeout_ms: 2500,
  env_keys: ['CONTEXT7_API_KEY'],
});
assert.equal(stdioState.draft.name, 'context7');
assert.equal(stdioState.draft.transport, 'stdio');
assert.equal(stdioState.draft.command, 'npx');
assert.equal(stdioState.argsText, '-y\n@upstash/context7-mcp');
assert.equal(stdioState.envText, '');
assert.equal(stdioState.replaceEnv, false);

const httpState = hydrateMcpEditorState({
  name: 'fetcher',
  transport: 'http',
  url: 'http://localhost:6000/mcp',
  timeout_ms: 0,
  header_names: ['Authorization'],
});
assert.equal(httpState.draft.transport, 'http');
assert.equal(httpState.draft.url, 'http://localhost:6000/mcp');
assert.equal(httpState.draft.timeout_ms, 0);
assert.equal(httpState.headerText, '');
assert.equal(httpState.replaceHeaders, false);

const stdioDraft = buildMcpServerDraft(
  { name: ' context7 ', transport: 'stdio', command: ' npx ', timeout_ms: '10000' },
  {
    argsText: '--allow-hosts=a,b\n--flag',
    envText: 'CONTEXT7_API_KEY=${CONTEXT7_API_KEY}',
  },
);
assert.deepEqual(stdioDraft, {
  name: 'context7',
  transport: 'stdio',
  timeout_ms: 10000,
  command: 'npx',
  args: ['--allow-hosts=a,b', '--flag'],
  env: { CONTEXT7_API_KEY: '${CONTEXT7_API_KEY}' },
});

const httpPatchWithoutHeaders = buildMcpServerDraft(
  { name: 'fetcher', transport: 'http', url: ' http://localhost:6000/mcp ', timeout_ms: 10000 },
  { headerText: '', envText: '' },
);
assert.deepEqual(httpPatchWithoutHeaders, {
  name: 'fetcher',
  transport: 'http',
  timeout_ms: 10000,
  url: 'http://localhost:6000/mcp',
});

const httpHeaderMerge = buildMcpServerDraft(
  { name: 'fetcher', transport: 'http', url: 'http://localhost:6000/mcp', timeout_ms: 10000 },
  { headerText: 'X-Trace=1', envText: 'TOKEN=abc' },
);
assert.deepEqual(httpHeaderMerge.headers, { 'X-Trace': '1' });
assert.deepEqual(httpHeaderMerge.env, { TOKEN: 'abc' });
assert.equal(httpHeaderMerge.replace_headers, undefined);
assert.equal(httpHeaderMerge.replace_env, undefined);

const httpHeaderReplaceClear = buildMcpServerDraft(
  { name: 'fetcher', transport: 'http', url: 'http://localhost:6000/mcp', timeout_ms: 10000 },
  { headerText: '', envText: '', replaceHeaders: true, replaceEnv: true },
);
assert.deepEqual(httpHeaderReplaceClear.headers, {});
assert.deepEqual(httpHeaderReplaceClear.env, {});
assert.equal(httpHeaderReplaceClear.replace_headers, true);
assert.equal(httpHeaderReplaceClear.replace_env, true);

assert.equal(
  describeMcpMutationResult({ message: 'done', requires_reload: true }, 'Saved.'),
  'done',
);
assert.equal(
  describeMcpMutationResult({ requires_restart: true }, 'Saved.'),
  'Saved. Restart this instance to apply the change.',
);
assert.equal(
  describeMcpMutationResult({ requires_reload: true }, 'Saved.'),
  'Saved. Reload config to apply the change.',
);
assert.equal(describeMcpMutationResult({}, 'Saved.'), 'Saved.');

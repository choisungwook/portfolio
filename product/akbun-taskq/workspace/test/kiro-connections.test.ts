import { test } from 'node:test'
import assert from 'node:assert/strict'
import { setMeta } from '../src/db/meta.ts'
import { addKiroConnection, kiroConnections, kiroSso, removeKiroConnection, selectKiroConnection, setKiroSso } from '../src/agents/kiro/login.ts'
import { setup } from './helpers.ts'

test('Kiro keeps several Identity Center connections, one in use, and a home from before keeps its start URL', () => {
  const env = setup()
  try {
    setMeta(env.db, 'kiro_start_url', 'https://acme.awsapps.com/start')
    setMeta(env.db, 'kiro_region', 'us-west-2')
    assert.deepEqual(kiroConnections(env.db), { connections: [{ id: 'k1', name: 'acme', start_url: 'https://acme.awsapps.com/start', region: 'us-west-2' }], active: 'k1' })
    const added = addKiroConnection(env.db, { name: 'Lab', start_url: 'https://lab.awsapps.com/start', region: 'eu-west-1' })
    assert.ok(typeof added !== 'string')
    assert.equal(added.active, 'k1', 'adding does not switch')
    assert.match(String(addKiroConnection(env.db, { start_url: 'https://lab.awsapps.com/start', region: 'eu-west-1' })), /already/)
    assert.match(String(addKiroConnection(env.db, { start_url: 'https://example.com', region: 'eu-west-1' })), /start URL/)
    selectKiroConnection(env.db, 'k2')
    assert.deepEqual(kiroSso(env.db), { start_url: 'https://lab.awsapps.com/start', region: 'eu-west-1' })
    assert.equal(setKiroSso(env.db, { start_url: 'https://lab.awsapps.com/start', region: 'eu-central-1' }), null)
    assert.equal(kiroSso(env.db).region, 'eu-central-1', 'the login form edits the connection in use')
    const left = removeKiroConnection(env.db, 'k2')
    assert.ok(typeof left !== 'string')
    assert.equal(left.active, 'k1', 'removing the one in use falls back to another')
  } finally {
    env.cleanup()
  }
})

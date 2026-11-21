import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { mask, maskDeep } from '../src/mask.ts'

// The AWS key id and secret key rows are the invariant cases, so their names carry [critical].
const cases: [string, string, boolean?][] = [
  ['key id AKIAEXAMPLEKEYID0000 in log', 'AKIAEXAMPLEKEYID0000', true],
  ['aws_secret_access_key = wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY', 'wJalrXUtnFEMI', true],
  ['password=hunter2 used', 'hunter2'],
]

for (const [input, secret, guarded] of cases) {
  test(`${guarded ? '[critical] ' : ''}masks ${secret.slice(0, 12)}`, () => {
    assert.ok(!mask(input).includes(secret), mask(input))
  })
}

test('ARN keeps its shape and loses the account id', () => {
  assert.equal(mask('arn:aws:iam::111122223333:role/example-readonly'), 'arn:aws:iam::[ACCOUNT]:role/example-readonly')
})

test('hex git commit ids are untouched', () => {
  const text = 'fixed in 7f036e38 on top of 9c2d1ab04e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b'
  assert.equal(mask(text), text)
})

describe('secret shapes', () => {
  const secret = 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY'
  test('AWS secret after =, : and whitespace', () => {
    for (const sep of [' = ', '=', ': ', ' ']) {
      const out = mask(`AWS_SECRET_ACCESS_KEY${sep}${secret}`)
      assert.ok(!out.includes(secret), out)
    }
  })

  test('mysql and psql passwords in every form', () => {
    assert.equal(mask('mysql -u root --password hunter2x -h db'), 'mysql -u root --password [REDACTED] -h db')
    assert.equal(mask('mysql -u root --password=hunter2x'), 'mysql -u root --password=[REDACTED]')
    assert.equal(mask('mysql -u root -phunter2x db'), 'mysql -u root -p[REDACTED] db')
    assert.equal(mask('psql -h db -p 5432'), 'psql -h db -p 5432')
    assert.equal(mask('deploy --secret abc123x --token=abc123x'), 'deploy --secret [REDACTED] --token=[REDACTED]')
  })

  test('JSON value with spaces is masked whole', () => {
    const out = mask('{"password": "correct horse battery", "user": "ops"}')
    assert.ok(!out.includes('horse'), out)
    assert.ok(out.includes('"user": "ops"'), out)
  })

  test('[critical] URL userinfo keeps the user and masks the password', () => {
    assert.equal(mask('clone https://deploy:hunter2x@git.example.com/repo.git'), 'clone https://deploy:[REDACTED]@git.example.com/repo.git')
  })

  test('[critical] Basic and Bearer authorization headers', () => {
    const basic = 'Authorization: Basic ' + 'dXNlcjpwYXNzd29yZA=='
    assert.equal(mask(basic), 'Authorization: Basic [REDACTED]')
    assert.equal(mask('Authorization: Bearer abc.def'), 'Authorization: Bearer [REDACTED]')
  })

  test('token prefixes for GitHub, Slack, OpenAI, Anthropic and Google', () => {
    const samples = [
      'ghp' + '_' + 'Q3xKz9'.repeat(6),
      'gho' + '_' + 'Q3xKz9'.repeat(6),
      'ghs' + '_' + 'Q3xKz9'.repeat(6),
      'github' + '_pat_' + 'Q3xKz9'.repeat(6),
      'xox' + 'b-' + '1234567890-abcdefghij',
      'xox' + 'p-' + '1234567890-abcdefghij',
      'sk-' + 'proj-' + 'Q3xKz9Q3xKz9Q3x',
      'sk-' + 'ant-' + 'api03-Q3xKz9Q3xKz9',
      'AI' + 'za' + 'Q3xKz9'.repeat(6),
    ]
    for (const sample of samples) {
      const out = mask(`token seen: ${sample} end`)
      assert.ok(!out.includes(sample.slice(-12)), out)
    }
  })

  test('sts account ids keep the last 4 digits in JSON fields', () => {
    const sts = '{"UserId": "AROAEXAMPLE:session", "Account": "111122223333", "Arn": "arn:aws:sts::111122223333:assumed-role/ops/x"}'
    const out = mask(sts)
    assert.ok(!out.includes('111122223333'), out)
    assert.ok(out.includes('"Account": "********3333"'), out)
    assert.ok(out.includes('"Arn": "arn:aws:sts::********3333:assumed-role/ops/x"'), out)
  })

  test('private key block ends at END line, or at end of text when END is missing', () => {
    const body = 'MIIEowIBAAKCAQEAEXAMPLE'
    const full = `before\n-----BEGIN RSA PRIVATE KEY-----\n${body}\n-----END RSA PRIVATE KEY-----\nafter`
    assert.equal(mask(full), 'before\n[REDACTED:private-key]\nafter')
    const cut = `head\n-----BEGIN PRIVATE KEY-----\n${body}\nmore`
    assert.equal(mask(cut), 'head\n[REDACTED:private-key]')
  })
})

describe('maskDeep', () => {
  test('masks string leaves and keeps structure and non-strings', () => {
    const payload = { command: 'curl -H "token: abc123" https://x', nested: ['a\\b', 1, { ok: true }], n: null }
    assert.deepEqual(maskDeep(payload), {
      command: 'curl -H "token: [REDACTED]" https://x', nested: ['a\\b', 1, { ok: true }], n: null,
    })
  })

  test('a string under a secret-looking key is replaced whole', () => {
    assert.deepEqual(maskDeep({ api_key: 'anything at all', max_tokens: 60 }), { api_key: '[REDACTED]', max_tokens: 60 })
  })

  test('every string leaf under a secret-looking key is replaced, however deep', () => {
    const payload = { credentials: { token: { a: 'x', list: ['y', { b: 'z' }] }, n: 3 }, cookie: 'sid=1' }
    assert.deepEqual(maskDeep(payload), {
      credentials: { token: { a: '[REDACTED]', list: ['[REDACTED]', { b: '[REDACTED]' }] }, n: 3 },
      cookie: '[REDACTED]',
    })
  })
})

// Shapes below are built by concatenation so the source file holds no secret-looking literal.
describe('hardening', () => {
  test('PGP private key blocks are redacted to their END line', () => {
    const block = '-----BEGIN PGP PRIVATE KEY BLOCK-----\nlQOYBEXAMPLE\n-----END PGP PRIVATE KEY BLOCK-----'
    assert.equal(mask(`before\n${block}\nafter`), 'before\n[REDACTED:private-key]\nafter')
  })

  test('an unquoted password value is masked to the end of the line', () => {
    assert.equal(mask('password: correct horse battery'), 'password: [REDACTED]')
    assert.equal(mask('password: correct horse battery\nnext line'), 'password: [REDACTED]\nnext line')
  })

  test('a quoted password value is masked to its closing quote', () => {
    assert.equal(mask('password="correct horse battery staple" next'), 'password="[REDACTED]" next')
    assert.equal(mask("password='correct horse' next"), "password='[REDACTED]' next")
  })

  test('a URL password containing @ is masked up to the last @ before the host', () => {
    assert.equal(mask('postgres://u:p@ss@host/db'), 'postgres://u:[REDACTED]@host/db')
  })

  test('Cookie and Set-Cookie header values are masked', () => {
    assert.equal(mask('Cookie: sid=abc123; theme=dark'), 'Cookie: [REDACTED]')
    assert.equal(mask('Set-Cookie: sid=abc123; Path=/'), 'Set-Cookie: [REDACTED]')
  })

  test('JWTs are masked', () => {
    const jwt = 'eyJ' + 'hbGciOiJIUzI1NiJ9' + '.' + 'eyJzdWIiOiIxMjM0In0' + '.' + 'sigsigsig'
    assert.equal(mask(`token ${jwt} end`), 'token [REDACTED:jwt] end')
  })

  test('npm, GitLab, Stripe live and Google OAuth token prefixes are masked', () => {
    const samples = [
      'npm' + '_' + 'a1B2c3D4e5F6g7H8i9J0k1L2m3N4',
      'glpat' + '-' + 'a1B2c3D4e5F6g7H8i9J0',
      'sk' + '_live_' + 'abcdefghij1234',
      'rk' + '_live_' + 'abcdefghij1234',
      'ya' + '29.' + 'a0AfH6SMBabcdefghijklmnop',
    ]
    for (const sample of samples) {
      const out = mask(`seen ${sample} end`)
      assert.ok(!out.includes(sample.slice(-10)), out)
    }
  })

  test('a plain account id keeps its last four digits', () => {
    assert.equal(mask('Account: 111122223333'), 'Account: ********3333')
    assert.equal(mask('account id 111122223333'), 'account id ********3333')
  })

  test('prose that names a token or password without a value is untouched', () => {
    for (const text of ['the token is invalid', 'password policy', 'max_tokens 60 and input_tokens 120']) {
      assert.equal(mask(text), text)
    }
  })

  test('[critical] a 20 kB adversarial input is masked within 200 ms', () => {
    for (const text of ['token'.repeat(4000), 'password'.repeat(2500), 'a='.repeat(10000)]) {
      const started = performance.now()
      mask(text)
      assert.ok(performance.now() - started < 200, `took ${performance.now() - started} ms`)
    }
  })

  test('text past the scan limit is dropped and the count is shown', () => {
    const out = mask('x'.repeat(20000) + ' password=hunter2')
    assert.ok(!out.includes('hunter2'), out.slice(-60))
    assert.ok(out.endsWith('…(+17 chars not stored)'), out.slice(-60))
  })
})

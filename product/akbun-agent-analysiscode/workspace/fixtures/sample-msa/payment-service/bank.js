// External bank gateway client. This is the slow dependency in the demo:
// BANK_TIMEOUT_MS defaults to 5000ms while the order service gives up at 3s.
const BANK_URL = process.env.BANK_GATEWAY_URL || 'https://bank.example.com/api';
const BANK_TIMEOUT_MS = Number(process.env.BANK_TIMEOUT_MS || 5000);

async function chargeBank(orderId, amount) {
  const response = await fetch(`${BANK_URL}/charge`, {
    method: 'POST',
    body: JSON.stringify({ reference: orderId, amount }),
    signal: AbortSignal.timeout(BANK_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`bank returned ${response.status}`);
  const body = await response.json();
  return body.charge_id;
}

module.exports = { chargeBank };

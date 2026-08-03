// Payment service: charges cards through an external bank gateway.
const express = require('express');
const { publish } = require('./events');
const { chargeBank } = require('./bank');

const app = express();
app.use(express.json());

const payments = new Map();

// Capture a payment for an order. Called by the order service.
app.post('/payments', async (req, res) => {
  const { order_id: orderId, amount } = req.body;
  try {
    const chargeId = await chargeBank(orderId, amount);
    payments.set(chargeId, { orderId, amount, status: 'captured' });
    publish('payment.captured', { charge_id: chargeId, order_id: orderId });
    res.json({ charge_id: chargeId });
  } catch (err) {
    res.status(502).json({ error: `bank gateway failed: ${err.message}` });
  }
});

app.get('/payments/:id', (req, res) => {
  const payment = payments.get(req.params.id);
  if (!payment) return res.status(404).json({ error: 'unknown payment' });
  res.json(payment);
});

app.listen(process.env.PORT || 8080);

// Event publishing to the shared message broker.
const { createClient } = require('redis');

const broker = createClient({ url: process.env.BROKER_URL || 'redis://broker:6379' });

function publish(topic, payload) {
  broker.publish(topic, JSON.stringify(payload));
}

module.exports = { publish };

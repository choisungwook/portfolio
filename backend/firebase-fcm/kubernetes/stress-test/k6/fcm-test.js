import http from 'k6/http';
import { sleep } from 'k6';

export const options = {
  scenarios: {
    firebaes943: {
      executor: 'ramping-vus',
      exec: 'firebaes943',
      stages: [
        // { duration: '30s', target: 100 },
        // { duration: '30s', target: 200 },
        // { duration: '30s', target: 300 },
        // { duration: '30s', target: 400 },
        // { duration: '30s', target: 500 },
        // { duration: '10m', target: 1000 },
        // { duration: '10m', target: 1200 },
        // { duration: '10m', target: 1400 },
        // { duration: '10m', target: 1600 },
        { duration: '10m', target: 2000 },
        { duration: '10m', target: 2500 },
        { duration: '10m', target: 3000 },
        { duration: '1m', target: 0 },
      ],
    },
    firebase920: {
      executor: 'ramping-vus',
      exec: 'firebase920',
      stages: [
        // { duration: '30s', target: 100 },
        // { duration: '30s', target: 200 },
        // { duration: '30s', target: 300 },
        // { duration: '30s', target: 400 },
        // { duration: '30s', target: 500 },
        // { duration: '10m', target: 1000 },
        // { duration: '10m', target: 1200 },
        // { duration: '10m', target: 1400 },
        // { duration: '10m', target: 1600 },
        { duration: '10m', target: 2000 },
        { duration: '10m', target: 2500 },
        { duration: '10m', target: 3000 },
        { duration: '1m', target: 0 }
      ],
    },
  },
};

// export const options = {
//   scenarios: {
//     firebaes943: {
//       executor: 'constant-vus',
//       exec: 'firebaes943',
//       vus: 2000,
//       duration: '30m',
//     },
//     firebase920: {
//       executor: 'constant-vus',
//       exec: 'firebase920',
//       vus: 2000,
//       duration: '30m',
//     },
//   },
// };

const payload = JSON.stringify({
  token: __ENV.FCM_TEST_TOKEN || '',
  title: 'hello',
  message: "hello world. it's me",
});

const headers = { 'Content-Type': 'application/json' };

export function firebase920() {
  http.post('http://localhost:30080/send', payload, { headers });
  sleep(1);
}

export function firebaes943() {
  http.post('http://localhost:30090/send', payload, { headers });
  sleep(1);
}

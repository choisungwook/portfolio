import http from 'k6/http';
import { sleep } from 'k6';

export const options = {
  vus: 300,
  duration: '300s',
};

export default function () {
  http.get('http://localhost:8080/reproduce');
  sleep(1);
}

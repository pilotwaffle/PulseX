import http from 'http';
import { database } from './config/database';
import { redisClient } from './config/redis';

const options = {
  host: 'localhost',
  port: process.env.PORT || 3000,
  path: '/api/v1/health',
  timeout: 2000,
  method: 'GET',
};

const request = http.request(options, (res) => {
  console.log(`Health check status: ${res.statusCode}`);
  if (res.statusCode === 200) {
    process.exit(0);
  } else {
    process.exit(1);
  }
});

request.on('error', (err) => {
  console.error('Health check failed:', err.message);
  process.exit(1);
});

request.on('timeout', () => {
  console.error('Health check timeout');
  request.destroy();
  process.exit(1);
});

request.end();
import { readFile, writeFile } from 'node:fs/promises';

const file = new URL('../src/static/assistant-config.json', import.meta.url);
const argument = process.argv[2];
if (argument === '--disable') {
  await writeFile(file, JSON.stringify({ enabled: false, endpoint: '' }, null, 2) + '\n');
  console.log('Assistant disabled. Build and publish the frontend to apply.');
} else {
  try {
    const endpoint = new URL(argument || '');
    if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password || endpoint.port ||
        endpoint.search || endpoint.hash || endpoint.pathname !== '/api/assistant' ||
        !endpoint.hostname.endsWith('.workers.dev')) {
      throw new Error('Use the deployed HTTPS workers.dev URL ending in /api/assistant, without a query or credentials.');
    }
    const response = await fetch(new URL('/health', endpoint), {
      headers: { Origin: 'https://sarthak0501.github.io' },
      signal: AbortSignal.timeout(10000)
    });
    const health = await response.json();
    if (!response.ok || health.available !== true) {
      throw new Error('Worker health check did not confirm availability. Configure the API key, rate-limit secret and Durable Object first.');
    }
    await readFile(file); // Fail clearly if run outside a complete checkout.
    await writeFile(file, JSON.stringify({ enabled: true, endpoint: endpoint.href }, null, 2) + '\n');
    console.log('Configured the public endpoint. Run the live evaluations, then build, commit and publish this configuration.');
  } catch (error) {
    console.error('Assistant configuration unchanged:', error.message);
    console.error('Usage: npm run assistant:configure -- https://WORKER.ACCOUNT.workers.dev/api/assistant');
    process.exitCode = 1;
  }
}

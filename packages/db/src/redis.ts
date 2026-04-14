import Redis from 'ioredis';

let redis: Redis | null = null;
let subscriber: Redis | null = null;
let publisher: Redis | null = null;

function createClient(url: string, name: string): Redis {
  const client = new Redis(url, {
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
    lazyConnect: false,
    connectionName: name,
  });

  client.on('error', (err) => {
    console.error(`Redis [${name}] error:`, err);
  });

  client.on('connect', () => {
    console.info(`Redis [${name}] connected`);
  });

  return client;
}

export function getRedis(): Redis {
  if (!redis) {
    const url = process.env['REDIS_URL'];
    if (!url) throw new Error('REDIS_URL environment variable is required');
    redis = createClient(url, 'main');
  }
  return redis;
}

// Dedicated pub/sub clients — they cannot be used for regular commands
export function getSubscriber(): Redis {
  if (!subscriber) {
    const url = process.env['REDIS_URL'];
    if (!url) throw new Error('REDIS_URL environment variable is required');
    subscriber = createClient(url, 'subscriber');
  }
  return subscriber;
}

export function getPublisher(): Redis {
  if (!publisher) {
    const url = process.env['REDIS_URL'];
    if (!url) throw new Error('REDIS_URL environment variable is required');
    publisher = createClient(url, 'publisher');
  }
  return publisher;
}

export async function closeRedis(): Promise<void> {
  await Promise.all([
    redis?.quit(),
    subscriber?.quit(),
    publisher?.quit(),
  ]);
  redis = null;
  subscriber = null;
  publisher = null;
}

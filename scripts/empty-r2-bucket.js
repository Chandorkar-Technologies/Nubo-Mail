// Script to empty an R2 bucket using Cloudflare API
// Usage: CLOUDFLARE_API_TOKEN=xxx node scripts/empty-r2-bucket.js threads

const BUCKET_NAME = process.argv[2] || 'threads';
const ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID || '85a95158fd9dec1fad512f90b4ceb1bc';
const API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;

if (!API_TOKEN) {
  console.error('Please set CLOUDFLARE_API_TOKEN environment variable');
  console.log('You can create one at: https://dash.cloudflare.com/profile/api-tokens');
  console.log('Required permissions: Account > R2 > Edit');
  process.exit(1);
}

const BASE_URL = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/r2/buckets/${BUCKET_NAME}/objects`;

async function listObjects(cursor = null) {
  const url = new URL(BASE_URL);
  url.searchParams.set('per_page', '1000');
  if (cursor) {
    url.searchParams.set('cursor', cursor);
  }

  const response = await fetch(url.toString(), {
    headers: {
      'Authorization': `Bearer ${API_TOKEN}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to list objects: ${response.status} ${await response.text()}`);
  }

  return response.json();
}

async function deleteObjects(keys) {
  if (keys.length === 0) return;

  const response = await fetch(BASE_URL, {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${API_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ keys }),
  });

  if (!response.ok) {
    throw new Error(`Failed to delete objects: ${response.status} ${await response.text()}`);
  }

  return response.json();
}

async function emptyBucket() {
  console.log(`Emptying bucket: ${BUCKET_NAME}`);
  let totalDeleted = 0;
  let cursor = null;

  do {
    console.log(`Listing objects... (deleted so far: ${totalDeleted})`);
    const result = await listObjects(cursor);

    if (!result.success) {
      console.error('API error:', result.errors);
      break;
    }

    const objects = result.result?.objects || [];
    if (objects.length === 0) {
      console.log('No more objects to delete');
      break;
    }

    const keys = objects.map(obj => obj.key);
    console.log(`Deleting ${keys.length} objects...`);

    await deleteObjects(keys);
    totalDeleted += keys.length;

    cursor = result.result?.cursor;
  } while (cursor);

  console.log(`Done! Deleted ${totalDeleted} objects from ${BUCKET_NAME}`);
}

emptyBucket().catch(console.error);

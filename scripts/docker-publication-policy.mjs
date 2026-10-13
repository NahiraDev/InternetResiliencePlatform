import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

export function verifyPreviewPublication({ image, sourceSha, tags }) {
  if (!/^[a-f0-9]{40}$/.test(sourceSha ?? '')) {
    throw new Error('An exact full source commit SHA is required.');
  }
  if (!/^ghcr\.io\/[a-z0-9_.-]+\/[a-z0-9_.-]+$/.test(image ?? '')) {
    throw new Error('A lowercase GitHub Container Registry image is required.');
  }
  const published = (tags ?? '')
    .split('\n')
    .map((tag) => tag.trim())
    .filter(Boolean);
  const expected = `${image}:sha-${sourceSha.slice(0, 7)}`;
  if (published.length !== 1 || published[0] !== expected) {
    throw new Error(
      `Only developer-preview tag ${expected} is allowed. ` +
        'Latest promotion is BLOCKED: no trusted, independently verified ' +
        'production-certification/release authority is configured.',
    );
  }
  return {
    publicationClass: 'developer-preview',
    sourceSha,
    tags: published,
    latestPromotion: 'BLOCKED',
    reason: 'CI Release Gate success is not production certification.',
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const policy = verifyPreviewPublication({
      image: process.env.IMAGE,
      sourceSha: process.env.SOURCE_SHA,
      tags: process.env.TAGS,
    });
    console.log(JSON.stringify(policy, null, 2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

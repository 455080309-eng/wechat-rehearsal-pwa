import { describe, expect, test } from 'vitest';

import { getServiceWorkerUrl } from '../src/runtimePaths';

describe('getServiceWorkerUrl', () => {
  test('keeps root deployments on /sw.js', () => {
    expect(getServiceWorkerUrl('/')).toBe('/sw.js');
  });

  test('builds a repo-scoped service worker url for GitHub Pages', () => {
    expect(getServiceWorkerUrl('/wechat-rehearsal-pwa/')).toBe('/wechat-rehearsal-pwa/sw.js');
  });
});

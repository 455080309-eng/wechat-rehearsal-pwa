import React from 'react';
import { render } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';

import {
  getViewportMetrics,
  useViewportCssVars
} from '../src/viewport';

function ViewportProbe() {
  useViewportCssVars();
  return null;
}

function createVisualViewportMock() {
  const listeners = new Map<string, Set<() => void>>();

  return {
    height: 720,
    offsetTop: 0,
    addEventListener(type: string, listener: () => void) {
      const bucket = listeners.get(type) ?? new Set<() => void>();
      bucket.add(listener);
      listeners.set(type, bucket);
    },
    removeEventListener(type: string, listener: () => void) {
      listeners.get(type)?.delete(listener);
    },
    dispatch(type: string) {
      listeners.get(type)?.forEach((listener) => listener());
    }
  };
}

describe('viewport syncing', () => {
  afterEach(() => {
    document.documentElement.style.removeProperty('--app-viewport-height');
    document.documentElement.style.removeProperty('--app-viewport-top');
    document.documentElement.style.removeProperty('--app-viewport-bottom');
    vi.restoreAllMocks();
  });

  test('computes css-friendly viewport metrics from the visible viewport', () => {
    expect(
      getViewportMetrics(
        {
          height: 724.7,
          offsetTop: 36.2
        },
        844
      )
    ).toEqual({
      height: 725,
      offsetTop: 36,
      offsetBottom: 83
    });
  });

  test('updates css variables when the visual viewport changes', () => {
    const viewport = createVisualViewportMock();

    Object.defineProperty(window, 'visualViewport', {
      configurable: true,
      value: viewport
    });

    render(React.createElement(ViewportProbe));

    expect(document.documentElement.style.getPropertyValue('--app-viewport-height')).toBe('720px');
    expect(document.documentElement.style.getPropertyValue('--app-viewport-top')).toBe('0px');

    viewport.height = 688;
    viewport.offsetTop = 44;
    viewport.dispatch('resize');

    expect(document.documentElement.style.getPropertyValue('--app-viewport-height')).toBe('688px');
    expect(document.documentElement.style.getPropertyValue('--app-viewport-top')).toBe('44px');
    expect(document.documentElement.style.getPropertyValue('--app-viewport-bottom')).toBe('36px');
  });
});

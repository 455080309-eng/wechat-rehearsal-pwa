import { useEffect } from 'react';

export interface ViewportSnapshot {
  height: number;
  offsetTop: number;
}

export interface ViewportMetrics {
  height: number;
  offsetTop: number;
  offsetBottom: number;
}

export function getViewportMetrics(
  viewport: ViewportSnapshot | null | undefined,
  layoutHeight: number
): ViewportMetrics {
  const safeLayoutHeight = Math.max(0, Math.round(layoutHeight));
  const height = Math.max(
    0,
    Math.round(viewport?.height ?? safeLayoutHeight)
  );
  const offsetTop = Math.max(0, Math.round(viewport?.offsetTop ?? 0));
  const offsetBottom = Math.max(
    0,
    safeLayoutHeight - height - offsetTop
  );

  return {
    height,
    offsetTop,
    offsetBottom
  };
}

export function syncViewportCssVars(
  root: HTMLElement = document.documentElement
) {
  const metrics = getViewportMetrics(window.visualViewport, window.innerHeight);

  root.style.setProperty('--app-viewport-height', `${metrics.height}px`);
  root.style.setProperty('--app-viewport-top', `${metrics.offsetTop}px`);
  root.style.setProperty('--app-viewport-bottom', `${metrics.offsetBottom}px`);
}

export function useViewportCssVars() {
  useEffect(() => {
    syncViewportCssVars();

    const handleViewportChange = () => {
      syncViewportCssVars();
    };

    const visualViewport = window.visualViewport;
    visualViewport?.addEventListener('resize', handleViewportChange);
    visualViewport?.addEventListener('scroll', handleViewportChange);
    window.addEventListener('resize', handleViewportChange);
    window.addEventListener('orientationchange', handleViewportChange);

    return () => {
      visualViewport?.removeEventListener('resize', handleViewportChange);
      visualViewport?.removeEventListener('scroll', handleViewportChange);
      window.removeEventListener('resize', handleViewportChange);
      window.removeEventListener('orientationchange', handleViewportChange);
    };
  }, []);
}

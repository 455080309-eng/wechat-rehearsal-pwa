import { useEffect } from 'react';

export interface ScrollBounds {
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
}

export function canScrollWithinBounds(
  bounds: ScrollBounds,
  deltaY: number
): boolean {
  const maxScrollTop = Math.max(0, bounds.scrollHeight - bounds.clientHeight);

  if (maxScrollTop === 0) {
    return false;
  }

  if (deltaY > 0 && bounds.scrollTop <= 0) {
    return false;
  }

  if (deltaY < 0 && bounds.scrollTop >= maxScrollTop) {
    return false;
  }

  return true;
}

export function findScrollLockContainer(
  target: EventTarget | null,
  selectors: string[]
): HTMLElement | null {
  const selectorText = selectors.join(',');
  if (!selectorText) {
    return null;
  }

  const baseNode =
    target instanceof Element
      ? target
      : target instanceof Node
        ? target.parentElement
        : null;

  const container = baseNode?.closest(selectorText);
  return container instanceof HTMLElement ? container : null;
}

export function useViewportScrollLock(selectors: string[]) {
  useEffect(() => {
    if (!selectors.length) {
      return;
    }

    let lastTouchY = 0;
    let activeContainer: HTMLElement | null = null;

    const handleTouchStart = (event: TouchEvent) => {
      const touch = event.touches[0];
      if (!touch) {
        return;
      }

      lastTouchY = touch.clientY;
      activeContainer = findScrollLockContainer(event.target, selectors);
    };

    const handleTouchMove = (event: TouchEvent) => {
      const touch = event.touches[0];
      if (!touch) {
        return;
      }

      const deltaY = touch.clientY - lastTouchY;
      lastTouchY = touch.clientY;

      const container =
        activeContainer ?? findScrollLockContainer(event.target, selectors);

      if (
        !container ||
        !canScrollWithinBounds(
          {
            scrollTop: container.scrollTop,
            scrollHeight: container.scrollHeight,
            clientHeight: container.clientHeight
          },
          deltaY
        )
      ) {
        event.preventDefault();
      }
    };

    document.addEventListener('touchstart', handleTouchStart, {
      passive: true,
      capture: true
    });
    document.addEventListener('touchmove', handleTouchMove, {
      passive: false,
      capture: true
    });

    return () => {
      document.removeEventListener('touchstart', handleTouchStart, true);
      document.removeEventListener('touchmove', handleTouchMove, true);
    };
  }, [selectors]);
}

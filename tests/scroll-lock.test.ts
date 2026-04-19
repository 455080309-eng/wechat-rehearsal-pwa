import {
  canScrollWithinBounds,
  findScrollLockContainer
} from '../src/scroll-lock';

describe('scroll lock helpers', () => {
  it('blocks viewport scrolling when the container itself cannot scroll', () => {
    expect(
      canScrollWithinBounds(
        {
          scrollTop: 0,
          scrollHeight: 420,
          clientHeight: 420
        },
        -18
      )
    ).toBe(false);
  });

  it('blocks pulling down when the container is already at the top', () => {
    expect(
      canScrollWithinBounds(
        {
          scrollTop: 0,
          scrollHeight: 900,
          clientHeight: 420
        },
        24
      )
    ).toBe(false);
  });

  it('blocks pushing up when the container is already at the bottom', () => {
    expect(
      canScrollWithinBounds(
        {
          scrollTop: 480,
          scrollHeight: 900,
          clientHeight: 420
        },
        -24
      )
    ).toBe(false);
  });

  it('allows vertical scrolling when the gesture stays inside the container range', () => {
    expect(
      canScrollWithinBounds(
        {
          scrollTop: 240,
          scrollHeight: 900,
          clientHeight: 420
        },
        -24
      )
    ).toBe(true);
  });

  it('finds the nearest allowed scroll container from nested elements', () => {
    document.body.innerHTML = `
      <div class="chat-list">
        <div class="chat-row">
          <button class="chat-bubble">
            <span class="chat-bubble__text">你好</span>
          </button>
        </div>
      </div>
    `;

    const textNode = document.querySelector('.chat-bubble__text')?.firstChild ?? null;

    expect(findScrollLockContainer(textNode, ['.chat-list'])).toBe(
      document.querySelector('.chat-list')
    );
  });
});

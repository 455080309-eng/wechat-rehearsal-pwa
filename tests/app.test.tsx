import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import App, { Composer, EditorPanel } from '../src/App';
import {
  type ScriptRecord,
  buildTurnsFromMessages,
  createDefaultScript,
  resetAppDatabase,
  saveAssets,
  saveScript,
  saveSelectedScriptId
} from '../src/core';

describe('UI flows', () => {
  beforeEach(async () => {
    await resetAppDatabase();
  });

  afterEach(async () => {
    await resetAppDatabase();
  });

  it('submits on Enter but not on Shift+Enter', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);

    render(
      <Composer
        ariaLabel="测试输入框"
        placeholder="输入内容"
        onSubmit={onSubmit}
      />
    );

    const textarea = screen.getByLabelText('测试输入框');
    await user.type(textarea, '第一句');
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: true });
    expect(onSubmit).not.toHaveBeenCalled();

    fireEvent.keyDown(textarea, { key: 'Enter' });
    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({ text: '第一句', file: null })
    );
  });

  it('supports editing, undo, and delete confirmation', async () => {
    const user = userEvent.setup();
    const onComplete = vi.fn().mockResolvedValue(undefined);

    render(
      <EditorPanel
        assetUrls={{}}
        script={createDefaultScript('编辑器测试')}
        onClose={vi.fn()}
        onComplete={onComplete}
      />
    );

    const completeButton = screen.getByRole('button', { name: '完成' });
    expect(completeButton).toBeDisabled();

    await user.type(screen.getByLabelText('录入对话输入框'), '你好');
    await user.click(screen.getByRole('button', { name: '发送' }));
    await user.click(screen.getByRole('button', { name: '🤖 对方' }));
    await user.type(screen.getByLabelText('录入对话输入框'), '你好呀');
    await user.click(screen.getByRole('button', { name: '发送' }));

    expect(screen.getByText('1 轮')).toBeInTheDocument();
    expect(completeButton).toBeEnabled();

    await user.click(screen.getByRole('button', { name: '你好呀' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '取消' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '↩️ 撤销' }));
    expect(completeButton).toBeDisabled();
  });

  it('opens the drawer, saves a script, and shows a mismatch toast', async () => {
    const user = userEvent.setup();
    render(<App />);

    await screen.findByText('默认剧本');
    expect(screen.queryByText('排练模式')).not.toBeInTheDocument();
    await user.click(screen.getByLabelText('打开剧本列表'));
    expect(screen.getByLabelText('剧本抽屉')).toBeInTheDocument();
    expect(screen.getByText('当前使用')).toBeInTheDocument();

    await user.click(screen.getByLabelText('打开录入对话面板'));
    const editor = screen.getByLabelText('录入对话');
    await user.type(within(editor).getByLabelText('录入对话输入框'), '你好');
    await user.click(within(editor).getByRole('button', { name: '发送' }));
    await user.click(screen.getByRole('button', { name: '🤖 对方' }));
    await user.type(within(editor).getByLabelText('录入对话输入框'), '你好呀');
    await user.click(within(editor).getByRole('button', { name: '发送' }));
    await user.click(screen.getByRole('button', { name: '完成' }));

    await waitFor(() =>
      expect(screen.getByText('剧本已保存。')).toBeInTheDocument()
    );

    await user.type(screen.getByLabelText('排练输入框'), '说错了{enter}');
    await waitFor(() =>
      expect(screen.getByText('台词不对，重新来过')).toBeInTheDocument()
    );
  });

  it('lets the user set a custom script name when creating a script', async () => {
    const user = userEvent.setup();
    render(<App />);

    await screen.findByText('默认剧本');
    await user.click(screen.getByLabelText('打开剧本列表'));
    await user.click(screen.getByRole('button', { name: '新建' }));

    const dialog = screen.getByRole('dialog');
    const input = within(dialog).getByLabelText('剧本名字');
    await user.clear(input);
    await user.type(input, '销售演练话术');
    await user.click(within(dialog).getByRole('button', { name: '创建' }));

    await waitFor(() =>
      expect(screen.getAllByText('销售演练话术')[0]).toBeInTheDocument()
    );
  });

  it('opens the lightbox when tapping an image bubble', async () => {
    const createdAt = '2026-04-18T10:00:00.000Z';
    const asset = {
      id: 'asset-1',
      hash: 'asset-1-hash',
      mimeType: 'image/png',
      blob: new File(['fake'], 'demo.png', { type: 'image/png' }),
      width: 1,
      height: 1,
      createdAt
    };
    const script: ScriptRecord = {
      ...createDefaultScript('图片剧本'),
      id: 'script-1',
      name: '图片剧本',
      createdAt,
      updatedAt: createdAt,
      messages: [
        { id: 'm1', role: 'me', text: '看图', createdAt },
        {
          id: 'o1',
          role: 'other',
          text: '',
          assetId: asset.id,
          assetHash: asset.hash,
          createdAt
        }
      ],
      turns: buildTurnsFromMessages([
        { id: 'm1', role: 'me' as const },
        { id: 'o1', role: 'other' as const }
      ])
    };

    await saveAssets([asset]);
    await saveScript(script);
    await saveSelectedScriptId(script.id);

    const user = userEvent.setup();
    render(<App />);

    await screen.findByText('图片剧本');
    await user.type(screen.getByLabelText('排练输入框'), '看图{enter}');

    expect(screen.getByText('思考中')).toBeInTheDocument();
    const image = await screen.findByAltText('消息图片', undefined, {
      timeout: 2500
    });
    expect(image.closest('.chat-bubble')).toHaveClass('chat-bubble--media-only');
    await user.click(image);
    expect(screen.getByAltText('大图预览')).toBeInTheDocument();
  });

  it('auto scrolls the rehearsal timeline when new messages appear', async () => {
    const originalScrollIntoView = window.HTMLElement.prototype.scrollIntoView;
    const scrollIntoView = vi.fn();
    Object.defineProperty(window.HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: scrollIntoView
    });

    const createdAt = '2026-04-18T12:00:00.000Z';
    const script: ScriptRecord = {
      ...createDefaultScript('滚动剧本'),
      id: 'scroll-script',
      name: '滚动剧本',
      createdAt,
      updatedAt: createdAt,
      messages: [
        { id: 'm1', role: 'me', text: '你好', createdAt },
        { id: 'o1', role: 'other', text: '你好呀', createdAt }
      ],
      turns: buildTurnsFromMessages([
        { id: 'm1', role: 'me' as const },
        { id: 'o1', role: 'other' as const }
      ])
    };

    await saveScript(script);
    await saveSelectedScriptId(script.id);

    const user = userEvent.setup();
    render(<App />);

    await screen.findByText('滚动剧本');
    await user.type(screen.getByLabelText('排练输入框'), '你好{enter}');

    await waitFor(() => expect(scrollIntoView).toHaveBeenCalled());

    Object.defineProperty(window.HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: originalScrollIntoView
    });
  });

  it('shows a lightweight thinking state before the scripted reply appears', async () => {
    const createdAt = '2026-04-19T09:00:00.000Z';
    const script: ScriptRecord = {
      ...createDefaultScript('思考剧本'),
      id: 'thinking-script',
      name: '思考剧本',
      createdAt,
      updatedAt: createdAt,
      messages: [
        { id: 'm1', role: 'me', text: '你好', createdAt },
        { id: 'o1', role: 'other', text: '你好呀', createdAt }
      ],
      turns: buildTurnsFromMessages([
        { id: 'm1', role: 'me' as const },
        { id: 'o1', role: 'other' as const }
      ])
    };

    await saveScript(script);
    await saveSelectedScriptId(script.id);

    const user = userEvent.setup();
    render(<App />);

    await screen.findByText('思考剧本');
    await user.type(screen.getByLabelText('排练输入框'), '你好{enter}');

    expect(screen.getByText('思考中')).toBeInTheDocument();
    expect(screen.queryByText('你好呀')).not.toBeInTheDocument();

    await waitFor(() => expect(screen.getByText('你好呀')).toBeInTheDocument(), {
      timeout: 2000
    });
    expect(screen.queryByText('思考中')).not.toBeInTheDocument();
  });

  it('does not show a completion toast when the rehearsal finishes', async () => {
    const createdAt = '2026-04-19T10:00:00.000Z';
    const script: ScriptRecord = {
      ...createDefaultScript('完成剧本'),
      id: 'completed-script',
      name: '完成剧本',
      createdAt,
      updatedAt: createdAt,
      messages: [
        { id: 'm1', role: 'me', text: '你好', createdAt },
        { id: 'o1', role: 'other', text: '你好呀', createdAt }
      ],
      turns: buildTurnsFromMessages([
        { id: 'm1', role: 'me' as const },
        { id: 'o1', role: 'other' as const }
      ])
    };

    await saveScript(script);
    await saveSelectedScriptId(script.id);

    const user = userEvent.setup();
    render(<App />);

    await screen.findByText('完成剧本');
    await user.type(screen.getByLabelText('排练输入框'), '你好{enter}');

    await waitFor(() => expect(screen.getByText('你好呀')).toBeInTheDocument(), {
      timeout: 2000
    });
    expect(screen.queryByText('剧本已排练完毕！')).not.toBeInTheDocument();
  });
});

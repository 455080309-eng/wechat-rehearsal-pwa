import {
  type ScriptRecord,
  applyRehearsalAttempt,
  buildTurnsFromMessages,
  canDeleteScript,
  createDefaultScript,
  createInitialRehearsalState,
  resetTurnAttempts,
  validateConversationFlow
} from '../src/core';

describe('core helpers', () => {
  it('groups flat messages into turns', () => {
    const turns = buildTurnsFromMessages([
      { id: 'm1', role: 'me' as const },
      { id: 'm2', role: 'me' as const },
      { id: 'o1', role: 'other' as const },
      { id: 'm3', role: 'me' as const },
      { id: 'o2', role: 'other' as const },
      { id: 'o3', role: 'other' as const }
    ]);

    expect(turns).toHaveLength(2);
    expect(turns[0].meMessageIds).toEqual(['m1', 'm2']);
    expect(turns[0].otherMessageIds).toEqual(['o1']);
    expect(turns[1].meMessageIds).toEqual(['m3']);
    expect(turns[1].otherMessageIds).toEqual(['o2', 'o3']);
  });

  it('rejects invalid message ordering', () => {
    expect(validateConversationFlow([{ role: 'other' as const }])).toBe(
      '剧本必须以“我说”开始。'
    );

    expect(
      validateConversationFlow([
        { role: 'me' as const },
        { role: 'me' as const }
      ])
    ).toBe('剧本必须以“对方”结束。');
  });

  it('matches strictly and resets the current turn on mismatch', () => {
    const createdAt = '2026-04-18T10:00:00.000Z';
    const script: ScriptRecord = {
      ...createDefaultScript('严格匹配'),
      messages: [
        { id: 'm1', role: 'me', text: '第一句', createdAt },
        {
          id: 'm2',
          role: 'me',
          text: '第二句',
          assetHash: 'asset-hash',
          createdAt
        },
        { id: 'o1', role: 'other', text: '收到', createdAt }
      ],
      turns: buildTurnsFromMessages([
        { id: 'm1', role: 'me' as const },
        { id: 'm2', role: 'me' as const },
        { id: 'o1', role: 'other' as const }
      ])
    };

    const initial = createInitialRehearsalState(script.id);
    const firstAttempt = applyRehearsalAttempt(initial, script, {
      id: 'attempt-1',
      role: 'me',
      text: '第一句',
      createdAt
    });

    expect(firstAttempt.kind).toBe('progress');
    expect(firstAttempt.nextState.meIndex).toBe(1);

    const mismatch = applyRehearsalAttempt(firstAttempt.nextState, script, {
      id: 'attempt-2',
      role: 'me',
      text: '第二句',
      assetHash: 'wrong-hash',
      createdAt
    });

    expect(mismatch.kind).toBe('mismatch');
    expect(mismatch.nextState.timeline).toHaveLength(2);

    const reset = resetTurnAttempts(mismatch.nextState, 0);
    expect(reset.meIndex).toBe(0);
    expect(reset.timeline).toHaveLength(0);
  });

  it('keeps at least one script undeletable', () => {
    expect(canDeleteScript([createDefaultScript()])).toBe(false);
    expect(
      canDeleteScript([createDefaultScript(), createDefaultScript('第二个剧本')])
    ).toBe(true);
  });
});

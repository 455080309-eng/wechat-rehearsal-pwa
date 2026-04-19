export type Role = 'me' | 'other';
export type RehearsalStatus = 'idle' | 'running' | 'completed';

export interface AssetRecord {
  id: string;
  hash: string;
  mimeType: string;
  blob: Blob;
  width: number;
  height: number;
  createdAt: string;
}

export interface ScriptMessage {
  id: string;
  role: Role;
  text: string;
  assetId?: string;
  assetHash?: string;
  createdAt: string;
}

export interface DraftMessage extends ScriptMessage {
  file?: File;
  previewUrl?: string;
}

export interface ScriptTurn {
  id: string;
  meMessageIds: string[];
  otherMessageIds: string[];
}

export interface ScriptRecord {
  id: string;
  name: string;
  messages: ScriptMessage[];
  turns: ScriptTurn[];
  createdAt: string;
  updatedAt: string;
}

export interface RuntimeMessage extends ScriptMessage {
  origin: 'script' | 'attempt';
  turnIndex: number;
  previewUrl?: string;
}

export interface RehearsalState {
  scriptId: string;
  turnIndex: number;
  meIndex: number;
  displayedMessageIds: string[];
  attemptMessageIds: string[];
  status: RehearsalStatus;
  timeline: RuntimeMessage[];
}

interface SettingRecord {
  key: string;
  value: string;
}

const DB_NAME = 'wechat-rehearsal-db';
const DB_VERSION = 1;
const SCRIPT_STORE = 'scripts';
const ASSET_STORE = 'assets';
const SETTINGS_STORE = 'settings';
const SELECTED_SCRIPT_KEY = 'selectedScriptId';

export function createId(prefix: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  return `${prefix}-${Math.random().toString(16).slice(2)}-${Date.now()}`;
}

export function createDefaultScript(name = '默认剧本'): ScriptRecord {
  const timestamp = new Date().toISOString();
  return {
    id: createId('script'),
    name,
    messages: [],
    turns: [],
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

export function getTurnCount(messages: Array<Pick<ScriptMessage, 'role'>>): number {
  let index = 0;
  let count = 0;

  while (index < messages.length) {
    if (messages[index].role !== 'me') {
      return count;
    }

    while (index < messages.length && messages[index].role === 'me') {
      index += 1;
    }

    if (index >= messages.length || messages[index].role !== 'other') {
      return count;
    }

    while (index < messages.length && messages[index].role === 'other') {
      index += 1;
    }

    count += 1;
  }

  return count;
}

export function validateConversationFlow(
  messages: Array<Pick<ScriptMessage, 'role'>>
): string | null {
  if (messages.length === 0) {
    return '至少录入一轮“我说 → 对方”。';
  }

  if (messages[0].role !== 'me') {
    return '剧本必须以“我说”开始。';
  }

  if (messages[messages.length - 1].role !== 'other') {
    return '剧本必须以“对方”结束。';
  }

  let index = 0;
  while (index < messages.length) {
    if (messages[index].role !== 'me') {
      return '角色块必须按“我说 → 对方”交替。';
    }

    while (index < messages.length && messages[index].role === 'me') {
      index += 1;
    }

    if (index >= messages.length || messages[index].role !== 'other') {
      return '每一轮都需要包含“对方”的回复。';
    }

    while (index < messages.length && messages[index].role === 'other') {
      index += 1;
    }
  }

  return null;
}

export function buildTurnsFromMessages(
  messages: Array<Pick<ScriptMessage, 'id' | 'role'>>
): ScriptTurn[] {
  const validationError = validateConversationFlow(messages);
  if (validationError) {
    throw new Error(validationError);
  }

  const turns: ScriptTurn[] = [];
  let index = 0;

  while (index < messages.length) {
    const meMessageIds: string[] = [];
    const otherMessageIds: string[] = [];

    while (index < messages.length && messages[index].role === 'me') {
      meMessageIds.push(messages[index].id);
      index += 1;
    }

    while (index < messages.length && messages[index].role === 'other') {
      otherMessageIds.push(messages[index].id);
      index += 1;
    }

    turns.push({
      id: createId('turn'),
      meMessageIds,
      otherMessageIds
    });
  }

  return turns;
}

export function canDeleteScript(scripts: ScriptRecord[]): boolean {
  return scripts.length > 1;
}

export function sortScripts(scripts: ScriptRecord[]): ScriptRecord[] {
  return [...scripts].sort((left, right) =>
    right.updatedAt.localeCompare(left.updatedAt)
  );
}

export function upsertScript(
  scripts: ScriptRecord[],
  nextScript: ScriptRecord
): ScriptRecord[] {
  return sortScripts([
    nextScript,
    ...scripts.filter((script) => script.id !== nextScript.id)
  ]);
}

export function matchesExpectedMessage(
  expected: Pick<ScriptMessage, 'text' | 'assetHash'>,
  attempt: Pick<ScriptMessage, 'text' | 'assetHash'>
): boolean {
  return (
    expected.text === attempt.text &&
    (expected.assetHash ?? '') === (attempt.assetHash ?? '')
  );
}

export function createInitialRehearsalState(scriptId: string): RehearsalState {
  return {
    scriptId,
    turnIndex: 0,
    meIndex: 0,
    displayedMessageIds: [],
    attemptMessageIds: [],
    status: 'idle',
    timeline: []
  };
}

export function getAttemptPreviewUrlsForTurn(
  state: RehearsalState,
  turnIndex: number
): string[] {
  return state.timeline
    .filter(
      (message) =>
        message.origin === 'attempt' &&
        message.turnIndex === turnIndex &&
        Boolean(message.previewUrl)
    )
    .map((message) => message.previewUrl as string);
}

export function resetTurnAttempts(
  state: RehearsalState,
  turnIndex: number
): RehearsalState {
  const removedIds = new Set(
    state.timeline
      .filter(
        (message) =>
          message.origin === 'attempt' && message.turnIndex === turnIndex
      )
      .map((message) => message.id)
  );

  const remainingTimeline = state.timeline.filter(
    (message) => !removedIds.has(message.id)
  );

  return {
    ...state,
    meIndex: 0,
    displayedMessageIds: state.displayedMessageIds.filter(
      (id) => !removedIds.has(id)
    ),
    attemptMessageIds: state.attemptMessageIds.filter(
      (id) => !removedIds.has(id)
    ),
    status: remainingTimeline.length === 0 ? 'idle' : state.status,
    timeline: remainingTimeline
  };
}

export type AttemptResultKind =
  | 'progress'
  | 'turn-complete'
  | 'mismatch'
  | 'completed';

export interface AttemptResult {
  kind: AttemptResultKind;
  nextState: RehearsalState;
}

export function applyRehearsalAttempt(
  state: RehearsalState,
  script: ScriptRecord,
  attempt: ScriptMessage & { previewUrl?: string }
): AttemptResult {
  if (!script.turns.length || state.status === 'completed') {
    return { kind: 'progress', nextState: state };
  }

  const turn = script.turns[state.turnIndex];
  const messageMap = new Map(script.messages.map((message) => [message.id, message]));
  const expectedId = turn?.meMessageIds[state.meIndex];
  const expected = expectedId ? messageMap.get(expectedId) : undefined;

  if (!turn || !expected) {
    return {
      kind: 'completed',
      nextState: { ...state, status: 'completed' }
    };
  }

  const runtimeAttempt: RuntimeMessage = {
    ...attempt,
    role: 'me',
    origin: 'attempt',
    turnIndex: state.turnIndex
  };

  const nextState: RehearsalState = {
    ...state,
    status: 'running',
    timeline: [...state.timeline, runtimeAttempt],
    displayedMessageIds: [...state.displayedMessageIds, runtimeAttempt.id],
    attemptMessageIds: [...state.attemptMessageIds, runtimeAttempt.id]
  };

  if (!matchesExpectedMessage(expected, attempt)) {
    return {
      kind: 'mismatch',
      nextState
    };
  }

  if (state.meIndex < turn.meMessageIds.length - 1) {
    return {
      kind: 'progress',
      nextState: {
        ...nextState,
        meIndex: state.meIndex + 1
      }
    };
  }

  const otherMessages = turn.otherMessageIds
    .map((id) => messageMap.get(id))
    .filter((message): message is ScriptMessage => Boolean(message))
    .map<RuntimeMessage>((message) => ({
      ...message,
      origin: 'script',
      turnIndex: state.turnIndex
    }));

  const stateWithOtherMessages: RehearsalState = {
    ...nextState,
    timeline: [...nextState.timeline, ...otherMessages],
    displayedMessageIds: [
      ...nextState.displayedMessageIds,
      ...otherMessages.map((message) => message.id)
    ]
  };

  if (state.turnIndex >= script.turns.length - 1) {
    return {
      kind: 'completed',
      nextState: {
        ...stateWithOtherMessages,
        status: 'completed'
      }
    };
  }

  return {
    kind: 'turn-complete',
    nextState: {
      ...stateWithOtherMessages,
      turnIndex: state.turnIndex + 1,
      meIndex: 0
    }
  };
}

export async function hashBlob(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(hashBuffer))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

export async function getImageDimensions(
  blob: Blob
): Promise<{ width: number; height: number }> {
  const previewUrl = URL.createObjectURL(blob);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const nextImage = new Image();
      nextImage.onload = () => resolve(nextImage);
      nextImage.onerror = () => reject(new Error('Failed to load image'));
      nextImage.src = previewUrl;
    });

    return {
      width: image.naturalWidth,
      height: image.naturalHeight
    };
  } catch {
    return { width: 0, height: 0 };
  } finally {
    URL.revokeObjectURL(previewUrl);
  }
}

export async function fileToAsset(file: File): Promise<AssetRecord> {
  const hash = await hashBlob(file);
  const dimensions = await getImageDimensions(file);

  return {
    id: createId('asset'),
    hash,
    mimeType: file.type || 'image/*',
    blob: file,
    width: dimensions.width,
    height: dimensions.height,
    createdAt: new Date().toISOString()
  };
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const database = request.result;

      if (!database.objectStoreNames.contains(SCRIPT_STORE)) {
        database.createObjectStore(SCRIPT_STORE, { keyPath: 'id' });
      }

      if (!database.objectStoreNames.contains(ASSET_STORE)) {
        database.createObjectStore(ASSET_STORE, { keyPath: 'id' });
      }

      if (!database.objectStoreNames.contains(SETTINGS_STORE)) {
        database.createObjectStore(SETTINGS_STORE, { keyPath: 'key' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function loadSnapshot(): Promise<{
  scripts: ScriptRecord[];
  assets: Record<string, AssetRecord>;
  selectedScriptId: string | null;
}> {
  const database = await openDatabase();

  try {
    const transaction = database.transaction(
      [SCRIPT_STORE, ASSET_STORE, SETTINGS_STORE],
      'readonly'
    );

    const scriptsRequest = transaction.objectStore(SCRIPT_STORE).getAll();
    const assetsRequest = transaction.objectStore(ASSET_STORE).getAll();
    const settingsRequest = transaction
      .objectStore(SETTINGS_STORE)
      .get(SELECTED_SCRIPT_KEY);

    const [scripts, assets, selectedScript] = await Promise.all([
      requestToPromise(scriptsRequest),
      requestToPromise(assetsRequest),
      requestToPromise(settingsRequest)
    ]);

    return {
      scripts: sortScripts(scripts as ScriptRecord[]),
      assets: Object.fromEntries(
        (assets as AssetRecord[]).map((asset) => [asset.id, asset])
      ),
      selectedScriptId: (selectedScript as SettingRecord | undefined)?.value ?? null
    };
  } finally {
    database.close();
  }
}

export async function saveScript(script: ScriptRecord): Promise<void> {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(SCRIPT_STORE, 'readwrite');
    await requestToPromise(transaction.objectStore(SCRIPT_STORE).put(script));
  } finally {
    database.close();
  }
}

export async function saveAssets(assets: AssetRecord[]): Promise<void> {
  if (!assets.length) {
    return;
  }

  const database = await openDatabase();
  try {
    const transaction = database.transaction(ASSET_STORE, 'readwrite');
    const store = transaction.objectStore(ASSET_STORE);
    await Promise.all(assets.map((asset) => requestToPromise(store.put(asset))));
  } finally {
    database.close();
  }
}

export async function deleteScriptRecord(scriptId: string): Promise<void> {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(SCRIPT_STORE, 'readwrite');
    await requestToPromise(transaction.objectStore(SCRIPT_STORE).delete(scriptId));
  } finally {
    database.close();
  }
}

export async function saveSelectedScriptId(scriptId: string): Promise<void> {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(SETTINGS_STORE, 'readwrite');
    await requestToPromise(
      transaction.objectStore(SETTINGS_STORE).put({
        key: SELECTED_SCRIPT_KEY,
        value: scriptId
      } satisfies SettingRecord)
    );
  } finally {
    database.close();
  }
}

export async function resetAppDatabase(): Promise<void> {
  await new Promise<void>((resolve) => {
    const request = indexedDB.deleteDatabase(DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => resolve();
    request.onblocked = () => resolve();
  });
}

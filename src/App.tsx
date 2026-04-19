import {
  type AssetRecord,
  type DraftMessage,
  type RehearsalState,
  type Role,
  type RuntimeMessage,
  type ScriptMessage,
  type ScriptRecord,
  applyRehearsalAttempt,
  buildTurnsFromMessages,
  canDeleteScript,
  createDefaultScript,
  createId,
  createInitialRehearsalState,
  deleteScriptRecord,
  fileToAsset,
  getAttemptPreviewUrlsForTurn,
  getTurnCount,
  hashBlob,
  loadSnapshot,
  resetTurnAttempts,
  saveAssets,
  saveScript,
  saveSelectedScriptId,
  sortScripts,
  upsertScript,
  validateConversationFlow
} from './core';

import {
  type KeyboardEvent,
  type RefObject,
  type ReactNode,
  useEffect,
  useRef,
  useState
} from 'react';

import { useViewportScrollLock } from './scroll-lock';
import { useViewportCssVars } from './viewport';

interface ComposerPayload {
  text: string;
  file: File | null;
}

interface ToastState {
  id: number;
  message: string;
}

interface ScriptNameDialogProps {
  open: boolean;
  initialValue: string;
  onCancel: () => void;
  onConfirm: (name: string) => void;
}

interface ChatBubbleProps {
  message: Pick<ScriptMessage, 'role' | 'text'> & {
    previewUrl?: string;
    assetId?: string;
  };
  imageSrc?: string;
  onBubbleClick?: () => void;
  onImageClick?: () => void;
}

interface ComposerProps {
  placeholder: string;
  ariaLabel: string;
  disabled?: boolean;
  sendLabel?: string;
  onSubmit: (payload: ComposerPayload) => Promise<void> | void;
}

interface ScriptDrawerProps {
  open: boolean;
  scripts: ScriptRecord[];
  selectedScriptId: string;
  onClose: () => void;
  onSelect: (scriptId: string) => void;
  onCreate: () => void;
  onDelete: (scriptId: string) => void;
}

interface EditorPanelProps {
  script: ScriptRecord;
  assetUrls: Record<string, string>;
  onClose: () => void;
  onComplete: (messages: DraftMessage[]) => Promise<void>;
}

const THINKING_DELAY_MS = 1200;
const REPLY_STAGGER_MS = 260;

function useAutoResizeTextArea(
  ref: RefObject<HTMLTextAreaElement>,
  value: string
) {
  useEffect(() => {
    if (!ref.current) {
      return;
    }

    ref.current.style.height = '0px';
    ref.current.style.height = `${Math.min(ref.current.scrollHeight, 120)}px`;
  }, [ref, value]);
}

function useAssetUrls(assets: Record<string, AssetRecord>) {
  const [assetUrls, setAssetUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    const nextUrls: Record<string, string> = {};
    for (const asset of Object.values(assets)) {
      nextUrls[asset.id] = URL.createObjectURL(asset.blob);
    }

    setAssetUrls(nextUrls);

    return () => {
      Object.values(nextUrls).forEach((url) => URL.revokeObjectURL(url));
    };
  }, [assets]);

  return assetUrls;
}

function useAutoScrollToBottom(
  ref: RefObject<HTMLDivElement>,
  triggerKey: string
) {
  useEffect(() => {
    if (!triggerKey) {
      return;
    }

    const frameId = window.requestAnimationFrame(() => {
      const target = ref.current;
      if (typeof target?.scrollIntoView === 'function') {
        target.scrollIntoView({
          block: 'end',
          behavior: 'smooth'
        });
      }
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [ref, triggerKey]);
}

function ChatBubble({
  message,
  imageSrc,
  onBubbleClick,
  onImageClick
}: ChatBubbleProps) {
  const hasImage = Boolean(imageSrc);
  const hasText = Boolean(message.text.trim());
  const bubbleClassName = [
    'chat-bubble',
    message.role === 'me' ? 'chat-bubble--me' : 'chat-bubble--other',
    onBubbleClick ? 'chat-bubble--interactive' : '',
    hasImage ? 'chat-bubble--media' : '',
    hasImage && !hasText ? 'chat-bubble--media-only' : ''
  ].join(' ');

  const content = (
    <>
      {imageSrc ? (
        <img
          alt="消息图片"
          className="chat-bubble__image"
          src={imageSrc}
          onClick={(event) => {
            event.stopPropagation();
            onImageClick?.();
          }}
        />
      ) : null}
      {message.text ? <div className="chat-bubble__text">{message.text}</div> : null}
    </>
  );

  return (
    <div
      className={`chat-row ${message.role === 'me' ? 'chat-row--me' : 'chat-row--other'}`}
    >
      {onBubbleClick ? (
        <button
          className={bubbleClassName}
          type="button"
          onClick={onBubbleClick}
        >
          {content}
        </button>
      ) : (
        <div className={bubbleClassName}>{content}</div>
      )}
    </div>
  );
}

function ThinkingIndicator() {
  return (
    <div
      className="thinking-row"
      role="status"
      aria-live="polite"
      aria-label="思考中"
    >
      <span className="thinking-row__label">思考中</span>
      <span className="thinking-row__dots" aria-hidden="true">
        <span>.</span>
        <span>.</span>
        <span>.</span>
      </span>
    </div>
  );
}

function getPendingReplyMessages(
  previousState: RehearsalState,
  nextState: RehearsalState,
  turnIndex: number
) {
  const previousMessageIds = new Set(previousState.timeline.map((message) => message.id));

  return nextState.timeline.filter(
    (message) =>
      message.origin === 'script' &&
      message.turnIndex === turnIndex &&
      !previousMessageIds.has(message.id)
  );
}

function removeMessagesFromRehearsal(
  state: RehearsalState,
  messageIds: string[],
  status: RehearsalState['status']
): RehearsalState {
  if (!messageIds.length) {
    return {
      ...state,
      status
    };
  }

  const messageIdSet = new Set(messageIds);

  return {
    ...state,
    status,
    timeline: state.timeline.filter((message) => !messageIdSet.has(message.id)),
    displayedMessageIds: state.displayedMessageIds.filter((id) => !messageIdSet.has(id))
  };
}

function appendReplyMessage(
  state: RehearsalState,
  message: RuntimeMessage,
  status: RehearsalState['status']
): RehearsalState {
  return {
    ...state,
    status,
    timeline: [...state.timeline, message],
    displayedMessageIds: [...state.displayedMessageIds, message.id]
  };
}

function MenuIcon() {
  return (
    <svg aria-hidden="true" className="composer-icon" viewBox="0 0 24 24">
      <path
        d="M5 7.5h14M5 12h14M5 16.5h14"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.9"
      />
    </svg>
  );
}

function PencilIcon() {
  return (
    <svg aria-hidden="true" className="composer-icon" viewBox="0 0 24 24">
      <path
        d="m14.5 5.5 4 4M6 18l3.3-.6L18 8.7a1.4 1.4 0 0 0 0-2l-.7-.7a1.4 1.4 0 0 0-2 0l-8.7 8.7L6 18Z"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.9"
      />
    </svg>
  );
}

function CameraIcon() {
  return (
    <svg aria-hidden="true" className="composer-icon" viewBox="0 0 24 24">
      <path
        d="M7.5 6.5 9 4.8c.32-.37.78-.58 1.27-.58h3.46c.49 0 .95.21 1.27.58l1.5 1.7H18A3.5 3.5 0 0 1 21.5 10v6A3.5 3.5 0 0 1 18 19.5H6A3.5 3.5 0 0 1 2.5 16v-6A3.5 3.5 0 0 1 6 6.5h1.5Z"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
      <circle
        cx="12"
        cy="13"
        r="3.6"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      />
    </svg>
  );
}

function SendVoiceIcon({ active }: { active: boolean }) {
  if (active) {
    return (
      <svg aria-hidden="true" className="composer-icon" viewBox="0 0 24 24">
        <path
          d="M4.5 11.5 19 4.8c.76-.35 1.55.43 1.2 1.2l-6.7 14.5c-.36.77-1.48.66-1.69-.16l-1.36-5.18-5.18-1.36c-.82-.21-.93-1.33-.16-1.69Z"
          fill="none"
          stroke="currentColor"
          strokeLinejoin="round"
          strokeWidth="2"
        />
        <path
          d="m10.44 15.16 3.46-3.46"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeWidth="2"
        />
      </svg>
    );
  }

  return (
    <svg aria-hidden="true" className="composer-icon" viewBox="0 0 24 24">
      <circle
        cx="12"
        cy="12"
        r="9"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path
        d="M9.7 9.6a3.2 3.2 0 0 0 0 4.8M14.3 9.6a3.2 3.2 0 0 1 0 4.8"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="2"
      />
      <circle cx="12" cy="12" r="1.3" fill="currentColor" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg aria-hidden="true" className="composer-icon" viewBox="0 0 24 24">
      <path
        d="M12 5.5v13M5.5 12h13"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="2"
      />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg aria-hidden="true" className="composer-icon" viewBox="0 0 24 24">
      <path
        d="M9.5 4.75h5M5.75 7.5h12.5M9 10.5v6M15 10.5v6M7.5 7.5l.7 10.08c.06.88.8 1.57 1.68 1.57h4.3c.88 0 1.62-.69 1.68-1.57l.7-10.08"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.9"
      />
    </svg>
  );
}

function UndoIcon() {
  return (
    <svg aria-hidden="true" className="composer-icon" viewBox="0 0 24 24">
      <path
        d="M9 8 4.75 12 9 16M5 12h7.5a5.5 5.5 0 1 1 0 11"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.9"
      />
    </svg>
  );
}

export function Composer({
  placeholder,
  ariaLabel,
  disabled = false,
  sendLabel = '发送',
  onSubmit
}: ComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  useAutoResizeTextArea(textareaRef, text);

  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  const hasContent = text.trim() !== '' || Boolean(file);
  const isDisabled = disabled || isSubmitting || !hasContent;

  const replaceSelectedFile = (nextFile: File | null) => {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }

    setFile(nextFile);
    setPreviewUrl(nextFile ? URL.createObjectURL(nextFile) : null);
  };

  const handleSubmit = async () => {
    if (isDisabled) {
      return;
    }

    const currentText = text;
    const currentFile = file;

    try {
      setIsSubmitting(true);
      await onSubmit({
        text: currentText,
        file: currentFile
      });
      replaceSelectedFile(null);
      setText('');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void handleSubmit();
    }
  };

  return (
    <div className="composer">
      {previewUrl ? (
        <div className="composer__preview">
          <img alt="待发送图片预览" src={previewUrl} />
          <button
            aria-label="移除待发送图片"
            className="ghost-button"
            type="button"
            onClick={() => replaceSelectedFile(null)}
          >
            移除
          </button>
        </div>
      ) : null}
      <div className="composer__bar">
        <button
          aria-label="选择图片"
          className="composer__camera-button"
          disabled={disabled}
          type="button"
          onClick={() => fileInputRef.current?.click()}
        >
          <CameraIcon />
        </button>
        <textarea
          ref={textareaRef}
          aria-label={ariaLabel}
          className="composer__textarea"
          disabled={disabled}
          placeholder={placeholder}
          rows={1}
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={handleKeyDown}
        />
        <div className="composer__actions">
          <button
            aria-label={sendLabel}
            className={`composer__circle-button ${
              hasContent ? 'composer__circle-button--active' : ''
            }`}
            disabled={isDisabled}
            type="button"
            onClick={() => void handleSubmit()}
          >
            <SendVoiceIcon active={hasContent} />
          </button>
          <input
            ref={fileInputRef}
            accept="image/*"
            className="visually-hidden"
            type="file"
            onChange={(event) => {
              const nextFile = event.target.files?.[0] ?? null;
              replaceSelectedFile(nextFile);
              event.target.value = '';
            }}
          />
          <button
            aria-label="添加图片"
            className="composer__circle-button"
            disabled={disabled}
            type="button"
            onClick={() => fileInputRef.current?.click()}
          >
            <PlusIcon />
          </button>
        </div>
      </div>
    </div>
  );
}

function ScriptDrawer({
  open,
  scripts,
  selectedScriptId,
  onClose,
  onSelect,
  onCreate,
  onDelete
}: ScriptDrawerProps) {
  if (!open) {
    return null;
  }

  return (
    <div className="overlay overlay--drawer" role="presentation" onClick={onClose}>
      <aside
        aria-label="剧本抽屉"
        className="drawer"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="drawer__header">
          <div className="drawer__header-copy">
            <span className="drawer__eyebrow">剧本空间</span>
            <h2>剧本管理</h2>
            <p>{scripts.length} 个剧本，随时切换练习</p>
          </div>
          <button className="primary-button" type="button" onClick={onCreate}>
            新建
          </button>
        </div>
        <div className="drawer__list">
          {scripts.map((script) => (
            <div
              key={script.id}
              className={`drawer__item ${
                script.id === selectedScriptId ? 'drawer__item--active' : ''
              }`}
            >
              <button
                className="drawer__item-main"
                type="button"
                onClick={() => {
                  onSelect(script.id);
                  onClose();
                }}
              >
                <div className="drawer__item-head">
                  <strong>{script.name}</strong>
                  {script.id === selectedScriptId ? (
                    <span className="drawer__badge">当前使用</span>
                  ) : null}
                </div>
                <span>{script.turns.length} 轮对话</span>
              </button>
              <button
                aria-label={`删除 ${script.name}`}
                className="icon-button icon-button--soft"
                disabled={!canDeleteScript(scripts)}
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onDelete(script.id);
                }}
              >
                <TrashIcon />
                <span className="visually-hidden">删除</span>
              </button>
            </div>
          ))}
        </div>
      </aside>
    </div>
  );
}

function ConfirmDialog({
  open,
  title,
  body,
  confirmText,
  onConfirm,
  onCancel
}: {
  open: boolean;
  title: string;
  body: string;
  confirmText: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!open) {
    return null;
  }

  return (
    <div className="overlay overlay--center">
      <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title">
        <h3 id="dialog-title">{title}</h3>
        <p>{body}</p>
        <div className="dialog__actions">
          <button className="ghost-button" type="button" onClick={onCancel}>
            取消
          </button>
          <button className="danger-button" type="button" onClick={onConfirm}>
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}

function ScriptNameDialog({
  open,
  initialValue,
  onCancel,
  onConfirm
}: ScriptNameDialogProps) {
  const [name, setName] = useState(initialValue);

  useEffect(() => {
    if (open) {
      setName(initialValue);
    }
  }, [initialValue, open]);

  if (!open) {
    return null;
  }

  const handleConfirm = () => {
    onConfirm(name);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
      event.preventDefault();
      handleConfirm();
    }
  };

  return (
    <div className="overlay overlay--center">
      <div
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="script-name-dialog-title"
      >
        <h3 id="script-name-dialog-title">新建剧本</h3>
        <p>先给这个剧本起个名字。</p>
        <label className="dialog__field">
          <span className="dialog__label">剧本名字</span>
          <input
            aria-label="剧本名字"
            className="dialog__input"
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={handleKeyDown}
          />
        </label>
        <div className="dialog__actions">
          <button className="ghost-button" type="button" onClick={onCancel}>
            取消
          </button>
          <button className="primary-button" type="button" onClick={handleConfirm}>
            创建
          </button>
        </div>
      </div>
    </div>
  );
}

function ImageLightbox({
  src,
  onClose
}: {
  src: string | null;
  onClose: () => void;
}) {
  if (!src) {
    return null;
  }

  return (
    <div className="overlay overlay--center overlay--dark" onClick={onClose}>
      <div className="lightbox" role="dialog" aria-modal="true">
        <img alt="大图预览" src={src} />
      </div>
    </div>
  );
}

function ToastViewport({ toast }: { toast: ToastState | null }) {
  if (!toast) {
    return null;
  }

  return (
    <div className="toast-viewport" role="status" aria-live="polite">
      <div className="toast">{toast.message}</div>
    </div>
  );
}

export function EditorPanel({
  script,
  assetUrls,
  onClose,
  onComplete
}: EditorPanelProps) {
  const initialMessages = script.messages.map<DraftMessage>((message) => ({
    ...message
  }));
  const [draftMessages, setDraftMessages] = useState<DraftMessage[]>(initialMessages);
  const [mode, setMode] = useState<Role>('me');
  const [saving, setSaving] = useState(false);
  const [messageToDelete, setMessageToDelete] = useState<string | null>(null);
  const draftPreviewUrlsRef = useRef<Set<string>>(new Set());
  const draftBottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    return () => {
      Array.from(draftPreviewUrlsRef.current).forEach((url) => URL.revokeObjectURL(url));
    };
  }, []);

  const validationError = validateConversationFlow(draftMessages);
  const turnCount = getTurnCount(draftMessages);
  const lastDraftMessageId =
    draftMessages[draftMessages.length - 1]?.id ?? '';
  useAutoScrollToBottom(draftBottomRef, lastDraftMessageId);

  const handleAppendMessage = async ({ text, file }: ComposerPayload) => {
    const previewUrl = file ? URL.createObjectURL(file) : undefined;
    if (previewUrl) {
      draftPreviewUrlsRef.current.add(previewUrl);
    }

    setDraftMessages((current) => [
      ...current,
      {
        id: createId('draft-message'),
        role: mode,
        text,
        createdAt: new Date().toISOString(),
        file: file ?? undefined,
        previewUrl
      }
    ]);
  };

  const handleDeleteMessage = (messageId: string) => {
    setDraftMessages((current) => {
      const nextMessages = current.filter((message) => message.id !== messageId);
      const removed = current.find((message) => message.id === messageId);
      if (removed?.previewUrl) {
        URL.revokeObjectURL(removed.previewUrl);
        draftPreviewUrlsRef.current.delete(removed.previewUrl);
      }
      return nextMessages;
    });
  };

  const handleUndo = () => {
    setDraftMessages((current) => {
      const nextMessages = [...current];
      const removed = nextMessages.pop();
      if (removed?.previewUrl) {
        URL.revokeObjectURL(removed.previewUrl);
        draftPreviewUrlsRef.current.delete(removed.previewUrl);
      }
      return nextMessages;
    });
  };

  return (
    <div className="overlay overlay--sheet">
      <section className="sheet" aria-label="录入对话">
        <header className="sheet__header">
          <div>
            <span className="sheet__eyebrow">对话录入</span>
            <h2>录入对话</h2>
          </div>
          <div className="sheet__header-actions">
            <span className="sheet__turn-badge">{turnCount} 轮</span>
            <button
              className="primary-button"
              disabled={Boolean(validationError) || saving}
              type="button"
              onClick={async () => {
                try {
                  setSaving(true);
                  await onComplete(draftMessages);
                } finally {
                  setSaving(false);
                }
              }}
            >
              完成
            </button>
          </div>
        </header>

        <div className={`sheet__content ${draftMessages.length === 0 ? 'sheet__content--empty' : ''}`}>
          {draftMessages.map((message) => (
            <ChatBubble
              key={message.id}
              imageSrc={message.previewUrl ?? (message.assetId ? assetUrls[message.assetId] : undefined)}
              message={message}
              onBubbleClick={() => setMessageToDelete(message.id)}
            />
          ))}
          <div ref={draftBottomRef} className="chat-list__end" aria-hidden="true" />
        </div>

        <footer className="sheet__footer">
          <div className="editor-toolbar">
            <div className="segmented-control" role="tablist" aria-label="选择角色">
              <button
                aria-label="🗣 我说"
                className={`segmented-control__item ${
                  mode === 'me' ? 'segmented-control__item--active' : ''
                }`}
                type="button"
                onClick={() => setMode('me')}
              >
                <span>我说</span>
              </button>
              <button
                aria-label="🤖 对方"
                className={`segmented-control__item ${
                  mode === 'other' ? 'segmented-control__item--active' : ''
                }`}
                type="button"
                onClick={() => setMode('other')}
              >
                <span>对方</span>
              </button>
            </div>
            <button
              aria-label="↩️ 撤销"
              className="ghost-button"
              disabled={!draftMessages.length}
              type="button"
              onClick={handleUndo}
            >
              <UndoIcon />
              <span>撤销</span>
            </button>
          </div>
          {validationError ? (
            <div className="inline-error" role="alert">
              {validationError}
            </div>
          ) : null}
          <Composer
            ariaLabel="录入对话输入框"
            placeholder=""
            disabled={saving}
            onSubmit={handleAppendMessage}
          />
          <button className="ghost-button ghost-button--block" type="button" onClick={onClose}>
            返回排练
          </button>
        </footer>
      </section>

      <ConfirmDialog
        open={Boolean(messageToDelete)}
        title="删除这条消息？"
        body="删除后这条消息会从当前编辑器中移除。"
        confirmText="删除"
        onCancel={() => setMessageToDelete(null)}
        onConfirm={() => {
          if (messageToDelete) {
            handleDeleteMessage(messageToDelete);
          }
          setMessageToDelete(null);
        }}
      />
    </div>
  );
}

function SectionEmptyState({
  title,
  body,
  action
}: {
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <h3>{title}</h3>
      <p>{body}</p>
      {action}
    </div>
  );
}

function getNextScriptName(scripts: ScriptRecord[]): string {
  if (scripts.length === 0) {
    return '默认剧本';
  }

  return `新剧本 ${scripts.length + 1}`;
}

export default function App() {
  const [loading, setLoading] = useState(true);
  const [scripts, setScripts] = useState<ScriptRecord[]>([]);
  const [assets, setAssets] = useState<Record<string, AssetRecord>>({});
  const [selectedScriptId, setSelectedScriptId] = useState('');
  const [rehearsal, setRehearsal] = useState<RehearsalState | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [scriptNameDialogOpen, setScriptNameDialogOpen] = useState(false);
  const [pendingScriptName, setPendingScriptName] = useState('');
  const [lightboxSource, setLightboxSource] = useState<string | null>(null);
  const [thinkingTurnIndex, setThinkingTurnIndex] = useState<number | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);
  const rehearsalPreviewUrlsRef = useRef<Set<string>>(new Set());
  const pendingReplyTimeoutsRef = useRef<Set<number>>(new Set());
  const chatBottomRef = useRef<HTMLDivElement>(null);
  const assetUrls = useAssetUrls(assets);
  const selectedScript = scripts.find((script) => script.id === selectedScriptId) ?? null;

  useViewportCssVars();
  useViewportScrollLock(['.chat-list', '.sheet__content', '.drawer']);

  const clearPendingReplyTimers = () => {
    pendingReplyTimeoutsRef.current.forEach((timeoutId) => window.clearTimeout(timeoutId));
    pendingReplyTimeoutsRef.current.clear();
    setThinkingTurnIndex(null);
  };

  const showToast = (message: string) => {
    setToast({
      id: Date.now(),
      message
    });
  };

  useEffect(() => {
    let mounted = true;

    const bootstrap = async () => {
      const snapshot = await loadSnapshot();
      let nextScripts = snapshot.scripts;
      let nextSelectedId = snapshot.selectedScriptId;

      if (!nextScripts.length) {
        const defaultScript = createDefaultScript();
        await saveScript(defaultScript);
        nextScripts = [defaultScript];
        nextSelectedId = defaultScript.id;
        await saveSelectedScriptId(defaultScript.id);
      }

      if (!nextSelectedId || !nextScripts.some((script) => script.id === nextSelectedId)) {
        nextSelectedId = nextScripts[0].id;
        await saveSelectedScriptId(nextSelectedId);
      }

      if (!mounted) {
        return;
      }

      setScripts(sortScripts(nextScripts));
      setAssets(snapshot.assets);
      setSelectedScriptId(nextSelectedId);
      setRehearsal(createInitialRehearsalState(nextSelectedId));
      setLoading(false);
    };

    void bootstrap();

    return () => {
      mounted = false;
      clearPendingReplyTimers();
      Array.from(rehearsalPreviewUrlsRef.current).forEach((url) => URL.revokeObjectURL(url));
    };
  }, []);

  useEffect(() => {
    if (!toast) {
      return;
    }

    const timeout = window.setTimeout(() => {
      setToast((current) => (current?.id === toast.id ? null : current));
    }, 2000);

    return () => window.clearTimeout(timeout);
  }, [toast]);

  useEffect(() => {
    if (!selectedScript) {
      return;
    }

    clearPendingReplyTimers();
    Array.from(rehearsalPreviewUrlsRef.current).forEach((url) => URL.revokeObjectURL(url));
    rehearsalPreviewUrlsRef.current.clear();
    setRehearsal(createInitialRehearsalState(selectedScript.id));
  }, [selectedScript?.id, selectedScript?.updatedAt]);

  const replaceScripts = (nextScripts: ScriptRecord[]) => {
    setScripts(sortScripts(nextScripts));
  };

  const setSelectedScript = async (scriptId: string) => {
    setSelectedScriptId(scriptId);
    await saveSelectedScriptId(scriptId);
  };

  const resetRehearsal = (scriptId: string) => {
    clearPendingReplyTimers();
    Array.from(rehearsalPreviewUrlsRef.current).forEach((url) => URL.revokeObjectURL(url));
    rehearsalPreviewUrlsRef.current.clear();
    setRehearsal(createInitialRehearsalState(scriptId));
  };

  const openCreateScriptDialog = () => {
    setPendingScriptName(getNextScriptName(scripts));
    setScriptNameDialogOpen(true);
  };

  const handleCreateScript = async (scriptName: string) => {
    const trimmedName = scriptName.trim();
    const nextScript = createDefaultScript(
      trimmedName || getNextScriptName(scripts)
    );
    await saveScript(nextScript);
    replaceScripts([nextScript, ...scripts]);
    await setSelectedScript(nextScript.id);
    setScriptNameDialogOpen(false);
    setDrawerOpen(false);
    setEditorOpen(false);
    showToast('新剧本已创建。');
  };

  const handleDeleteScript = async (scriptId: string) => {
    if (!canDeleteScript(scripts)) {
      showToast('至少保留一个剧本。');
      return;
    }

    const nextScripts = scripts.filter((script) => script.id !== scriptId);
    await deleteScriptRecord(scriptId);
    replaceScripts(nextScripts);

    if (selectedScriptId === scriptId) {
      const nextSelected = nextScripts[0];
      if (nextSelected) {
        await setSelectedScript(nextSelected.id);
      }
    }

    showToast('剧本已删除。');
  };

  const handleSaveEditorMessages = async (draftMessages: DraftMessage[]) => {
    if (!selectedScript) {
      return;
    }

    const persistedAssets: AssetRecord[] = [];
    const nextMessages: ScriptMessage[] = [];

    for (const draft of draftMessages) {
      let assetId = draft.assetId;
      let assetHash = draft.assetHash;

      if (draft.file) {
        const asset = await fileToAsset(draft.file);
        persistedAssets.push(asset);
        assetId = asset.id;
        assetHash = asset.hash;
      }

      nextMessages.push({
        id: draft.id,
        role: draft.role,
        text: draft.text,
        assetId,
        assetHash,
        createdAt: draft.createdAt
      });
    }

    if (persistedAssets.length) {
      await saveAssets(persistedAssets);
      setAssets((current) => ({
        ...current,
        ...Object.fromEntries(persistedAssets.map((asset) => [asset.id, asset]))
      }));
    }

    const nextScript: ScriptRecord = {
      ...selectedScript,
      messages: nextMessages,
      turns: buildTurnsFromMessages(nextMessages),
      updatedAt: new Date().toISOString()
    };

    await saveScript(nextScript);
    replaceScripts(upsertScript(scripts, nextScript));
    setEditorOpen(false);
    resetRehearsal(nextScript.id);
    showToast('剧本已保存。');
  };

  const handleAttemptSubmit = async ({ text, file }: ComposerPayload) => {
    if (
      !selectedScript ||
      !rehearsal ||
      rehearsal.status === 'completed' ||
      thinkingTurnIndex !== null
    ) {
      return;
    }

    if (!selectedScript.turns.length) {
      showToast('请先录入完整剧本。');
      return;
    }

    let assetHash: string | undefined;
    let previewUrl: string | undefined;

    if (file) {
      assetHash = await hashBlob(file);
      previewUrl = URL.createObjectURL(file);
      rehearsalPreviewUrlsRef.current.add(previewUrl);
    }

    const currentTurnIndex = rehearsal.turnIndex;
    const result = applyRehearsalAttempt(rehearsal, selectedScript, {
      id: createId('attempt'),
      role: 'me',
      text,
      assetHash,
      createdAt: new Date().toISOString(),
      previewUrl
    });

    if (result.kind === 'mismatch') {
      setRehearsal(result.nextState);
      showToast('台词不对，重新来过');
      const urlsToRemove = getAttemptPreviewUrlsForTurn(result.nextState, currentTurnIndex);

      window.setTimeout(() => {
        urlsToRemove.forEach((url) => {
          URL.revokeObjectURL(url);
          rehearsalPreviewUrlsRef.current.delete(url);
        });

        setRehearsal((current) =>
          current && current.scriptId === selectedScript.id
            ? resetTurnAttempts(current, currentTurnIndex)
            : current
        );
      }, 700);
      return;
    }

    if (result.kind === 'progress') {
      setRehearsal(result.nextState);
      return;
    }

    const pendingReplyMessages = getPendingReplyMessages(
      rehearsal,
      result.nextState,
      currentTurnIndex
    );

    if (!pendingReplyMessages.length) {
      setRehearsal(result.nextState);
      return;
    }

    setThinkingTurnIndex(currentTurnIndex);
    setRehearsal(removeMessagesFromRehearsal(result.nextState, pendingReplyMessages.map((message) => message.id), 'running'));

    pendingReplyMessages.forEach((message, index) => {
      const isLastMessage = index === pendingReplyMessages.length - 1;
      const timeoutId = window.setTimeout(() => {
        pendingReplyTimeoutsRef.current.delete(timeoutId);

        if (index === 0) {
          setThinkingTurnIndex(null);
        }

        setRehearsal((current) => {
          if (!current || current.scriptId !== selectedScript.id) {
            return current;
          }

          return appendReplyMessage(
            current,
            message,
            isLastMessage ? result.nextState.status : 'running'
          );
        });
      }, THINKING_DELAY_MS + index * REPLY_STAGGER_MS);

      pendingReplyTimeoutsRef.current.add(timeoutId);
    });
  };

  const timeline = rehearsal?.timeline ?? [];
  const lastTimelineMessageId = timeline[timeline.length - 1]?.id ?? '';
  useAutoScrollToBottom(
    chatBottomRef,
    `${lastTimelineMessageId}:${thinkingTurnIndex ?? ''}`
  );

  if (loading) {
    return (
      <div className="app-shell app-shell--loading">
        <SectionEmptyState title="正在准备剧本…" body="本地数据加载完成后就能开始排练。" />
      </div>
    );
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <button
          aria-label="打开剧本列表"
          className="icon-button icon-button--chrome"
          type="button"
          onClick={() => setDrawerOpen(true)}
        >
          <MenuIcon />
        </button>
        <div className="topbar__center">
          <div className="topbar__title">{selectedScript?.name ?? '对话排练'}</div>
        </div>
        <button
          aria-label="打开录入对话面板"
          className="icon-button icon-button--chrome"
          type="button"
          onClick={() => setEditorOpen(true)}
        >
          <PencilIcon />
        </button>
      </header>

      <main className="main-panel">
        <div className={`chat-list ${timeline.length === 0 ? 'chat-list--empty' : ''}`}>
          {timeline.map((message: RuntimeMessage) => (
            <ChatBubble
              key={message.id}
              imageSrc={message.previewUrl ?? (message.assetId ? assetUrls[message.assetId] : undefined)}
              message={message}
              onImageClick={() => {
                const src = message.previewUrl ?? (message.assetId ? assetUrls[message.assetId] : undefined);
                if (src) {
                  setLightboxSource(src);
                }
              }}
            />
          ))}
          {thinkingTurnIndex !== null ? <ThinkingIndicator /> : null}
          <div ref={chatBottomRef} className="chat-list__end" aria-hidden="true" />
        </div>
      </main>

      <footer className="footer-panel">
        <Composer
          ariaLabel="排练输入框"
          placeholder=""
          disabled={
            !selectedScript ||
            !selectedScript.turns.length ||
            rehearsal?.status === 'completed' ||
            thinkingTurnIndex !== null
          }
          onSubmit={handleAttemptSubmit}
        />
      </footer>

      <ScriptDrawer
        open={drawerOpen}
        scripts={scripts}
        selectedScriptId={selectedScriptId}
        onClose={() => setDrawerOpen(false)}
        onCreate={openCreateScriptDialog}
        onDelete={(scriptId) => void handleDeleteScript(scriptId)}
        onSelect={(scriptId) => void setSelectedScript(scriptId)}
      />

      <ScriptNameDialog
        open={scriptNameDialogOpen}
        initialValue={pendingScriptName}
        onCancel={() => setScriptNameDialogOpen(false)}
        onConfirm={(name) => void handleCreateScript(name)}
      />

      {editorOpen && selectedScript ? (
        <EditorPanel
          assetUrls={assetUrls}
          script={selectedScript}
          onClose={() => {
            setEditorOpen(false);
            resetRehearsal(selectedScript.id);
          }}
          onComplete={handleSaveEditorMessages}
        />
      ) : null}

      <ImageLightbox src={lightboxSource} onClose={() => setLightboxSource(null)} />
      <ToastViewport toast={toast} />
    </div>
  );
}

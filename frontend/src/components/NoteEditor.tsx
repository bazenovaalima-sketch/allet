import type { RefObject } from 'react';
import type { Attachment } from '../api';
import { IconBack, IconNote } from '../icons';
import { VideoItem } from './VideoItem';

interface NoteEditorProps {
  selectedCategoryId: number | null;
  title: string;
  contentParts: string[];
  attachments: Attachment[];
  saveStatus: 'saved' | 'saving' | 'error';
  textareaRefs: RefObject<{ [key: number]: HTMLTextAreaElement | null }>;
  onBack: () => void;
  onDeleteVideo: (attachmentId: number, url: string) => void;
  onTextChange: (index: number, value: string) => void;
  onTitleChange: (title: string) => void;
}

export function NoteEditor({
  selectedCategoryId,
  title,
  contentParts,
  attachments,
  saveStatus,
  textareaRefs,
  onBack,
  onDeleteVideo,
  onTextChange,
  onTitleChange,
}: NoteEditorProps) {
  const focusLastTextarea = (target: EventTarget, currentTarget: EventTarget) => {
    if (target !== currentTarget) return;
    const lastTextIndex = contentParts.length - 1;
    textareaRefs.current[lastTextIndex]?.focus();
  };

  return (
    <div className="ios-note-view" onClick={e => focusLastTextarea(e.target, e.currentTarget)}>
      {!selectedCategoryId ? (
        <div className="ios-empty-state">
          <span className="ios-empty-icon">
            <IconNote />
          </span>
          <p>Выберите заметку</p>
        </div>
      ) : (
        <div className="ios-note-sheet">
          <div className="ios-note-toolbar">
            <button className="ios-back-btn" onClick={onBack}>
              <IconBack />
              Заметки
            </button>
            <div className={`ios-save-indicator ${saveStatus}`}>
              {saveStatus === 'saving' ? 'Сохранение...' : 'Сохранено'}
            </div>
          </div>

          <input
            className="ios-note-title"
            value={title}
            onChange={e => onTitleChange(e.target.value)}
            placeholder="Заголовок"
          />

          <div className="ios-note-flow">
            {contentParts.map((part, index) => {
              const isUrl = /^https?:\/\//.test(part);
              if (!isUrl) {
                return (
                  <textarea
                    key={index}
                    ref={el => { textareaRefs.current[index] = el; }}
                    className="ios-textarea"
                    value={part}
                    onChange={e => onTextChange(index, e.target.value)}
                    placeholder={index === 0 ? 'Начните писать...' : ''}
                    onInput={e => {
                      const textarea = e.target as HTMLTextAreaElement;
                      textarea.style.height = 'auto';
                      textarea.style.height = `${textarea.scrollHeight}px`;
                    }}
                  />
                );
              }

              const url = part.trim();
              const attachment = attachments.find(item => item.original_url === url);
              if (!attachment) return <div key={index} className="ios-video-pending-bar">Поиск...</div>;
              if (attachment.status === 'too_long') {
                return (
                  <div key={attachment.id} className="ios-link-item">
                    <a href={attachment.original_url} target="_blank" rel="noopener noreferrer" className="ios-link-url">
                      {attachment.original_url}
                    </a>
                    <span className="ios-link-note">Видео слишком длинное — откройте по ссылке</span>
                  </div>
                );
              }
              return <VideoItem key={attachment.id} attachment={attachment} onDelete={onDeleteVideo} />;
            })}
          </div>
        </div>
      )}
    </div>
  );
}

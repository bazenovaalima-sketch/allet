import React, { useState, useEffect, useRef, useMemo } from 'react';
import { api } from './api';
import type { Category, Note, Attachment } from './api';
import './App.css';

const URL_REGEX = /(https?:\/\/[^\s\n\r]+)(?=[\s\n\r]|$)/g;

const VIDEO_PLATFORMS = [
  'youtube.com', 'youtu.be',
  'instagram.com', 'instagr.am',
  'tiktok.com', 'vm.tiktok.com',
  'twitter.com', 'x.com', 't.co',
  'vimeo.com', 'twitch.tv',
  'reddit.com', 'facebook.com', 'fb.com',
  'dailymotion.com', 'ok.ru', 'vk.com',
];

const isVideoUrl = (url: string) => VIDEO_PLATFORMS.some(p => url.toLowerCase().includes(p));

// Simple SVG Icons
const IconFolder = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
  </svg>
);

const IconPlus = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="5" x2="12" y2="19"></line>
    <line x1="5" y1="12" x2="19" y2="12"></line>
  </svg>
);

const IconNote = () => (
  <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"></path>
    <polyline points="14 2 14 8 20 8"></polyline>
  </svg>
);

const IconEdit = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
  </svg>
);

const VideoItem = React.memo(({ attachment, onDelete }: { attachment: Attachment, onDelete: (id: number, url: string) => void }) => {
  return (
    <div className="ios-video-card" key={attachment.id}>
      <div className="ios-video-header">
        <span className="ios-video-url">{attachment.original_url}</span>
        <button className="ios-video-delete" onClick={() => onDelete(attachment.id, attachment.original_url)}>×</button>
      </div>
      <div className="ios-video-body">
        {attachment.status === 'completed' && attachment.local_path ? (
          <video controls src={attachment.local_path!} className="ios-video-element" />
        ) : (
          <div className="ios-video-loading">
            <div className="ios-spinner"></div>
            <span>{attachment.status === 'failed' ? 'Ошибка' : 'Загрузка видео...'}</span>
          </div>
        )}
      </div>
    </div>
  );
});

function App() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null);
  const [currentNote, setCurrentNote] = useState<Note | null>(null);
  const [localTitle, setLocalTitle] = useState('');
  const [localContent, setLocalContent] = useState('');
  const [isAddingCategory, setIsAddingCategory] = useState(false);
  const [editingCategoryId, setEditingCategoryId] = useState<number | null>(null);
  const [editName, setEditName] = useState('');
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'error'>('saved');

  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const textareaRefs = useRef<{[key: number]: HTMLTextAreaElement | null}>({});

  useEffect(() => { fetchCategories(); }, []);
  useEffect(() => { if (selectedCategoryId) loadNote(selectedCategoryId); }, [selectedCategoryId]);

  const fetchCategories = async () => {
    try {
      const res = await api.getCategories();
      setCategories(res.data);
    } catch (e) { console.error(e); }
  };

  const loadNote = async (catId: number) => {
    try {
      const res = await api.getNotes(catId);
      if (res.data.length > 0) {
        const note = res.data[0];
        setCurrentNote(note);
        setLocalTitle(note.title);
        setLocalContent(note.content);
      } else {
        const newNote = await api.syncNote({ title: 'Без названия', content: '', category_id: catId });
        setCurrentNote(newNote.data);
        setLocalTitle('Без названия');
        setLocalContent('');
      }
      setSaveStatus('saved');
    } catch (e) { console.error(e); }
  };

  const updateNoteState = (newNote: Note) => {
    setCurrentNote(prev => {
      if (!prev || prev.id !== newNote.id) return prev;
      return { ...newNote };
    });
  };

  useEffect(() => {
    if (!selectedCategoryId || !currentNote) return;
    if (localTitle === currentNote.title && localContent === currentNote.content) return;

    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(async () => {
      try {
        setSaveStatus('saving');
        const res = await api.syncNote({ title: localTitle, content: localContent, category_id: selectedCategoryId });
        updateNoteState(res.data);
        setSaveStatus('saved');
        // If title changed, refresh categories to update sidebar name
        if (localTitle !== currentNote.title) {
          fetchCategories();
        }
      } catch (e) { setSaveStatus('error'); }
    }, 1000);
    return () => { if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current); };
  }, [localTitle, localContent, currentNote, selectedCategoryId]);

  useEffect(() => {
    const hasPending = currentNote?.attachments.some(a => a.status !== 'completed' && a.status !== 'failed');
    if (!hasPending || !currentNote) return;
    const interval = setInterval(async () => {
      try {
        const res = await api.getNote(currentNote.id);
        updateNoteState(res.data);
      } catch (e) {}
    }, 3000);
    return () => clearInterval(interval);
  }, [currentNote?.attachments, currentNote?.id]);

  useEffect(() => {
    Object.values(textareaRefs.current).forEach(el => {
      if (el) {
        el.style.height = 'auto';
        el.style.height = el.scrollHeight + 'px';
      }
    });
  }, [currentNote?.id]);

  const parts = useMemo(() => {
    const raw = localContent.split(URL_REGEX);
    return raw.map((p, i) => {
      const prevIsUrl = i > 0 && /^https?:\/\//.test(raw[i - 1]);
      return prevIsUrl && p === '' ? '\n' : p;
    });
  }, [localContent]);

  const handleTextChange = (index: number, val: string) => {
    const newParts = [...parts];
    const prevIsUrl = index > 0 && /^https?:\/\//.test(newParts[index - 1]);
    newParts[index] = prevIsUrl && val && !/^\s/.test(val) ? '\n' + val : val;
    setLocalContent(newParts.join(''));
  };

  const handleDeleteVideo = async (attachmentId: number, url: string) => {
    if (!window.confirm('Удалить это видео?')) return;
    try {
      await api.deleteAttachment(attachmentId);
      const newContent = localContent.replace(url, '').trim();
      setLocalContent(newContent);
    } catch (e) { console.error(e); }
  };

  const handleUpdateCategory = async (id: number) => {
    if (!editName.trim()) {
      setEditingCategoryId(null);
      return;
    }
    try {
      await api.updateCategory(id, editName);
      setEditingCategoryId(null);
      // If we are currently viewing this category, update the local title too
      if (id === selectedCategoryId) {
        setLocalTitle(editName);
      }
      fetchCategories();
    } catch (e) { console.error(e); }
  };

  const startEditing = (e: React.MouseEvent, c: Category) => {
    e.stopPropagation();
    setEditingCategoryId(c.id);
    setEditName(c.name);
  };

  return (
    <div className="ios-container">
      <div className="ios-sidebar">
        <div className="ios-app-branding">Allet</div>
        <div className="ios-sidebar-header">
          <h1>Заметки</h1>
          <button className="ios-add-btn" onClick={() => setIsAddingCategory(true)}>
            <IconPlus />
          </button>
        </div>

        {isAddingCategory && (
          <div className="ios-cat-input-container">
            <input 
              autoFocus 
              className="ios-cat-input"
              placeholder="Новая заметка"
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  api.createCategory(e.currentTarget.value).then(res => {
                    setIsAddingCategory(false);
                    fetchCategories();
                    setSelectedCategoryId(res.data.id);
                  });
                }
              }}
              onBlur={() => setIsAddingCategory(false)}
            />
          </div>
        )}

        <div className="ios-cat-list">
          {categories.map(c => (
            <div 
              key={c.id} 
              className={`ios-cat-item ${selectedCategoryId === c.id ? 'active' : ''}`}
              onClick={() => setSelectedCategoryId(c.id)}
            >
              {editingCategoryId === c.id ? (
                <input 
                  autoFocus
                  className="ios-cat-input"
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleUpdateCategory(c.id);
                    }
                    if (e.key === 'Escape') setEditingCategoryId(null);
                  }}
                  onBlur={() => handleUpdateCategory(c.id)}
                  onClick={e => e.stopPropagation()}
                />
              ) : (
                <>
                  <div className="ios-cat-content">
                    <span className="ios-icon">
                      <IconFolder />
                    </span>
                    <span className="ios-cat-name">{c.name}</span>
                  </div>
                  <div className="ios-cat-actions">
                    <button className="ios-cat-edit-btn" onClick={(e) => startEditing(e, c)}>
                      <IconEdit />
                    </button>
                    <button className="ios-cat-delete" onClick={(e) => {
                      e.stopPropagation();
                      if (window.confirm('Удалить?')) api.deleteCategory(c.id).then(() => {
                        fetchCategories();
                        if (selectedCategoryId === c.id) setSelectedCategoryId(null);
                      });
                    }}>×</button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="ios-note-view" onClick={(e) => {
        if (e.target === e.currentTarget) {
          const lastTextIdx = parts.length - 1;
          textareaRefs.current[lastTextIdx]?.focus();
        }
      }}>
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
              <div className={`ios-save-indicator ${saveStatus}`}>
                {saveStatus === 'saving' ? 'Сохранение...' : 'Сохранено'}
              </div>
            </div>
            
            <input 
              className="ios-note-title" 
              value={localTitle} 
              onChange={e => setLocalTitle(e.target.value)} 
              placeholder="Заголовок" 
            />

            <div className="ios-note-flow">
              {parts.map((part, index) => {
                const isUrl = part.match(/https?:\/\/[^\s\n\r]+/);
                if (isUrl) {
                  const url = part.trim();
                  if (!isVideoUrl(url)) {
                    return (
                      <a key={index} href={url} target="_blank" rel="noopener noreferrer" className="ios-plain-link">
                        {url}
                      </a>
                    );
                  }
                  const att = currentNote?.attachments.find(a => a.original_url === url);
                  if (!att) return <div key={index} className="ios-video-pending-bar">Поиск...</div>;
                  if (att.status === 'too_long') {
                    return (
                      <div key={att.id} className="ios-link-item">
                        <a href={att.original_url} target="_blank" rel="noopener noreferrer" className="ios-link-url">
                          {att.original_url}
                        </a>
                        <span className="ios-link-note">Видео слишком длинное — откройте по ссылке</span>
                      </div>
                    );
                  }
                  return <VideoItem key={att.id} attachment={att} onDelete={handleDeleteVideo} />;
                } else {
                  return (
                    <textarea
                      key={index}
                      ref={el => { textareaRefs.current[index] = el; }}
                      className="ios-textarea"
                      value={part}
                      onChange={(e) => handleTextChange(index, e.target.value)}
                      placeholder={index === 0 ? "Начните писать..." : ""}
                      onInput={(e) => {
                        const t = e.target as HTMLTextAreaElement;
                        t.style.height = 'auto';
                        t.style.height = t.scrollHeight + 'px';
                      }}
                    />
                  );
                }
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;

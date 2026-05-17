import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from './api';
import type { Category, Note } from './api';
import { NoteEditor } from './components/NoteEditor';
import { PasscodeScreen } from './components/PasscodeScreen';
import { Sidebar } from './components/Sidebar';
import { AUTH_KEY, URL_REGEX } from './constants';
import './App.css';

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
  const [mobileView, setMobileView] = useState<'list' | 'note'>('list');
  const [searchQuery, setSearchQuery] = useState('');

  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const textareaRefs = useRef<{ [key: number]: HTMLTextAreaElement | null }>({});
  const pendingNoteTitle = useRef<string | null>(null);

  const fetchCategories = useCallback(async () => {
    try {
      const res = await api.getCategories();
      setCategories(res.data);
    } catch (error) {
      console.error(error);
    }
  }, []);

  const updateNoteState = useCallback((newNote: Note) => {
    setCurrentNote(prev => {
      if (!prev || prev.id !== newNote.id) return prev;
      return { ...newNote };
    });
  }, []);

  const loadNote = useCallback(async (categoryId: number) => {
    try {
      const res = await api.getNotes(categoryId);
      if (res.data.length > 0) {
        const note = res.data[0];
        setCurrentNote(note);
        setLocalTitle(note.title);
        setLocalContent(note.content);
      } else {
        const title = pendingNoteTitle.current || 'Без названия';
        pendingNoteTitle.current = null;
        const newNote = await api.syncNote({ title, content: '', category_id: categoryId });
        setCurrentNote(newNote.data);
        setLocalTitle(title);
        setLocalContent('');
      }
      setSaveStatus('saved');
    } catch (error) {
      console.error(error);
    }
  }, []);

  useEffect(() => {
    const run = async () => {
      await fetchCategories();
    };
    void run();
  }, [fetchCategories]);

  useEffect(() => {
    if (!selectedCategoryId) return;
    const run = async () => {
      await loadNote(selectedCategoryId);
    };
    void run();
  }, [loadNote, selectedCategoryId]);

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
        if (localTitle !== currentNote.title) fetchCategories();
      } catch (error) {
        console.error(error);
        setSaveStatus('error');
      }
    }, 1000);

    return () => {
      if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    };
  }, [currentNote, fetchCategories, localContent, localTitle, selectedCategoryId, updateNoteState]);

  const currentNoteId = currentNote?.id;
  const hasPendingAttachment = currentNote?.attachments.some(
    attachment => attachment.status !== 'completed' && attachment.status !== 'failed',
  );

  useEffect(() => {
    if (!hasPendingAttachment || !currentNoteId) return;

    const interval = setInterval(async () => {
      try {
        const res = await api.getNote(currentNoteId);
        updateNoteState(res.data);
      } catch (error) {
        console.error(error);
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [currentNoteId, hasPendingAttachment, updateNoteState]);

  useEffect(() => {
    Object.values(textareaRefs.current).forEach(textarea => {
      if (!textarea) return;
      textarea.style.height = 'auto';
      textarea.style.height = `${textarea.scrollHeight}px`;
    });
  }, [currentNoteId]);

  const visibleCategories = useMemo(() => {
    const sorted = [...categories].sort((a, b) => {
      const aTime = a.notes[0]?.updated_at ? new Date(a.notes[0].updated_at).getTime() : 0;
      const bTime = b.notes[0]?.updated_at ? new Date(b.notes[0].updated_at).getTime() : 0;
      return bTime - aTime;
    });
    if (!searchQuery.trim()) return sorted;
    return sorted.filter(category => category.name.toLowerCase().includes(searchQuery.toLowerCase()));
  }, [categories, searchQuery]);

  const contentParts = useMemo(() => {
    const raw = localContent.split(URL_REGEX);
    return raw.map((part, index) => {
      const prevIsUrl = index > 0 && /^https?:\/\//.test(raw[index - 1]);
      return prevIsUrl && part === '' ? '\n' : part;
    });
  }, [localContent]);

  const handleTextChange = useCallback((index: number, value: string) => {
    const newParts = [...contentParts];
    const prevIsUrl = index > 0 && /^https?:\/\//.test(newParts[index - 1]);
    newParts[index] = prevIsUrl && value && !/^\s/.test(value) ? `\n${value}` : value;
    setLocalContent(newParts.join(''));
  }, [contentParts]);

  const handleCreateCategory = useCallback(async (name: string) => {
    try {
      pendingNoteTitle.current = name;
      const res = await api.createCategory(name);
      setIsAddingCategory(false);
      fetchCategories();
      setSelectedCategoryId(res.data.id);
      setMobileView('note');
    } catch (error) {
      console.error(error);
    }
  }, [fetchCategories]);

  const handleDeleteCategory = useCallback(async (id: number) => {
    if (!window.confirm('Удалить?')) return;
    try {
      await api.deleteCategory(id);
      fetchCategories();
      if (selectedCategoryId === id) setSelectedCategoryId(null);
    } catch (error) {
      console.error(error);
    }
  }, [fetchCategories, selectedCategoryId]);

  const handleDeleteVideo = useCallback(async (attachmentId: number, url: string) => {
    if (!window.confirm('Удалить это видео?')) return;
    try {
      await api.deleteAttachment(attachmentId);
      setLocalContent(content => content.replace(url, '').trim());
    } catch (error) {
      console.error(error);
    }
  }, []);

  const handleUpdateCategory = useCallback(async (id: number) => {
    if (!editName.trim()) {
      setEditingCategoryId(null);
      return;
    }
    try {
      await api.updateCategory(id, editName);
      setEditingCategoryId(null);
      if (id === selectedCategoryId) setLocalTitle(editName);
      fetchCategories();
    } catch (error) {
      console.error(error);
    }
  }, [editName, fetchCategories, selectedCategoryId]);

  return (
    <div className={`ios-container ${mobileView === 'note' ? 'mobile-note' : 'mobile-list'}`}>
      <Sidebar
        categories={visibleCategories}
        selectedCategoryId={selectedCategoryId}
        isAddingCategory={isAddingCategory}
        editingCategoryId={editingCategoryId}
        editName={editName}
        searchQuery={searchQuery}
        onAddStart={() => setIsAddingCategory(true)}
        onAddingBlur={() => setIsAddingCategory(false)}
        onCreateCategory={handleCreateCategory}
        onDeleteCategory={handleDeleteCategory}
        onEditCancel={() => setEditingCategoryId(null)}
        onEditNameChange={setEditName}
        onEditStart={category => {
          setEditingCategoryId(category.id);
          setEditName(category.name);
        }}
        onSearchChange={setSearchQuery}
        onSelectCategory={id => {
          setSelectedCategoryId(id);
          setMobileView('note');
        }}
        onUpdateCategory={handleUpdateCategory}
      />

      <NoteEditor
        selectedCategoryId={selectedCategoryId}
        title={localTitle}
        contentParts={contentParts}
        attachments={currentNote?.attachments ?? []}
        saveStatus={saveStatus}
        textareaRefs={textareaRefs}
        onBack={() => setMobileView('list')}
        onDeleteVideo={handleDeleteVideo}
        onTextChange={handleTextChange}
        onTitleChange={setLocalTitle}
      />
    </div>
  );
}

function Root() {
  const [authed, setAuthed] = useState(() => localStorage.getItem(AUTH_KEY) === '1');
  if (!authed) return <PasscodeScreen onAuth={() => setAuthed(true)} />;
  return <App />;
}

export default Root;

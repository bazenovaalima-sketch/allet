import type { Category } from '../api';
import { IconEdit, IconFolder, IconPlus } from '../icons';

interface SidebarProps {
  categories: Category[];
  selectedCategoryId: number | null;
  isAddingCategory: boolean;
  editingCategoryId: number | null;
  editName: string;
  searchQuery: string;
  onAddStart: () => void;
  onCreateCategory: (name: string) => void;
  onDeleteCategory: (id: number) => void;
  onEditNameChange: (name: string) => void;
  onEditStart: (category: Category) => void;
  onEditCancel: () => void;
  onSelectCategory: (id: number) => void;
  onSearchChange: (query: string) => void;
  onUpdateCategory: (id: number) => void;
  onAddingBlur: () => void;
}

export function Sidebar({
  categories,
  selectedCategoryId,
  isAddingCategory,
  editingCategoryId,
  editName,
  searchQuery,
  onAddStart,
  onCreateCategory,
  onDeleteCategory,
  onEditNameChange,
  onEditStart,
  onEditCancel,
  onSelectCategory,
  onSearchChange,
  onUpdateCategory,
  onAddingBlur,
}: SidebarProps) {
  return (
    <div className="ios-sidebar">
      <div className="ios-app-branding">Allet</div>
      <div className="ios-sidebar-header">
        <h1>Заметки</h1>
        <button className="ios-add-btn" onClick={onAddStart}>
          <IconPlus />
        </button>
      </div>

      <div className="ios-search-container">
        <input
          className="ios-search-input"
          placeholder="Поиск..."
          value={searchQuery}
          onChange={e => onSearchChange(e.target.value)}
        />
      </div>

      {isAddingCategory && (
        <div className="ios-cat-input-container">
          <input
            autoFocus
            className="ios-cat-input"
            placeholder="Новая заметка"
            onKeyDown={e => {
              if (e.key !== 'Enter') return;
              const name = e.currentTarget.value.trim();
              if (name) onCreateCategory(name);
            }}
            onBlur={onAddingBlur}
          />
        </div>
      )}

      <div className="ios-cat-list">
        {categories.map(category => (
          <div
            key={category.id}
            className={`ios-cat-item ${selectedCategoryId === category.id ? 'active' : ''}`}
            onClick={() => onSelectCategory(category.id)}
          >
            {editingCategoryId === category.id ? (
              <input
                autoFocus
                className="ios-cat-input"
                value={editName}
                onChange={e => onEditNameChange(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    onUpdateCategory(category.id);
                  }
                  if (e.key === 'Escape') onEditCancel();
                }}
                onBlur={() => onUpdateCategory(category.id)}
                onClick={e => e.stopPropagation()}
              />
            ) : (
              <>
                <div className="ios-cat-content">
                  <span className="ios-icon">
                    <IconFolder />
                  </span>
                  <span className="ios-cat-name">{category.name}</span>
                </div>
                <div className="ios-cat-actions">
                  <button
                    className="ios-cat-edit-btn"
                    onClick={e => {
                      e.stopPropagation();
                      onEditStart(category);
                    }}
                  >
                    <IconEdit />
                  </button>
                  <button
                    className="ios-cat-delete"
                    onClick={e => {
                      e.stopPropagation();
                      onDeleteCategory(category.id);
                    }}
                  >
                    ×
                  </button>
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

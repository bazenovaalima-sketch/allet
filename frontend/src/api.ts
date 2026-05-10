import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';

export interface Category {
  id: number;
  name: string;
  notes: Note[];
}

export interface Attachment {
  id: number;
  original_url: string;
  local_path: string | null;
  status: 'pending' | 'downloading' | 'completed' | 'failed' | 'too_long';
}

export interface Note {
  id: number;
  title: string;
  content: string;
  category_id: number;
  attachments: Attachment[];
  updated_at: string | null;
}

export const api = {
  getCategories: () => axios.get<Category[]>(`${API_URL}/categories`),
  createCategory: (name: string) => axios.post<Category>(`${API_URL}/categories`, { name }),
  updateCategory: (id: number, name: string) => axios.put<Category>(`${API_URL}/categories/${id}`, { name }),
  deleteCategory: (id: number) => axios.delete(`${API_URL}/categories/${id}`),

  getNotes: (categoryId?: number) => axios.get<Note[]>(`${API_URL}/notes`, { params: { category_id: categoryId } }),
  syncNote: (note: { title: string; content: string; category_id: number }) =>
    axios.post<Note>(`${API_URL}/notes/sync`, note),
  getNote: (id: number) => axios.get<Note>(`${API_URL}/notes/${id}`),
  deleteAttachment: (id: number) => axios.delete(`${API_URL}/attachments/${id}`),
};

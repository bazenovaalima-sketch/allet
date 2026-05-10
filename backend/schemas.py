from pydantic import BaseModel
from typing import List, Optional

class AttachmentBase(BaseModel):
    original_url: str

class Attachment(AttachmentBase):
    id: int
    note_id: int
    local_path: Optional[str] = None
    status: str

    class Config:
        from_attributes = True

class NoteBase(BaseModel):
    title: str
    content: str
    category_id: int

class NoteCreate(NoteBase):
    pass

class Note(NoteBase):
    id: int
    attachments: List[Attachment] = []

    class Config:
        from_attributes = True

class CategoryBase(BaseModel):
    name: str

class CategoryCreate(CategoryBase):
    pass

class Category(CategoryBase):
    id: int
    notes: List[Note] = []

    class Config:
        from_attributes = True

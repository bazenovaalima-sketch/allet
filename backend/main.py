import os
import re
import uuid
import tempfile
import yt_dlp
import boto3
from fastapi import FastAPI, Depends, BackgroundTasks, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from typing import List

from . import models, schemas, database
from .database import engine, get_db

models.Base.metadata.create_all(bind=engine)

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def get_r2():
    return boto3.client(
        "s3",
        endpoint_url=os.getenv("R2_ENDPOINT_URL"),
        aws_access_key_id=os.getenv("R2_ACCESS_KEY_ID"),
        aws_secret_access_key=os.getenv("R2_SECRET_ACCESS_KEY"),
        region_name="auto",
    )

def download_video(attachment_id: int, url: str):
    db = database.SessionLocal()
    attachment = db.query(models.Attachment).filter(models.Attachment.id == attachment_id).first()
    if not attachment:
        db.close()
        return

    attachment.status = "downloading"
    db.commit()

    filename = f"{uuid.uuid4()}.mp4"

    with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as tmp:
        tmppath = tmp.name

    ydl_opts = {
        'format': 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best',
        'outtmpl': tmppath,
        'quiet': True,
        'no_warnings': True,
    }

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            ydl.download([url])

        r2 = get_r2()
        bucket = os.getenv("R2_BUCKET_NAME")
        r2.upload_file(tmppath, bucket, filename, ExtraArgs={"ContentType": "video/mp4"})

        public_url = f"{os.getenv('R2_PUBLIC_URL')}/{filename}"
        attachment.local_path = public_url
        attachment.status = "completed"
    except Exception as e:
        print(f"Error downloading {url}: {e}")
        attachment.status = "failed"
    finally:
        if os.path.exists(tmppath):
            os.remove(tmppath)

    db.commit()
    db.close()

@app.get("/api/categories", response_model=List[schemas.Category])
def get_categories(db: Session = Depends(get_db)):
    return db.query(models.Category).all()

@app.post("/api/categories", response_model=schemas.Category)
def create_category(category: schemas.CategoryCreate, db: Session = Depends(get_db)):
    db_category = models.Category(name=category.name)
    db.add(db_category)
    db.commit()
    db.refresh(db_category)
    return db_category

@app.get("/api/notes", response_model=List[schemas.Note])
def get_notes(category_id: int = None, db: Session = Depends(get_db)):
    query = db.query(models.Note)
    if category_id:
        query = query.filter(models.Note.category_id == category_id)
    return query.all()

@app.post("/api/notes/sync", response_model=schemas.Note)
def sync_note(note_data: schemas.NoteCreate, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    db_note = db.query(models.Note).filter(models.Note.category_id == note_data.category_id).first()
    if not db_note:
        db_note = models.Note(title=note_data.title, content=note_data.content, category_id=note_data.category_id)
        db.add(db_note)
    else:
        db_note.title = note_data.title
        db_note.content = note_data.content

    db_cat = db.query(models.Category).filter(models.Category.id == note_data.category_id).first()
    if db_cat:
        db_cat.name = note_data.title

    db.commit()
    db.refresh(db_note)

    raw_urls = re.findall(r'https?://[^\s\n\r\t]+', note_data.content)
    normalized_urls = list(dict.fromkeys(u.rstrip('.,;!?)') for u in raw_urls))

    existing_att = {a.original_url: a for a in db_note.attachments}
    for url in normalized_urls:
        if url not in existing_att:
            new_att = models.Attachment(note_id=db_note.id, original_url=url, status="pending")
            db.add(new_att)
            db.commit()
            background_tasks.add_task(download_video, new_att.id, url)
        elif existing_att[url].status == 'failed':
            existing_att[url].status = 'pending'
            db.commit()
            background_tasks.add_task(download_video, existing_att[url].id, url)

    db.expire_all()
    return db.query(models.Note).filter(models.Note.id == db_note.id).first()

@app.get("/api/notes/{note_id}", response_model=schemas.Note)
def get_note(note_id: int, db: Session = Depends(get_db)):
    note = db.query(models.Note).filter(models.Note.id == note_id).first()
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")
    return note

@app.delete("/api/categories/{category_id}")
def delete_category(category_id: int, db: Session = Depends(get_db)):
    category = db.query(models.Category).filter(models.Category.id == category_id).first()
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")
    db.delete(category)
    db.commit()
    return {"message": "Category deleted"}

@app.put("/api/categories/{category_id}", response_model=schemas.Category)
def update_category(category_id: int, category_data: schemas.CategoryCreate, db: Session = Depends(get_db)):
    db_category = db.query(models.Category).filter(models.Category.id == category_id).first()
    if not db_category:
        raise HTTPException(status_code=404, detail="Category not found")
    db_category.name = category_data.name
    db.commit()
    db.refresh(db_category)
    return db_category

@app.delete("/api/attachments/{attachment_id}")
def delete_attachment(attachment_id: int, db: Session = Depends(get_db)):
    attachment = db.query(models.Attachment).filter(models.Attachment.id == attachment_id).first()
    if not attachment:
        raise HTTPException(status_code=404, detail="Attachment not found")

    if attachment.local_path and attachment.local_path.startswith("http"):
        try:
            filename = attachment.local_path.split("/")[-1]
            r2 = get_r2()
            r2.delete_object(Bucket=os.getenv("R2_BUCKET_NAME"), Key=filename)
        except Exception as e:
            print(f"R2 delete error: {e}")

    db.delete(attachment)
    db.commit()
    return {"message": "Attachment deleted"}

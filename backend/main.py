import os
import re
import uuid
import tempfile
import base64
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

VIDEO_PLATFORMS = [
    'youtube.com', 'youtu.be',
    'instagram.com', 'instagr.am',
    'tiktok.com', 'vm.tiktok.com',
    'twitter.com', 'x.com', 't.co',
    'vimeo.com', 'twitch.tv',
    'reddit.com', 'facebook.com', 'fb.com',
    'dailymotion.com', 'ok.ru', 'vk.com',
]

def is_video_url(url: str) -> bool:
    lower = url.lower()
    return any(p in lower for p in VIDEO_PLATFORMS)

MAX_DURATION_SECONDS = 600   # 10 minutes
MAX_FILESIZE_BYTES = 150 * 1024 * 1024  # 150 MB

# yt-dlp options that help bypass YouTube bot detection
YDL_BASE_OPTS = {
    'quiet': False,
    'no_warnings': False,
    'extractor_args': {
        'youtube': {
            'player_client': ['web', 'android', 'tv_embedded'],
        }
    },
}

def _cookie_file():
    """Write YOUTUBE_COOKIES env var (base64) to a temp file, return path or None."""
    raw = os.getenv("YOUTUBE_COOKIES")
    if not raw:
        return None
    try:
        content = base64.b64decode(raw).decode('utf-8')
        f = tempfile.NamedTemporaryFile(mode='w', suffix='.txt', delete=False)
        f.write(content)
        f.flush()
        f.close()
        return f.name
    except Exception as e:
        print(f"Cookie file error: {e}")
        return None

def download_video(attachment_id: int, url: str):
    db = database.SessionLocal()
    attachment = db.query(models.Attachment).filter(models.Attachment.id == attachment_id).first()
    if not attachment:
        db.close()
        return

    attachment.status = "downloading"
    db.commit()

    cookie_path = _cookie_file()

    def make_opts(extra: dict) -> dict:
        opts = {**YDL_BASE_OPTS, **extra}
        if cookie_path:
            opts['cookiefile'] = cookie_path
        return opts

    # Check duration before downloading
    try:
        with yt_dlp.YoutubeDL(make_opts({'quiet': True, 'no_warnings': True})) as ydl:
            info = ydl.extract_info(url, download=False)
            duration = info.get('duration') or 0
            print(f"Video duration: {duration}s")
            if duration > MAX_DURATION_SECONDS:
                print(f"Too long ({duration}s), skipping")
                attachment.status = "too_long"
                db.commit()
                db.close()
                if cookie_path:
                    os.remove(cookie_path)
                return
    except Exception as e:
        print(f"Could not check duration, proceeding: {e}")

    filename = f"{uuid.uuid4()}.mp4"

    try:
        with tempfile.TemporaryDirectory() as tmpdir:
            ydl_opts = make_opts({
                'format': 'best[height<=480][ext=mp4]/best[height<=480]/bestvideo[height<=480]+bestaudio/best',
                'outtmpl': os.path.join(tmpdir, 'video.%(ext)s'),
                'merge_output_format': 'mp4',
                'max_filesize': MAX_FILESIZE_BYTES,
            })

            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                ydl.download([url])

            files = [f for f in os.listdir(tmpdir)
                     if os.path.isfile(os.path.join(tmpdir, f)) and not f.endswith('.part')]
            if not files:
                raise Exception("No file found after download")

            actual_path = os.path.join(tmpdir, files[0])
            filesize = os.path.getsize(actual_path)
            print(f"Downloaded: {files[0]}, size: {filesize} bytes")

            if filesize == 0:
                raise Exception("Downloaded file is empty")

            r2 = get_r2()
            r2.upload_file(actual_path, os.getenv("R2_BUCKET_NAME"), filename,
                           ExtraArgs={"ContentType": "video/mp4"})
            print(f"Uploaded to R2: {filename}")

        attachment.local_path = f"{os.getenv('R2_PUBLIC_URL')}/{filename}"
        attachment.status = "completed"
    except Exception as e:
        print(f"Error downloading {url}: {e}")
        attachment.status = "failed"
    finally:
        if cookie_path and os.path.exists(cookie_path):
            os.remove(cookie_path)

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
    if db_cat and db_cat.name != note_data.title:
        name_taken = db.query(models.Category).filter(
            models.Category.name == note_data.title,
            models.Category.id != note_data.category_id
        ).first()
        if not name_taken:
            db_cat.name = note_data.title

    db.commit()
    db.refresh(db_note)

    raw_urls = re.findall(r'https?://[^\s\n\r\t]+', note_data.content)
    normalized_urls = list(dict.fromkeys(u.rstrip('.,;!?)') for u in raw_urls))

    existing_att = {a.original_url: a for a in db_note.attachments}
    for url in normalized_urls:
        if not is_video_url(url):
            continue
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

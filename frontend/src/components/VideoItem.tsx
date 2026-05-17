import React from 'react';
import type { Attachment } from '../api';

interface VideoItemProps {
  attachment: Attachment;
  onDelete: (id: number, url: string) => void;
}

export const VideoItem = React.memo(({ attachment, onDelete }: VideoItemProps) => (
  <div className="ios-video-card">
    <div className="ios-video-header">
      <span className="ios-video-url">{attachment.original_url}</span>
      <button className="ios-video-delete" onClick={() => onDelete(attachment.id, attachment.original_url)}>×</button>
    </div>
    <div className="ios-video-body">
      {attachment.status === 'completed' && attachment.local_path ? (
        <video controls playsInline className="ios-video-element">
          <source src={attachment.local_path} type="video/mp4" />
        </video>
      ) : (
        <div className="ios-video-loading">
          <div className="ios-spinner" />
          <span>{attachment.status === 'failed' ? 'Ошибка' : 'Загрузка видео...'}</span>
        </div>
      )}
    </div>
  </div>
));

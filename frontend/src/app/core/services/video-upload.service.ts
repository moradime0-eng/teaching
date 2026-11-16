/**
 * 📤 Video Upload Service — Backend Proxy Upload
 *
 * ✅ FIX: متد refreshPlaybackUrl برای تمدید URL بدون بار اضافی
 */

import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, interval, takeWhile, switchMap } from 'rxjs';
import { environment } from '../../../environments/environment.development';

// ─── انواع داده ───

export type UploadStatus = 'INITIALIZING' | 'UPLOADING' | 'PROCESSING' | 'READY' | 'FAILED';

export interface UploadProgressEvent {
  type: 'progress' | 'success' | 'error' | 'status';
  progress?: number;
  status?: UploadStatus;
  url?: string;
  error?: string;
  key?: string;
  uploadId?: string;
}

export interface ProcessingStatus {
  status: UploadStatus;
  progress: number;
  error?: string;
  hls?: {
    masterPlaylist: string;
    qualities: string[];
  };
  thumbnails?: string[];
}

// ─── ثابت‌ها ───
const CHUNK_SIZE = 50 * 1024 * 1024; // 50MB per chunk
const MULTIPART_THRESHOLD = 100 * 1024 * 1024; // 100MB
const POLL_INTERVAL = 10000; // 10 ثانیه

// ─── شناسایی خودکار مدت زمان ویدیو ───
function detectVideoDuration(file: File): Promise<number> {
  return new Promise((resolve) => {
    if (!file.type.startsWith('video/')) {
      resolve(0);
      return;
    }
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(video.src);
      resolve(Math.round(video.duration));
    };
    video.onerror = () => {
      URL.revokeObjectURL(video.src);
      resolve(0);
    };
    video.src = URL.createObjectURL(file);
  });
}

// ─── شناسایی خودکار مدت زمان فایل صوتی ───
function detectAudioDuration(file: File): Promise<number> {
  return new Promise((resolve) => {
    if (!file.type.startsWith('audio/')) {
      resolve(0);
      return;
    }
    const audio = document.createElement('audio');
    audio.preload = 'metadata';
    audio.onloadedmetadata = () => {
      URL.revokeObjectURL(audio.src);
      resolve(Math.round(audio.duration));
    };
    audio.onerror = () => {
      URL.revokeObjectURL(audio.src);
      resolve(0);
    };
    audio.src = URL.createObjectURL(file);
  });
}

// ─── کلاس اصلی سرویس ───
@Injectable({
  providedIn: 'root'
})
export class VideoUploadService {

  private http = inject(HttpClient);
  private apiUrl = `${environment.apiUrl}/upload`;
  private abortControllers = new Map<string, AbortController>();

  /**
   * ⭐ FIX: پارامتر contentItemId اضافه شد
   * اگر contentItemId مشخص باشد، بک‌اند storage.key را در contentItem مربوطه ذخیره می‌کند
   */
  uploadVideo(
    file: File,
    lectureId: string | null,
    courseId: string | null,
    type: 'lecture-video' | 'promo-video' | 'resource' | 'audio' = 'lecture-video',
    onProgress?: (event: UploadProgressEvent) => void,
    abortSignal?: AbortSignal,
    contentItemId?: string | null,   // ⭐ آخر از همه
  ): Promise<{ url: string; key: string; duration: number }> {
    return new Promise(async (resolve, reject) => {
      const uploadId = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
      const abortController = new AbortController();
      this.abortControllers.set(uploadId, abortController);

      if (abortSignal) {
        abortSignal.addEventListener('abort', () => abortController.abort());
      }

      try {
        onProgress?.({ type: 'status', status: 'INITIALIZING' });
        const duration = file.type.startsWith('audio/')
          ? await detectAudioDuration(file)
          : await detectVideoDuration(file);

        if (file.size < MULTIPART_THRESHOLD) {
          const result = await this.uploadSingle(
            file, type, onProgress, abortController.signal,
            lectureId, courseId, duration, contentItemId,
          );
          onProgress?.({ type: 'status', status: 'READY' });
          onProgress?.({ type: 'success', url: result.url, key: result.key });
          resolve({ ...result, duration });
        } else {
          const result = await this.uploadMultipart(file, type, onProgress, abortController.signal);
          onProgress?.({ type: 'status', status: 'PROCESSING' });
          onProgress?.({ type: 'success', url: result.url, key: result.key });
          resolve({ ...result, duration });
        }
      } catch (error: any) {
        if (error.name === 'AbortError') {
          onProgress?.({ type: 'error', error: 'آپلود لغو شد' });
          reject(new Error('آپلود لغو شد'));
        } else {
          const errorMessage = error.message || 'خطا در آپلود فایل';
          onProgress?.({ type: 'error', error: errorMessage });
          reject(new Error(errorMessage));
        }
      } finally {
        this.abortControllers.delete(uploadId);
      }
    });
  }

  private async uploadSingle(
    file: File,
    type: string,
    onProgress?: (event: UploadProgressEvent) => void,
    abortSignal?: AbortSignal,
    lectureId?: string | null,
    courseId?: string | null,
    duration?: number,
    contentItemId?: string | null,   // ⭐ آخر
  ): Promise<{ url: string; key: string }> {
    return new Promise((resolve, reject) => {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('folder', this.getFolder(type));
      let uploadType = 'resource';
      if (type === 'lecture-video' || type === 'promo-video') {
        uploadType = 'video';
      } else if (type === 'audio') {
        uploadType = 'audio';
      }
      formData.append('type', uploadType);
      if (lectureId) formData.append('lectureId', lectureId);
      if (courseId) formData.append('courseId', courseId);
      if (contentItemId) formData.append('contentItemId', contentItemId);
      if (duration) formData.append('duration', String(duration));

      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${this.apiUrl}/proxy`, true);
      xhr.withCredentials = true;

      const token = localStorage.getItem('auth_token');
      if (token) {
        xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      }

      xhr.upload.addEventListener('progress', (event) => {
        if (event.lengthComputable) {
          const progress = Math.round((event.loaded / event.total) * 100);
          onProgress?.({ type: 'progress', progress });
        }
      });

      xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const response = JSON.parse(xhr.responseText);
            if (response.success && response.data) {
              resolve({ url: response.data.url, key: response.data.key });
            } else {
              reject(new Error(response.message || 'خطا در آپلود فایل'));
            }
          } catch {
            reject(new Error('خطا در پردازش پاسخ سرور'));
          }
        } else {
          try {
            const error = JSON.parse(xhr.responseText);
            reject(new Error(error.message || `خطا در آپلود: ${xhr.status}`));
          } catch {
            reject(new Error(`خطا در آپلود: ${xhr.status} ${xhr.statusText}`));
          }
        }
      });

      xhr.addEventListener('error', () => reject(new Error('خطای شبکه در آپلود')));
      xhr.addEventListener('abort', () => reject(new DOMException('آپلود لغو شد', 'AbortError')));

      if (abortSignal) {
        abortSignal.addEventListener('abort', () => xhr.abort());
      }

      xhr.send(formData);
    });
  }

  private async uploadMultipart(
    file: File,
    type: string,
    onProgress?: (event: UploadProgressEvent) => void,
    abortSignal?: AbortSignal,
  ): Promise<{ url: string; key: string }> {
    return new Promise(async (resolve, reject) => {
      try {
        onProgress?.({ type: 'status', status: 'INITIALIZING' });

        let uploadType = 'resource';
        if (type === 'lecture-video' || type === 'promo-video') {
          uploadType = 'video';
        } else if (type === 'audio') {
          uploadType = 'audio';
        }

        // Step 1: Initiate multipart upload
        const initResponse = await this.http.post<{ uploadId: string; key: string; partUrls: { partNumber: number; url: string }[]; totalParts: number }>(
          `${this.apiUrl}/multipart/init`,
          {
            fileName: file.name,
            contentType: file.type,
            folder: this.getFolder(type),
            totalSize: file.size,
            partSize: CHUNK_SIZE,
            type: uploadType,
          }
        ).toPromise();

        if (!initResponse || !initResponse.uploadId || !initResponse.key || !initResponse.partUrls) {
          throw new Error('خطا در آغاز آپلود چندبخشی');
        }

        const { uploadId, key, partUrls, totalParts } = initResponse;
        const parts: { ETag: string; PartNumber: number }[] = [];

        for (let i = 0; i < totalParts; i++) {
          if (abortSignal?.aborted) {
            await this.http.post(`${this.apiUrl}/multipart/abort`, { key, uploadId }).toPromise();
            throw new DOMException('آپلود لغو شد', 'AbortError');
          }

          const start = i * CHUNK_SIZE;
          const end = Math.min(start + CHUNK_SIZE, file.size);
          const chunk = file.slice(start, end);

          const partUrl = partUrls[i].url;
          const partNumber = partUrls[i].partNumber;

          await this.uploadPartToS3(chunk, partUrl, partNumber, (progress) => {
            const chunkProgress = progress * (end - start);
            const totalProgress = Math.round(((i * CHUNK_SIZE + chunkProgress) / file.size) * 100);
            onProgress?.({ type: 'progress', progress: Math.min(totalProgress, 99) });
          }, abortSignal);

          parts.push({ ETag: '', PartNumber: partNumber });
        }

        onProgress?.({ type: 'status', status: 'PROCESSING' });
        const completeResponse = await this.http.post<{ url: string; key: string }>(
          `${this.apiUrl}/multipart/complete`,
          { key, uploadId, parts }
        ).toPromise();

        if (!completeResponse || !completeResponse.url || !completeResponse.key) {
          throw new Error('خطا در تکمیل آپلود چندبخشی');
        }

        onProgress?.({ type: 'progress', progress: 100 });
        resolve({ url: completeResponse.url, key: completeResponse.key });
      } catch (error: any) {
        if (error.name === 'AbortError') {
          onProgress?.({ type: 'error', error: 'آپلود لغو شد' });
          reject(new Error('آپلود لغو شد'));
        } else {
          const errorMessage = error.message || 'خطا در آپلود چندبخشی';
          onProgress?.({ type: 'error', error: errorMessage });
          reject(new Error(errorMessage));
        }
      }
    });
  }

  private async uploadPartToS3(
    chunk: Blob,
    partUrl: string,
    partNumber: number,
    onProgress?: (progress: number) => void,
    abortSignal?: AbortSignal
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('PUT', partUrl, true);

      xhr.upload.addEventListener('progress', (event) => {
        if (event.lengthComputable) {
          onProgress?.(event.loaded / event.total);
        }
      });

      xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          const etag = xhr.getResponseHeader('ETag') || '';
          resolve(etag);
        } else {
          reject(new Error(`خطا در آپلود بخش ${partNumber}: ${xhr.status}`));
        }
      });

      xhr.addEventListener('error', () => reject(new Error('خطای شبکه در آپلود بخش')));
      xhr.addEventListener('abort', () => reject(new DOMException('آپلود لغو شد', 'AbortError')));

      if (abortSignal) {
        abortSignal.addEventListener('abort', () => xhr.abort());
      }

      xhr.send(chunk);
    });
  }

  private uploadSingleChunk(
    chunk: File,
    type: string,
    onProgress?: (event: number) => void,
    abortSignal?: AbortSignal,
  ): Promise<{ url: string; key: string }> {
    return new Promise((resolve, reject) => {
      const formData = new FormData();
      formData.append('file', chunk);
      formData.append('folder', this.getFolder(type));
      let uploadType = 'resource';
      if (type === 'lecture-video' || type === 'promo-video') {
        uploadType = 'video';
      } else if (type === 'audio') {
        uploadType = 'audio';
      }
      formData.append('type', uploadType);

      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${this.apiUrl}/proxy`, true);
      xhr.withCredentials = true;

      const token = localStorage.getItem('auth_token');
      if (token) {
        xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      }

      xhr.upload.addEventListener('progress', (event) => {
        if (event.lengthComputable) {
          onProgress?.(event.loaded / event.total);
        }
      });

      xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const response = JSON.parse(xhr.responseText);
            if (response.success && response.data) {
              resolve({ url: response.data.url, key: response.data.key });
            } else {
              reject(new Error(response.message || 'خطا در آپلود chunk'));
            }
          } catch {
            reject(new Error('خطا در پردازش پاسخ سرور'));
          }
        } else {
          reject(new Error(`خطا در آپلود chunk: ${xhr.status}`));
        }
      });

      xhr.addEventListener('error', () => reject(new Error('خطای شبکه در آپلود chunk')));
      xhr.addEventListener('abort', () => reject(new DOMException('آپلود لغو شد', 'AbortError')));

      if (abortSignal) {
        abortSignal.addEventListener('abort', () => xhr.abort());
      }

      xhr.send(formData);
    });
  }

  checkProcessingStatus(lectureId: string): Observable<ProcessingStatus> {
    return interval(POLL_INTERVAL).pipe(
      switchMap(() =>
        this.http.get<ProcessingStatus>(`${this.apiUrl}/status/${lectureId}`),
      ),
      takeWhile(
        (status) => status.status !== 'READY' && status.status !== 'FAILED',
        true,
      ),
    );
  }

  getPlaybackUrl(lectureId: string, resourceId?: string): Observable<any> {
    const params = resourceId ? `?resourceId=${resourceId}` : '';
    return this.http.get<any>(`${this.apiUrl}/playback/${lectureId}${params}`);
  }

  refreshPlaybackUrl(lectureId: string, resourceId?: string): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/refresh-url`, { lectureId, resourceId });
  }

  cancelUpload(uploadId: string): void {
    const controller = this.abortControllers.get(uploadId);
    if (controller) {
      controller.abort();
      this.abortControllers.delete(uploadId);
    }
  }

  private getFolder(type: string): string {
    const folderMap: Record<string, string> = {
      'lecture-video': 'lectures',
      'promo-video': 'videos',
      resource: 'resources',
      audio: 'audio',
    };
    return folderMap[type] || 'uploads';
  }
}
import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, from, switchMap } from 'rxjs';
import { environment } from '../../../environments/environment.development';
import { ApiResponse } from '../models/api-response.model';

export interface UploadSignature {
  timestamp: number;
  signature: string;
  api_key: string;
  cloud_name: string;
  folder: string;
  resource_type: string;
  expiration: number;
}

export interface UploadProgressEvent {
  type: 'progress' | 'success' | 'error';
  progress?: number;
  url?: string;
  publicId?: string;
  error?: any;
}

@Injectable({ providedIn: 'root' })
export class UploadService {
  private http = inject(HttpClient);
  private apiUrl = environment.apiUrl;

  /**
   * Get a signed upload signature from the backend.
   */
  getUploadSignature(
    folder: string,
    resourceType: 'image' | 'video' | 'raw' | 'auto' = 'auto'
  ): Observable<ApiResponse<UploadSignature>> {
    return this.http.post<ApiResponse<UploadSignature>>(`${this.apiUrl}/upload/signature`, {
      folder,
      resourceType,
    });
  }

  /**
   * Upload a file directly to Cloudinary using signed params.
   * Returns an observable that emits progress events and a final success/error.
   */
  uploadDirectly(
    file: File,
    signature: UploadSignature,
    folder: string
  ): Observable<UploadProgressEvent> {
    return new Observable<UploadProgressEvent>((observer) => {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('api_key', signature.api_key);
      formData.append('timestamp', signature.timestamp.toString());
      formData.append('signature', signature.signature);
      formData.append('folder', signature.folder);
      formData.append('resource_type', signature.resource_type);

      const xhr = new XMLHttpRequest();
      xhr.open('POST', `https://api.cloudinary.com/v1_1/${signature.cloud_name}/${signature.resource_type}/upload`);

      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          const progress = Math.round((event.loaded / event.total) * 100);
          observer.next({ type: 'progress', progress });
        }
      };

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          const response = JSON.parse(xhr.responseText);
          observer.next({
            type: 'success',
            url: response.secure_url,
            publicId: response.public_id,
          });
          observer.complete();
        } else {
          const error = JSON.parse(xhr.responseText);
          observer.next({ type: 'error', error });
          observer.error(error);
        }
      };

      xhr.onerror = () => {
        observer.next({ type: 'error', error: new Error('Network error during upload') });
        observer.error(new Error('Network error during upload'));
      };

      xhr.send(formData);

      // Cleanup on unsubscribe
      return () => {
        xhr.abort();
      };
    });
  }

  /**
   * Confirm a direct upload by saving metadata to the backend.
   */
  confirmUpload(data: {
    lectureId: string;
    field: string;
    url: string;
    publicId?: string;
    fileName?: string;
    fileSize?: number;
    duration?: number;
  }): Observable<ApiResponse<any>> {
    return this.http.post<ApiResponse<any>>(`${this.apiUrl}/upload/confirm`, data);
  }

  /**
   * Get a signed URL for accessing a video (enrollment check).
   */
  getSignedVideoUrl(lectureId: string): Observable<ApiResponse<{ url: string; expiresIn: number }>> {
    return this.http.get<ApiResponse<{ url: string; expiresIn: number }>>(
      `${this.apiUrl}/upload/video-url/${lectureId}`
    );
  }

  /**
   * Get a signed URL for downloading a resource.
   */
  getSignedResourceUrl(lectureId: string, resourceIndex: number): Observable<ApiResponse<{ url: string; expiresIn: number }>> {
    return this.http.get<ApiResponse<{ url: string; expiresIn: number }>>(
      `${this.apiUrl}/upload/resource-url/${lectureId}/${resourceIndex}`
    );
  }
}

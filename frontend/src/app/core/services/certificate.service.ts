import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from './api.service';
import { ApiResponse } from '../models/api-response.model';

@Injectable({ providedIn: 'root' })
export class CertificateService {
  constructor(private api: ApiService) {}

  getMyCertificates(): Observable<ApiResponse<any[]>> {
    return this.api.get<any[]>('/certificates');
  }

  verifyCertificate(certificateNumber: string): Observable<ApiResponse<any>> {
    return this.api.get<any>(`/certificates/verify/${certificateNumber}`);
  }
}

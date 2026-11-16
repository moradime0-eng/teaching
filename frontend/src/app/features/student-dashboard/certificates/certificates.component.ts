import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { CertificateService } from '../../../core/services/certificate.service';
import { JalaliDatePipe } from '../../../shared/pipes/jalali-date.pipe';

@Component({
  selector: 'app-certificates',
  standalone: true,
  imports: [CommonModule, RouterModule, MatIconModule, JalaliDatePipe],
  templateUrl: './certificates.component.html',
  styleUrl: './certificates.component.scss',
})
export class CertificatesComponent implements OnInit {
  certificates = signal<any[]>([]);

  constructor(private certificateService: CertificateService) {}

  ngOnInit(): void {
    this.certificateService.getMyCertificates().subscribe({
      next: (res) => {
        if (res.success && res.data) {
          this.certificates.set(res.data);
        }
      },
    });
  }
}
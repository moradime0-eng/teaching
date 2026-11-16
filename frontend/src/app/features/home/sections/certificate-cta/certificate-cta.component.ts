import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-certificate-cta',
  standalone: true,
  imports: [CommonModule, RouterModule, MatIconModule],
  templateUrl: './certificate-cta.component.html',
  styleUrl: './certificate-cta.component.scss',
})
export class CertificateCtaComponent {}

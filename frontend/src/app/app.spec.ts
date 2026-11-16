import { provideZonelessChangeDetection } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { TestBed } from '@angular/core/testing';
import { AppComponent } from './app';
describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AppComponent],
      // ⚠️ FIX: AppComponent به HttpClient (سرویس TenantService) و ActivatedRoute
      // (به‌خاطر routerLink در قالب) نیاز دارد. بدون این‌ها خطای NG0201 رخ می‌داد.
      // همچنین برای انیمیشن‌ها provideNoopAnimations لازم است.
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        provideNoopAnimations(),
      ],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('should render the brand name in the toolbar', () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    // قالب برند پروژه را نشان می‌دهد (نه متن پیش‌فرض Angular)
    expect(compiled.textContent).toContain('آموزشگاه همایون');
  });
});

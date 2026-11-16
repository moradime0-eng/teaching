import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { loadingInterceptor, loadingState } from './loading.interceptor';

describe('global loading indicator', () => {
  let http: HttpClient;
  let backend: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [
      provideHttpClient(withInterceptors([loadingInterceptor])), provideHttpClientTesting(),
    ] });
    http = TestBed.inject(HttpClient);
    backend = TestBed.inject(HttpTestingController);
  });
  afterEach(() => backend.verify());
  it('tracks concurrent requests until each one completes', fakeAsync(() => {
    http.get('/a').subscribe(); http.get('/b').subscribe(); tick(0);
    expect(loadingState.value).toBeTrue();
    backend.expectOne('/a').flush({}); tick(0);
    expect(loadingState.value).toBeTrue();
    backend.expectOne('/b').flush({}); tick(0);
    expect(loadingState.value).toBeFalse();
  }));
  it('stops displaying a stuck request without cancelling it', fakeAsync(() => {
    let completed = false;
    http.get('/slow').subscribe(() => completed = true);
    const pending = backend.expectOne('/slow'); tick(0);
    expect(loadingState.value).toBeTrue();
    tick(15000); tick(0);
    expect(loadingState.value).toBeFalse();
    pending.flush({}); tick(0);
    expect(completed).toBeTrue();
  }));
  it('releases cancelled requests', fakeAsync(() => {
    const subscription = http.get('/cancel').subscribe();
    const pending = backend.expectOne('/cancel'); tick(0);
    subscription.unsubscribe(); tick(0);
    expect(pending.cancelled).toBeTrue();
    expect(loadingState.value).toBeFalse();
  }));
});

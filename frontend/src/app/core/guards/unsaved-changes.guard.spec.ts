import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, RouterStateSnapshot } from '@angular/router';
import { unsavedChangesGuard } from './unsaved-changes.guard';
import { CourseBuilderComponent } from '../../features/instructor/course-builder/course-builder.component';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { MatDialogModule } from '@angular/material/dialog';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { RouterTestingModule } from '@angular/router/testing';
import { HttpClientTestingModule } from '@angular/common/http/testing';

describe('unsavedChangesGuard', () => {
  let component: CourseBuilderComponent;
  let fixture: any;
  let fb: FormBuilder;

  // Replace the dummy objects and executeGuard definition with this:
  const dummyRoute = {} as ActivatedRouteSnapshot;
  const dummyState = {} as RouterStateSnapshot;


  const resolveGuardResult = (result: any): boolean => {
    if (result && typeof result.subscribe === 'function') {
      let value = false;
      const sub = result.subscribe((v: boolean) => {
        value = v;
      });
      if (sub && typeof sub.unsubscribe === 'function') sub.unsubscribe();
      return value;
    }
    if (result instanceof Promise) {
      // برای Promise نمی‌توان sync منتظر ماند؛ در این guard استفاده نمی‌شود
      throw new Error('Guard returned a Promise; test must be async.');
    }
    return result as boolean;
  };

  const executeGuard = (
    comp: CourseBuilderComponent,
    currentRoute: ActivatedRouteSnapshot = dummyRoute,
    currentState: RouterStateSnapshot = dummyState,
    nextState: RouterStateSnapshot = dummyState,
  ): boolean =>
    resolveGuardResult(
      TestBed.runInInjectionContext(() =>
        unsavedChangesGuard(comp, currentRoute, currentState, nextState),
      ),
    );
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [
        ReactiveFormsModule,
        MatDialogModule,
        NoopAnimationsModule,
        RouterTestingModule,
        HttpClientTestingModule,
        CourseBuilderComponent,
      ],
      providers: [FormBuilder],
    });

    fb = TestBed.inject(FormBuilder);
    fixture = TestBed.createComponent(CourseBuilderComponent);
    component = fixture.componentInstance;
    (component as any).initForms?.();
    fixture.detectChanges();
  });

  it('should return true when all forms are pristine', () => {
    // All forms are pristine by default after initForms
    expect(component.basicForm.pristine).toBeTrue();
    expect(component.mediaForm.pristine).toBeTrue();
    expect(component.curriculumForm.pristine).toBeTrue();
    expect(component.pricingForm.pristine).toBeTrue();
    expect(component.seoForm.pristine).toBeTrue();

    const result = executeGuard(component);
    expect(result).toBeTrue();
  });

  it('should return false when basicForm is dirty and user cancels', () => {
    component.basicForm.get('title')?.setValue('New Title');
    component.basicForm.markAsDirty();
    expect(component.basicForm.dirty).toBeTrue();

    // Mock confirm to return false (user cancels)
    spyOn(window, 'confirm').and.returnValue(false);

    const result = executeGuard(component);
    expect(result).toBeFalse();
    expect(window.confirm).toHaveBeenCalledWith(
      'شما تغییرات ذخیره نشده‌ای دارید. آیا مطمئن هستید که می‌خواهید از این صفحه خارج شوید؟',
    );
  });

  it('should return true when basicForm is dirty and user confirms', () => {
    component.basicForm.get('title')?.setValue('New Title');
    component.basicForm.markAsDirty();
    expect(component.basicForm.dirty).toBeTrue();

    // Mock confirm to return true (user confirms)
    spyOn(window, 'confirm').and.returnValue(true);

    const result = executeGuard(component);
    expect(result).toBeTrue();
    expect(window.confirm).toHaveBeenCalled();
  });

  it('should return false when mediaForm is dirty and user cancels', () => {
    component.mediaForm.get('thumbnailUrl')?.setValue('test.jpg');
    component.mediaForm.markAsDirty();
    expect(component.mediaForm.dirty).toBeTrue();

    spyOn(window, 'confirm').and.returnValue(false);

    const result = executeGuard(component);
    expect(result).toBeFalse();
  });

  it('should return false when curriculumForm is dirty and user cancels', () => {
    component.sections.push(
      fb.group({
        title: ['Section 1'],
        description: '',
        lectures: fb.array([]),
      }),
    );
    component.curriculumForm.markAsDirty();
    expect(component.curriculumForm.dirty).toBeTrue();

    spyOn(window, 'confirm').and.returnValue(false);

    const result = executeGuard(component);
    expect(result).toBeFalse();
  });

  it('should return false when pricingForm is dirty and user cancels', () => {
    component.pricingForm.get('price')?.setValue(100000);
    component.pricingForm.markAsDirty();
    expect(component.pricingForm.dirty).toBeTrue();

    spyOn(window, 'confirm').and.returnValue(false);

    const result = executeGuard(component);
    expect(result).toBeFalse();
  });

  it('should return false when seoForm is dirty and user cancels', () => {
    component.seoForm.get('metaTitle')?.setValue('Meta Title');
    component.seoForm.markAsDirty();
    expect(component.seoForm.dirty).toBeTrue();

    spyOn(window, 'confirm').and.returnValue(false);

    const result = executeGuard(component);
    expect(result).toBeFalse();
  });

  it('should return true when any form is dirty but user confirms', () => {
    component.basicForm.get('title')?.setValue('New Title');
    component.mediaForm.get('thumbnailUrl')?.setValue('test.jpg');
    component.pricingForm.get('price')?.setValue(100000);

    spyOn(window, 'confirm').and.returnValue(true);

    const result = executeGuard(component);
    expect(result).toBeTrue();
  });
});

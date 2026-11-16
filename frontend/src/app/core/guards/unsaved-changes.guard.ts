import { CanDeactivateFn } from '@angular/router';
import { inject } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { Observable, of } from 'rxjs';
import { CourseBuilderComponent } from '../../features/instructor/course-builder/course-builder.component';

export interface CanComponentDeactivate {
  canDeactivate: () => Observable<boolean> | Promise<boolean> | boolean;
}

export const unsavedChangesGuard: CanDeactivateFn<CourseBuilderComponent> = (
  component: CourseBuilderComponent,
): Observable<boolean> | Promise<boolean> | boolean => {
  // Check if any form is dirty
  const basicFormDirty = component.basicForm?.dirty ?? false;
  const mediaFormDirty = component.mediaForm?.dirty ?? false;
  const curriculumFormDirty = component.curriculumForm?.dirty ?? false;
  const pricingFormDirty = component.pricingForm?.dirty ?? false;
  const seoFormDirty = component.seoForm?.dirty ?? false;

  const isDirty =
    basicFormDirty || mediaFormDirty || curriculumFormDirty || pricingFormDirty || seoFormDirty;

  if (!isDirty) {
    return true;
  }

  // Show confirmation dialog
  const dialog = inject(MatDialog);
  const confirmed = confirm(
    'شما تغییرات ذخیره نشده‌ای دارید. آیا مطمئن هستید که می‌خواهید از این صفحه خارج شوید؟',
  );

  return of(confirmed);
};

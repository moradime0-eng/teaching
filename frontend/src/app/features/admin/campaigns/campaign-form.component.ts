import { Component, OnInit, inject, signal, OnDestroy, PLATFORM_ID, computed } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { Router, ActivatedRoute, RouterModule } from '@angular/router';
import {
  FormBuilder,
  FormGroup,
  FormControl,
  Validators,
  ReactiveFormsModule,
  FormsModule,
  AbstractControl,
  ValidationErrors,
} from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatRadioModule } from '@angular/material/radio';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatDateFormats, MAT_DATE_FORMATS, MAT_DATE_LOCALE } from '@angular/material/core';
import { MatChipsModule } from '@angular/material/chips';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { Observable, Subscription, map, startWith } from 'rxjs';
import { ApiService } from '../../../core/services/api.service';
import { CourseService } from '../../../core/services/course.service';
import { Category } from '../../../core/models/category.model';
import { Campaign, CampaignColors, CampaignTheme } from '../../../core/models/campaign.model';
import { CampaignColorPickerComponent } from '../../../shared/components/campaign-color-picker/campaign-color-picker.component';
import { averageColor, buildGradient, readableTextColor } from '../../../core/utils/color.utils';
import { ToastService } from '../../../core/services/toast.service';
import { ConfirmModalComponent } from '../../../shared/components/confirm-modal/confirm-modal.component';
import { JalaliDatePipe } from '../../../shared/pipes/jalali-date.pipe';
import { provideDateFnsAdapter } from 'ngx-material-date-fns-adapter';
import { faIR } from 'date-fns/locale';

export const JALALI_DATE_FORMATS: MatDateFormats = {
  parse: { dateInput: 'yyyy/MM/dd' },
  display: {
    dateInput: 'yyyy/MM/dd',
    monthYearLabel: 'yyyy MMMM',
    dateA11yLabel: 'yyyy/MM/dd',
    monthYearA11yLabel: 'yyyy MMMM',
  },
};

// Cross-field validator for date range
function dateRangeValidator(control: AbstractControl): ValidationErrors | null {
  const startAt = control.get('startAt')?.value;
  const endAt = control.get('endAt')?.value;
  if (startAt && endAt && new Date(endAt) <= new Date(startAt)) {
    return { dateRange: true };
  }
  return null;
}

// Cross-field validator for categories when scope is 'categories'
function categoriesRequiredValidator(control: AbstractControl): ValidationErrors | null {
  const scope = control.get('scope')?.value;
  const categories = control.get('categories')?.value;
  if (scope === 'categories' && (!categories || categories.length === 0)) {
    return { categoriesRequired: true };
  }
  return null;
}

@Component({
  selector: 'app-campaign-form',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    ReactiveFormsModule,
    FormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatIconModule,
    MatRadioModule,
    MatDatepickerModule,
    MatChipsModule,
    MatAutocompleteModule,
    MatTooltipModule,
    MatProgressSpinnerModule,
    MatSlideToggleModule,
    ConfirmModalComponent,
    JalaliDatePipe,
    CampaignColorPickerComponent,
  ],
  providers: [
    provideDateFnsAdapter(),
    { provide: MAT_DATE_LOCALE, useValue: faIR },
    { provide: MAT_DATE_FORMATS, useValue: JALALI_DATE_FORMATS },
  ],
  templateUrl: './campaign-form.component.html',
  styleUrl: './campaign-form.component.scss',
})
export class CampaignFormComponent implements OnInit, OnDestroy {
  private fb = inject(FormBuilder);
  private api = inject(ApiService);
  private courseService = inject(CourseService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private toast = inject(ToastService);
  private platformId = inject(PLATFORM_ID);

  form: FormGroup;
  isEditMode = signal(false);
  campaignId = signal<string | null>(null);
  isLoading = signal(false);
  isSubmitting = signal(false);
  categories = signal<Category[]>([]);
  filteredCategories!: Observable<Category[]>;
  titleFocused = false;
  bannerFocused = false;
  discountFocused = false;
  maxDiscountFocused = false;
  catSearchFocused = false;

  livePreview = signal<any>({});
  private formSub!: Subscription;
  isBrowser = signal<boolean>(false);
  isFormValid = signal(true);
  isFormDirty = signal(false);

  get isActiveControl(): FormControl {
    return this.form.get('isActive') as FormControl;
  }

  themeOptions: { value: CampaignTheme; label: string; icon: string }[] = [
    { value: 'fire', label: 'آتشین (قرمز/نارنجی)', icon: 'local_fire_department' },
    { value: 'cold', label: 'سرد (آبی/بنفش)', icon: 'ac_unit' },
    { value: 'gold', label: 'طلایی (زرد/طلایی)', icon: 'workspace_premium' },
    { value: 'green', label: 'سبز (طبیعت/موفقیت)', icon: 'eco' },
  ];

  showConfirmLeave = signal(false);
  pendingNavigation = signal<() => void>(() => {});

  constructor() {
    this.form = this.fb.group(
      {
        title: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(100)]],
        bannerText: ['', [Validators.required, Validators.maxLength(300)]],
        startAt: [null, Validators.required],
        endAt: [null, Validators.required],
        discountType: ['percentage', Validators.required],
        discountValue: [null, [Validators.required, Validators.min(1)]],
        maxDiscount: [null, Validators.min(0)],
        scope: ['all', Validators.required],
        categories: [[]],
        excludedCourses: [[]],
        theme: ['fire', Validators.required],
        // 🎨 Custom banner colors (null = use the built-in CSS theme)
        colors: [null],
        isActive: [true],
      },
      { validators: [dateRangeValidator, categoriesRequiredValidator] },
    ); // Cross-field validators

    // Initialize form validity signals
    this.isFormValid.set(this.form.valid);
    this.isFormDirty.set(this.form.dirty);
  }

  ngOnInit(): void {
    this.isBrowser.set(isPlatformBrowser(this.platformId));

    this.courseService.getCategoryTree().subscribe({
      next: (res) => this.categories.set(res.success ? res.data || [] : []),
    });

    const id = this.route.snapshot.paramMap.get('id');
    const duplicateId = this.route.snapshot.queryParamMap.get('duplicate');

    if (id) {
      this.isEditMode.set(true);
      this.campaignId.set(id);
      this.loadCampaign(id);
    } else if (duplicateId) {
      this.loadCampaign(duplicateId, true);
    }

    this.filteredCategories = this.form.get('categories')!.valueChanges.pipe(
      startWith(''),
      map((value) => this._filterCategories(value || '')),
    );

    // Removed circular valueChanges subscriptions - using cross-field validator instead

    this.form.get('scope')?.valueChanges.subscribe((scope) => {
      if (scope === 'all') this.form.get('categories')?.setValue([]);
    });

    this.form.get('discountType')?.valueChanges.subscribe((type) => {
      const dv = this.form.get('discountValue');
      const md = this.form.get('maxDiscount');
      if (type === 'percentage') {
        dv?.setValidators([Validators.required, Validators.min(1), Validators.max(100)]);
        md?.setValidators([Validators.min(0)]);
      } else {
        dv?.setValidators([Validators.required, Validators.min(1)]);
        md?.clearValidators();
      }
      dv?.updateValueAndValidity({ emitEvent: false });
      md?.updateValueAndValidity({ emitEvent: false });
    });

    this.livePreview.set(this.form.getRawValue());
    this.formSub = this.form.valueChanges.subscribe((values) => {
      this.livePreview.set(values);
    });

    // Track form validity changes for button enable/disable
    this.form.statusChanges.subscribe(() => {
      this.isFormValid.set(this.form.valid);
      this.isFormDirty.set(this.form.dirty);
    });
  }

  ngOnDestroy(): void {
    if (this.formSub) this.formSub.unsubscribe();
  }

  private _filterCategories(value: string | Category[]): Category[] {
    if (Array.isArray(value)) return this.categories();
    const filterValue = (value || '').toLowerCase();
    return this.categories().filter((cat) => cat.name.toLowerCase().includes(filterValue));
  }

  loadCampaign(id: string, isDuplicate = false): void {
    this.isLoading.set(true);
    this.api.get<Campaign>(`/campaigns/${id}`).subscribe({
      next: (res) => {
        if (res.success && res.data) {
          const c = res.data;
          this.form.patchValue({
            title: isDuplicate ? `${c.title} (کپی)` : c.title,
            bannerText: c.bannerText,
            startAt: isDuplicate ? null : new Date(c.startAt),
            endAt: isDuplicate ? null : new Date(c.endAt),
            discountType: c.discountType,
            discountValue: c.discountValue,
            maxDiscount: c.maxDiscount,
            scope: c.scope,
            categories: c.categories || [],
            excludedCourses: c.excludedCourses || [],
            theme: c.theme,
            // 🎨 Custom banner colors
            colors: c.colors ?? null,
            isActive: isDuplicate ? false : c.isActive,
          });
        }
        this.isLoading.set(false);
      },
      error: (err) => {
        this.toast.error('خطا در بارگذاری کمپین');
        this.isLoading.set(false);
        if (!isDuplicate) this.router.navigate(['/admin/campaigns']);
      },
    });
  }

  // Removed dateRangeValidator from here - now a cross-field validator on form group
  // Removed dateFilter - using min attribute on datepicker instead to avoid Jalali adapter conflicts

  displayCategory(cat: Category): string {
    return cat ? cat.name : '';
  }

  addCategory(event: any, searchInput: HTMLInputElement): void {
    const category = event.option.value;
    const current = this.form.get('categories')?.value || [];
    if (!current.some((c: Category) => c._id === category._id)) {
      this.form.get('categories')?.setValue([...current, category]);
    }
    searchInput.value = '';
    this.form.get('categories')?.updateValueAndValidity({ emitEvent: false });
  }

  removeCategory(category: Category): void {
    const current = this.form.get('categories')?.value || [];
    this.form.get('categories')?.setValue(current.filter((c: Category) => c._id !== category._id));
  }

  hasError(controlName: string, errorName: string): boolean {
    const control = this.form.get(controlName);
    // For cross-field errors (dateRange, categoriesRequired), check form-level errors
    if (errorName === 'dateRange' || errorName === 'categoriesRequired') {
      return !!(this.form.hasError(errorName) && (control?.touched || control?.dirty));
    }
    return !!(control?.hasError(errorName) && (control?.touched || control?.dirty));
  }

  setTheme(theme: CampaignTheme): void {
    this.form.get('theme')?.setValue(theme);
    this.form.get('theme')?.markAsDirty();
  }

  // ─── 🎨 Custom colors (from CampaignColorPickerComponent) ───

  onThemePicked(theme: CampaignTheme): void {
    this.form.get('theme')?.setValue(theme);
    this.form.get('theme')?.markAsDirty();
  }

  onColorsPicked(colors: CampaignColors | null): void {
    this.form.get('colors')?.setValue(colors);
    this.form.get('colors')?.markAsDirty();
  }

  getThemeIconPreview(): string {
    const theme = this.livePreview().theme || 'fire';
    return this.themeOptions.find((t) => t.value === theme)?.icon || 'local_fire_department';
  }

  /**
   * 🎨 Inline style for the live preview banner.
   * Mirrors what the real banner component does, so the admin sees
   * exactly the result before saving.
   */
  livePreviewStyle(): Record<string, string> {
    const colors = this.livePreview().colors as CampaignColors | null;
    if (!colors) return {};

    const gradient = (colors.gradient ?? []).filter(Boolean);
    const background = colors.background;
    const angle = colors.gradientAngle ?? 120;

    if (gradient.length >= 2) {
      const avg = averageColor(gradient);
      const text = readableTextColor(avg);
      return {
        '--p-bg': buildGradient(gradient, angle),
        '--p-bg-color': gradient[0],
        '--p-text': text,
      };
    }
    if (background) {
      const text = readableTextColor(background);
      return {
        '--p-bg': `linear-gradient(${angle}deg, ${background} 0%, ${background} 100%)`,
        '--p-bg-color': background,
        '--p-text': text,
      };
    }
    return {};
  }

  onSubmit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.toast.error('لطفاً خطاهای فرم را برطرف کنید');
      return;
    }

    this.isSubmitting.set(true);
    const value = this.form.value;

    // Ensure dates are valid Date objects before converting to ISO string
    const startAt = value.startAt instanceof Date ? value.startAt : new Date(value.startAt);
    const endAt = value.endAt instanceof Date ? value.endAt : new Date(value.endAt);

    // Validate dates are valid
    if (isNaN(startAt.getTime()) || isNaN(endAt.getTime())) {
      this.toast.error('تاریخ‌های وارد شده معتبر نیستند');
      this.isSubmitting.set(false);
      return;
    }

    // Prepare categories - only send IDs when scope is categories
    const categoryIds =
      value.scope === 'categories'
        ? (value.categories || []).map((c: Category) => c._id).filter(Boolean)
        : [];

    // Prepare excluded courses - extract IDs from objects
    const excludedCourseIds = (value.excludedCourses || [])
      .map((c: any) => c._id || c)
      .filter(Boolean);

    // Prepare payload - ensure all fields are properly formatted
    // Build payload dynamically to omit optional fields when not provided
    const payload: any = {
      title: value.title?.trim(),
      bannerText: value.bannerText?.trim(),
      startAt: startAt.toISOString(),
      endAt: endAt.toISOString(),
      discountType: value.discountType,
      discountValue: Number(value.discountValue),
      scope: value.scope,
      theme: value.theme,
      isActive: value.isActive,
    };

    // Only include categories when scope is 'categories' and has values
    if (value.scope === 'categories' && categoryIds.length > 0) {
      payload.categories = categoryIds;
    }

    // Only include excludedCourses when there are values
    if (excludedCourseIds.length > 0) {
      payload.excludedCourses = excludedCourseIds;
    }

    // Only include maxDiscount if it has a valid value (for percentage type)
    if (value.maxDiscount !== null && value.maxDiscount !== undefined && value.maxDiscount !== '') {
      payload.maxDiscount = Number(value.maxDiscount);
    }

    // 🎨 Custom banner colors — only send when the admin picked a custom palette.
    // null → the built-in CSS theme (fire/cold/gold/green) is used.
    const colors = value.colors as CampaignColors | null;
    if (colors) {
      const payloadColors: CampaignColors = {};
      if (colors.background) payloadColors.background = colors.background;
      if (colors.gradient && colors.gradient.length >= 2) {
        payloadColors.gradient = colors.gradient;
      }
      if (colors.gradientAngle !== undefined && colors.gradientAngle !== null) {
        payloadColors.gradientAngle = Number(colors.gradientAngle);
      }
      // Nothing meaningful set → fall back to the theme
      if (Object.keys(payloadColors).length > 0) {
        payload.colors = payloadColors;
      }
    }

    // Debug log
    console.log('Campaign payload:', JSON.stringify(payload, null, 2));

    const request = this.isEditMode()
      ? this.api.put<Campaign>(`/campaigns/${this.campaignId()}`, payload)
      : this.api.post<Campaign>('/campaigns', payload);

    request.subscribe({
      next: (res) => {
        if (res.success) {
          this.toast.success(this.isEditMode() ? 'به‌روزرسانی شد' : 'ایجاد شد');
          this.form.markAsPristine();
          this.router.navigate(['/admin/campaigns']);
        } else {
          this.toast.error(res.message || 'خطا در ذخیره');
        }
        this.isSubmitting.set(false);
      },
      error: (err) => {
        console.error('Campaign save error:', err);
        console.error('Error details:', err?.error);
        console.error('Validation errors:', err?.error?.errors);
        const validationErrors = err?.error?.errors;
        if (validationErrors && Array.isArray(validationErrors) && validationErrors.length > 0) {
          const errorMessages = validationErrors
            .map((e: any) => {
              const msg = e.message || e.msg || e;
              const field = e.path || e.param || e.field || '';
              return field ? `${field}: ${msg}` : msg;
            })
            .join(', ');
          this.toast.error(`خطای اعتبارسنجی: ${errorMessages}`);
        } else {
          this.toast.error(err?.error?.message || 'خطا در ذخیره');
        }
        this.isSubmitting.set(false);
      },
    });
  }

  onCancel(): void {
    if (this.form.dirty) {
      this.showConfirmLeave.set(true);
      this.pendingNavigation.set(() => this.router.navigate(['/admin/campaigns']));
    } else {
      this.router.navigate(['/admin/campaigns']);
    }
  }

  confirmLeave(): void {
    this.showConfirmLeave.set(false);
    this.pendingNavigation()();
  }

  cancelLeave(): void {
    this.showConfirmLeave.set(false);
  }
}

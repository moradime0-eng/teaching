import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../../../core/services/api.service';
import { Category } from '../../../../core/models/category.model';
import { generateSlug } from '../../../../core/utils/slug.util';
import { CategoryIconComponent } from '../../../../shared/components/category-icon/category-icon.component';

export interface CategoryDialogData {
  category?: Category;
  parent?: Category | null;
  categories: Category[];
}

/**
 * 📌 حالت‌های دیالوگ
 * - `create`      : ساخت دستهٔ اصلی (والد قابل انتخاب است)
 * - `create-child`: ساخت زیردسته با والدِ از پیش تعیین‌شده (والد قفل است)
 * - `edit`        : ویرایش دستهٔ موجود
 */
export type CategoryDialogMode = 'create' | 'create-child' | 'edit';

interface IconOption {
  value: string;
  label: string;
  keywords: string[];
}

@Component({
  selector: 'app-category-dialog',
  standalone: true,
  imports: [
    CommonModule,
    MatIconModule,
    MatDialogModule,
    MatSnackBarModule,
    MatTooltipModule,
    FormsModule,
    CategoryIconComponent,
  ],
  templateUrl: './category-dialog.component.html',
  styleUrl: './category-dialog.component.scss',
})
export class CategoryDialogComponent {
  private api = inject(ApiService);
  private dialogRef = inject(MatDialogRef<CategoryDialogComponent>);
  private snackBar = inject(MatSnackBar);
  readonly data: CategoryDialogData = inject(MAT_DIALOG_DATA);

  // ================= State =================
  isSaving = signal(false);
  activeTab = signal<'basic' | 'appearance' | 'advanced'>('basic');
  iconSearchQuery = signal('');
  showIconPicker = signal(false);
  activeIconTab = signal<'material' | 'emoji' | 'upload'>('material');
  isUploadingIcon = signal(false);
  customIconUrlInput = signal('');

  form: {
    name: string;
    slug: string;
    description: string;
    icon: string;
    iconType: 'material' | 'emoji' | 'google' | 'custom';
    customIconUrl: string;
    color: string;
    parent: string | null;
    order: number;
    isActive: boolean;
  };

  // ================= Options =================
  readonly iconOptions: IconOption[] = [
    { value: 'code', label: 'کد', keywords: ['برنامه‌نویسی', 'code', 'developer'] },
    { value: 'psychology', label: 'روانشناسی', keywords: ['ذهن', 'مغز', 'ai'] },
    { value: 'computer', label: 'کامپیوتر', keywords: ['کامپیوتر', 'pc'] },
    { value: 'language', label: 'زبان', keywords: ['زبان', 'ترجمه', 'translate'] },
    { value: 'business', label: 'کسب‌وکار', keywords: ['بیزنس', 'کار'] },
    { value: 'account_balance', label: 'مالی', keywords: ['بانک', 'مالی', 'پول'] },
    { value: 'self_improvement', label: 'توسعه فردی', keywords: ['یوگا', 'مدیتیشن'] },
    { value: 'palette', label: 'طراحی', keywords: ['طراحی', 'رنگ', 'design'] },
    { value: 'engineering', label: 'مهندسی', keywords: ['مهندسی', 'ابزار'] },
    { value: 'science', label: 'علم', keywords: ['علم', 'آزمایش', 'science'] },
    { value: 'child_care', label: 'کودک', keywords: ['کودک', 'بچه'] },
    { value: 'school', label: 'مدرسه', keywords: ['آموزش', 'مدرسه'] },
    { value: 'music_note', label: 'موسیقی', keywords: ['موسیقی', 'آهنگ'] },
    { value: 'brush', label: 'قلم‌مو', keywords: ['نقاشی', 'هنر'] },
    { value: 'trending_up', label: 'رشد', keywords: ['رشد', 'ترند'] },
    { value: 'groups', label: 'گروه', keywords: ['گروه', 'تیم'] },
    { value: 'quiz', label: 'آزمون', keywords: ['کوییز', 'آزمون'] },
    { value: 'article', label: 'مقاله', keywords: ['متن', 'مقاله'] },
    { value: 'speed', label: 'سرعت', keywords: ['سرعت', 'performance'] },
    { value: 'data_exploration', label: 'داده', keywords: ['داده', 'analytics'] },
    { value: 'dataset', label: 'دیتاست', keywords: ['دیتا', 'database'] },
    { value: 'cloud', label: 'ابر', keywords: ['ابر', 'cloud'] },
    { value: 'network_node', label: 'شبکه', keywords: ['شبکه', 'network'] },
    { value: 'security', label: 'امنیت', keywords: ['امنیت', 'security'] },
    { value: 'currency_bitcoin', label: 'ارز دیجیتال', keywords: ['بیت‌کوین', 'crypto'] },
    { value: 'photo_camera', label: 'عکاسی', keywords: ['عکس', 'دوربین'] },
    { value: 'design_services', label: 'خدمات طراحی', keywords: ['طراحی', 'ui'] },
    { value: 'art_track', label: 'آرت', keywords: ['هنر', 'موزیک'] },
    { value: 'auto_stories', label: 'کتاب', keywords: ['کتاب', 'مطالعه'] },
    { value: 'headphones', label: 'هدفون', keywords: ['صدا', 'موسیقی'] },
    { value: 'terminal', label: 'ترمینال', keywords: ['ترمینال', 'کد', 'cli'] },
    { value: 'smartphone', label: 'موبایل', keywords: ['موبایل', 'اپلیکیشن'] },
    { value: 'videogame_asset', label: 'بازی', keywords: ['بازی', 'گیم'] },
    { value: 'fitness_center', label: 'ورزش', keywords: ['ورزش', 'تناسب'] },
    { value: 'restaurant', label: 'آشپزی', keywords: ['آشپزی', 'غذا'] },
    { value: 'flight', label: 'سفر', keywords: ['سفر', 'گردشگری'] },
    { value: 'pets', label: 'حیوانات', keywords: ['حیوان', 'پت'] },
    { value: 'local_hospital', label: 'پزشکی', keywords: ['پزشکی', 'سلامت'] },
    { value: 'gavel', label: 'حقوق', keywords: ['حقوق', 'قانون'] },
    { value: 'translate', label: 'ترجمه', keywords: ['ترجمه', 'زبان'] },
    { value: 'calculate', label: 'ریاضی', keywords: ['ریاضی', 'حساب'] },
    { value: 'biotech', label: 'زیست', keywords: ['زیست', 'علوم'] },
    { value: 'architecture', label: 'معماری', keywords: ['معماری', 'ساختمان'] },
    { value: 'agriculture', label: 'کشاورزی', keywords: ['کشاورزی', 'زراعت'] },
    { value: 'movie', label: 'فیلم', keywords: ['فیلم', 'سینما'] },
    { value: 'theater_comedy', label: 'تئاتر', keywords: ['تئاتر', 'نمایش'] },
    { value: 'handyman', label: 'تعمیرات', keywords: ['تعمیر', 'ابزار'] },
    { value: 'storefront', label: 'فروشگاه', keywords: ['فروش', 'تجارت'] },
    { value: 'rocket_launch', label: 'استارتاپ', keywords: ['استارتاپ', 'راکت'] },
    { value: 'insights', label: 'تحلیل', keywords: ['تحلیل', 'آمار'] },
    { value: 'hub', label: 'شبکه‌سازی', keywords: ['شبکه', 'اتصال'] },
    { value: 'memory', label: 'سخت‌افزار', keywords: ['سخت‌افزار', 'چیپ'] },
    { value: 'api', label: 'API', keywords: ['api', 'برنامه‌نویسی'] },
    { value: 'web', label: 'وب', keywords: ['وب', 'سایت'] },
    { value: 'storage', label: 'ذخیره‌سازی', keywords: ['ذخیره', 'دیتابیس'] },
    { value: 'bug_report', label: 'دیباگ', keywords: ['باگ', 'دیباگ'] },
    { value: 'devices', label: 'دستگاه‌ها', keywords: ['دستگاه', 'ریسپانسیو'] },
    { value: 'auto_fix_high', label: 'بهینه‌سازی', keywords: ['بهینه', 'جادو'] },
    { value: 'workspace_premium', label: 'حرفه‌ای', keywords: ['حرفه‌ای', 'پریمیوم'] },
    { value: 'emoji_events', label: 'جایزه', keywords: ['جایزه', 'جام'] },
    { value: 'verified', label: 'تأییدشده', keywords: ['تأیید', 'معتبر'] },
    { value: 'lightbulb', label: 'ایده', keywords: ['ایده', 'نوآوری'] },
    { value: 'explore', label: 'کاوش', keywords: ['کاوش', 'کشف'] },
    { value: 'public', label: 'جهانی', keywords: ['جهانی', 'دنیا'] },
    { value: 'eco', label: 'محیط زیست', keywords: ['محیط', 'طبیعت'] },
    { value: 'volunteer_activism', label: 'خیریه', keywords: ['خیریه', 'کمک'] },
    { value: 'diversity_3', label: 'تنوع', keywords: ['تنوع', 'اجتماعی'] },
    { value: 'psychology_alt', label: 'تفکر', keywords: ['تفکر', 'ذهن'] },
    // 🔤 آیکون‌های تکمیلی (همه از مجموعهٔ Google Material Icons هستند)
    { value: 'home', label: 'خانه', keywords: ['خانه', 'home'] },
    { value: 'menu_book', label: 'کتاب باز', keywords: ['کتاب', 'مطالعه'] },
    { value: 'camera_alt', label: 'دوربین', keywords: ['دوربین', 'عکس'] },
    { value: 'work', label: 'کار', keywords: ['کار', 'شغل'] },
    { value: 'attach_money', label: 'پول', keywords: ['پول', 'مالی'] },
    { value: 'sports_esports', label: 'بازی', keywords: ['بازی', 'گیم'] },
    { value: 'apartment', label: 'ساختمان', keywords: ['ساختمان', 'برج'] },
    { value: 'shopping_cart', label: 'خرید', keywords: ['خرید', 'سبد'] },
    { value: 'build', label: 'ابزار', keywords: ['ابزار', 'تعمیر'] },
    { value: 'favorite', label: 'علاقه', keywords: ['علاقه', 'قلب'] },
    { value: 'record_voice_over', label: 'مکالمه', keywords: ['مکالمه', 'صدا'] },
    { value: 'bar_chart', label: 'نمودار', keywords: ['نمودار', 'آمار'] },
    { value: 'lock', label: 'قفل', keywords: ['قفل', 'امنیت'] },
    { value: 'smart_toy', label: 'ربات', keywords: ['ربات', 'هوش مصنوعی'] },
    { value: 'bolt', label: 'انرژی', keywords: ['انرژی', 'برق'] },
    { value: 'star', label: 'ستاره', keywords: ['ستاره', 'ویژه'] },
    { value: 'track_changes', label: 'هدف', keywords: ['هدف', 'هدف‌گذاری'] },
  ];

  /** 😀 شکلک‌های آماده برای دسته‌بندی‌ها */
  readonly emojiOptions: { value: string; label: string }[] = [
    { value: '📚', label: 'کتاب' },
    { value: '🎓', label: 'تحصیل' },
    { value: '💻', label: 'کامپیوتر' },
    { value: '🧠', label: 'هوش' },
    { value: '🚀', label: 'استارتاپ' },
    { value: '🎨', label: 'هنر' },
    { value: '🎵', label: 'موسیقی' },
    { value: '📷', label: 'عکاسی' },
    { value: '🎬', label: 'فیلم' },
    { value: '💼', label: 'کسب‌وکار' },
    { value: '💰', label: 'مالی' },
    { value: '📈', label: 'رشد' },
    { value: '🏥', label: 'پزشکی' },
    { value: '⚖️', label: 'حقوق' },
    { value: '🔬', label: 'علم' },
    { value: '🧮', label: 'ریاضی' },
    { value: '🌍', label: 'زبان' },
    { value: '🏗️', label: 'مهندسی' },
    { value: '🍳', label: 'آشپزی' },
    { value: '✈️', label: 'سفر' },
    { value: '🏋️', label: 'ورزش' },
    { value: '🎮', label: 'بازی' },
    { value: '🐾', label: 'حیوانات' },
    { value: '🌱', label: 'کشاورزی' },
    { value: '🏠', label: 'معماری' },
    { value: '🛒', label: 'فروشگاه' },
    { value: '🔧', label: 'تعمیرات' },
    { value: '💡', label: 'ایده' },
    { value: '🏆', label: 'جایزه' },
    { value: '❤️', label: 'سلامت' },
    { value: '🧘', label: 'مدیتیشن' },
    { value: '👶', label: 'کودک' },
    { value: '🗣️', label: 'مکالمه' },
    { value: '📊', label: 'تحلیل' },
    { value: '🔐', label: 'امنیت' },
    { value: '☁️', label: 'ابر' },
    { value: '🤖', label: 'ربات' },
    { value: '⚡', label: 'انرژی' },
    { value: '🌟', label: 'ویژه' },
    { value: '🎯', label: 'هدف' },
  ];

  readonly colorOptions = [
    { hex: '#8b5cf6', name: 'بنفش' },
    { hex: '#6366f1', name: 'ایندیگو' },
    { hex: '#3b82f6', name: 'آبی' },
    { hex: '#06b6d4', name: 'فیروزه‌ای' },
    { hex: '#10b981', name: 'سبز' },
    { hex: '#14b8a6', name: 'تیل' },
    { hex: '#f59e0b', name: 'کهربایی' },
    { hex: '#f97316', name: 'نارنجی' },
    { hex: '#ef4444', name: 'قرمز' },
    { hex: '#ec4899', name: 'صورتی' },
    { hex: '#a855f7', name: 'ارغوانی' },
    { hex: '#0ea5e9', name: 'آسمانی' },
  ];

  // ================= Computed =================
  filteredIcons = computed(() => {
    const query = this.iconSearchQuery().toLowerCase().trim();
    if (!query) return this.iconOptions;
    return this.iconOptions.filter(
      (icon) =>
        icon.value.includes(query) ||
        icon.label.includes(query) ||
        icon.keywords.some((k) => k.toLowerCase().includes(query)),
    );
  });

  /** 😀 شکلک‌های فیلترشده بر اساس جستجو */
  filteredEmojis = computed(() => {
    const query = this.iconSearchQuery().toLowerCase().trim();
    if (!query) return this.emojiOptions;
    return this.emojiOptions.filter(
      (e) => e.label.includes(query) || e.value.includes(query),
    );
  });

  /**
   * 📌 حالت جاری دیالوگ
   * وقتی با `parent` باز شود یعنی کاربر می‌خواهد «زیردستهٔ» آن دسته را بسازد.
   */
  get mode(): CategoryDialogMode {
    if (this.data.category) return 'edit';
    return this.data.parent ? 'create-child' : 'create';
  }

  get isEditMode(): boolean {
    return this.mode === 'edit';
  }

  /** 🆕 آیا در حال ساخت زیردسته هستیم؟ (والد قفل می‌شود) */
  get isChildMode(): boolean {
    return this.mode === 'create-child';
  }

  /**
   * 📌 والدهای مجاز برای انتخاب
   * فقط دسته‌های سطح بالا (root) می‌توانند والد باشند — چون بک‌اند حداکثر ۲ سطح را پشتیبانی می‌کند.
   */
  get parentCategories(): Category[] {
    return this.data.categories.filter((c) => !c.parent || c.level === 0);
  }

  get isFormValid(): boolean {
    return !!this.form.name && this.form.name.trim().length >= 2;
  }

  /**
   * 📌 نام والدِ انتخاب‌شده
   * در حالت ساخت زیردسته، همیشه والدِ از پیش تعیین‌شده را برمی‌گرداند.
   */
  get selectedParentName(): string {
    if (!this.form.parent) return 'دسته اصلی (سطح بالا)';
    const parent =
      this.data.parent?._id === this.form.parent
        ? this.data.parent
        : this.data.categories.find((c) => c._id === this.form.parent);
    return parent?.name || 'دسته اصلی';
  }

  /**
   * 📌 آیا والد قفل است؟
   * در حالت ساخت زیردسته بله — کاربر باید همان والدِ کلیک‌شده را نگه دارد.
   */
  get isParentLocked(): boolean {
    return this.isChildMode;
  }

  // ================= Constructor =================
  constructor() {
    const cat = this.data.category;
    this.form = {
      name: cat?.name || '',
      slug: cat?.slug || '',
      description: cat?.description || '',
      icon: cat?.icon || 'category',
      iconType: cat?.iconType || 'material',
      customIconUrl: cat?.customIconUrl || '',
      // 🎨 رنگ اختیاری — پیش‌فرض خالی (بدون رنگ پس‌زمینه)
      color: (cat as any)?.color || '',
      // 📌 در حالت ساخت زیردسته، والدِ از پیش تعیین‌شده حتماً اعمال می‌شود
      parent: this.data.parent?._id || (cat as any)?.parent || null,
      order: cat?.order ?? 0,
      isActive: cat?.isActive ?? true,
    };
    // 📌 تب آیکون را بر اساس نوع ذخیره‌شده باز کن
    // (نوع قدیمی 'google' با 'material' یکسان است و به همان تب نگاشت می‌شود)
    if (cat?.iconType === 'custom') {
      this.activeIconTab.set('upload');
    } else if (cat?.iconType === 'emoji') {
      this.activeIconTab.set('emoji');
    } else {
      this.activeIconTab.set('material');
    }
  }

  // ================= Methods =================
  onNameChange(): void {
    // 🔗 اسلاگ فقط در حالت ساخت تولید می‌شود؛ در ویرایش، اسلاگ فعلی حفظ می‌شود
    // تا لینک‌های قبلی و SEO خراب نشوند (کاربر می‌تواند دستی تغییر دهد).
    if (!this.data.category) {
      this.form.slug = generateSlug(this.form.name);
    }
  }

  /** 🔗 بازتولید اسلاگ از نام (دستی، در حالت ویرایش) */
  regenerateSlug(): void {
    this.form.slug = generateSlug(this.form.name);
  }

  setTab(tab: 'basic' | 'appearance' | 'advanced'): void {
    this.activeTab.set(tab);
  }

  selectIcon(icon: string): void {
    this.form.icon = icon;
    this.form.iconType = 'material';
    this.form.customIconUrl = '';
    this.showIconPicker.set(false);
    this.iconSearchQuery.set('');
  }

  /** 😀 انتخاب شکلک */
  selectEmoji(emoji: string): void {
    this.form.icon = emoji;
    this.form.iconType = 'emoji';
    this.form.customIconUrl = '';
    this.showIconPicker.set(false);
    this.iconSearchQuery.set('');
  }

  /** ️ انتخاب آیکون سفارشی (آپلودشده) */
  selectCustomIcon(url: string): void {
    this.form.customIconUrl = url;
    this.form.iconType = 'custom';
    this.showIconPicker.set(false);
    this.iconSearchQuery.set('');
  }

  /** 📤 آپلود فایل آیکون سفارشی */
  onIconFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    // اعتبارسنجی سمت کلاینت
    const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowed.includes(file.type)) {
      this.snackBar.open('فقط فرمت‌های JPEG، PNG، GIF و WebP مجاز هستند', 'بستن', {
        duration: 4000,
        direction: 'rtl',
        panelClass: ['snackbar-error'],
      });
      input.value = '';
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      this.snackBar.open('حجم فایل نباید بیشتر از ۲ مگابایت باشد', 'بستن', {
        duration: 4000,
        direction: 'rtl',
        panelClass: ['snackbar-error'],
      });
      input.value = '';
      return;
    }

    const formData = new FormData();
    formData.append('icon', file);

    this.isUploadingIcon.set(true);
    this.api.upload<{ url: string; customIconUrl: string }>('/categories/upload-icon', formData).subscribe({
      next: (res) => {
        this.isUploadingIcon.set(false);
        const url = res.data?.url || res.data?.customIconUrl;
        if (url) {
          this.selectCustomIcon(url);
          this.snackBar.open('آیکون با موفقیت آپلود شد ✓', 'بستن', {
            duration: 3000,
            direction: 'rtl',
            panelClass: ['snackbar-success'],
          });
        }
      },
      error: (err) => {
        this.isUploadingIcon.set(false);
        this.snackBar.open(err?.error?.message || 'خطا در آپلود آیکون', 'بستن', {
          duration: 4000,
          direction: 'rtl',
          panelClass: ['snackbar-error'],
        });
      },
    });
    input.value = '';
  }

  /** 🔗 اعمال آیکون از URL خارجی (مثلاً کپی از گوگل) */
  applyCustomIconUrl(): void {
    const url = (this.customIconUrlInput() || '').trim();
    if (!url) return;
    if (!/^https?:\/\//i.test(url)) {
      this.snackBar.open('آدرس باید با http یا https شروع شود', 'بستن', {
        duration: 4000,
        direction: 'rtl',
        panelClass: ['snackbar-error'],
      });
      return;
    }
    this.selectCustomIcon(url);
    this.customIconUrlInput.set('');
    this.snackBar.open('آیکون اعمال شد ✓', 'بستن', {
      duration: 3000,
      direction: 'rtl',
      panelClass: ['snackbar-success'],
    });
  }

  /** 🗑️ حذف آیکون سفارشی */
  clearCustomIcon(): void {
    this.form.customIconUrl = '';
    this.form.iconType = 'material';
    this.form.icon = 'category';
  }

  setIconTab(tab: 'material' | 'emoji' | 'upload'): void {
    this.activeIconTab.set(tab);
    this.iconSearchQuery.set('');
  }

  selectColor(color: string): void {
    this.form.color = color;
  }

  /** 🚫 حذف رنگ — دسته‌بندی فقط با آیکون/تصویر نمایش داده می‌شود */
  clearColor(): void {
    this.form.color = '';
  }

  /** 🎨 آیا رنگ انتخاب شده است؟ */
  get hasColor(): boolean {
    return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test((this.form.color || '').trim());
  }

  toggleIconPicker(): void {
    this.showIconPicker.update((v) => !v);
    if (!this.showIconPicker()) this.iconSearchQuery.set('');
  }

  save(): void {
    if (!this.isFormValid) {
      this.snackBar.open('لطفاً نام دسته‌بندی را وارد کنید', 'بستن', {
        duration: 3000,
        direction: 'rtl',
        panelClass: ['snackbar-error'],
      });
      return;
    }

    // 🛡️ در حالت ساخت زیردسته، والدِ از پیش تعیین‌شده قفل است و نباید تغییر کند
    const parentId = this.isChildMode ? this.data.parent?._id ?? null : this.form.parent || null;

    // 🛡️ والد نباید خودِ دسته باشد (ویرایش) و سطح نباید از ۱ بیشتر شود
    if (this.isEditMode && parentId && this.data.category?._id === parentId) {
      this.snackBar.open('یک دسته‌بندی نمی‌تواند والد خودش باشد', 'بستن', {
        duration: 4000,
        direction: 'rtl',
        panelClass: ['snackbar-error'],
      });
      return;
    }

    this.isSaving.set(true);

    const payload: any = {
      name: this.form.name.trim(),
      // 🔗 اسلاگ پاک‌سازی‌شده؛ اگر خالی باشد بک‌اند از نام تولید می‌کند
      slug: (this.form.slug || '').trim(),
      description: this.form.description?.trim() || '',
      icon: this.form.icon,
      iconType: this.form.iconType,
      customIconUrl: this.form.customIconUrl,
      // 🎨 رنگ اختیاری — رشتهٔ خالی یعنی «بدون رنگ پس‌زمینه»
      color: this.form.color || '',
      parent: parentId,
      order: this.form.order,
      isActive: this.form.isActive,
    };

    const request$ = this.data.category
      ? this.api.put<any>(`/categories/${this.data.category._id}`, payload)
      : this.api.post<any>('/categories', payload);

    request$.subscribe({
      next: () => {
        const name = this.form.name.trim();
        if (this.isEditMode) {
          this.snackBar.open(`دسته‌بندی «${name}» ویرایش شد ✓`, 'بستن', {
            duration: 3000,
            direction: 'rtl',
            panelClass: ['snackbar-success'],
          });
        } else if (this.isChildMode) {
          this.snackBar.open(`زیردسته «${name}» زیر «${this.selectedParentName}» ایجاد شد ✓`, 'بستن', {
            duration: 4000,
            direction: 'rtl',
            panelClass: ['snackbar-success'],
          });
        } else {
          this.snackBar.open(`دسته‌بندی «${name}» ایجاد شد ✓`, 'بستن', {
            duration: 3000,
            direction: 'rtl',
            panelClass: ['snackbar-success'],
          });
        }
        this.dialogRef.close(true);
      },
      error: (err) => {
        this.snackBar.open(err?.error?.message || 'خطا در ذخیره دسته‌بندی', 'بستن', {
          duration: 4000,
          direction: 'rtl',
          panelClass: ['snackbar-error'],
        });
        this.isSaving.set(false);
      },
    });
  }

  close(): void {
    this.dialogRef.close(false);
  }
}

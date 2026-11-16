import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CategoryIconComponent } from './category-icon.component';

describe('CategoryIconComponent', () => {
  let fixture: ComponentFixture<CategoryIconComponent>;
  let component: CategoryIconComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CategoryIconComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(CategoryIconComponent);
    component = fixture.componentInstance;
  });

  it('should resolve material type by default', () => {
    component.icon = 'code';
    expect(component.resolvedType).toBe('material');
  });

  it('should resolve emoji type automatically', () => {
    component.icon = '🎓';
    expect(component.resolvedType).toBe('emoji');
  });

  it('should resolve custom type when customIconUrl is present', () => {
    component.customIconUrl = 'https://example.com/icon.png';
    expect(component.resolvedType).toBe('custom');
  });

  it('should respect an explicit iconType over auto-detection', () => {
    component.icon = '🎓';
    component.iconType = 'material';
    expect(component.resolvedType).toBe('material');
  });

  it('should fall back to the default icon when the image fails to load', () => {
    component.customIconUrl = 'https://example.com/broken.png';
    component.iconType = 'custom';
    fixture.detectChanges();

    expect(component.imageFailed()).toBe(false);
    component.onImageError();
    expect(component.imageFailed()).toBe(true);

    fixture.detectChanges();
    const img = fixture.nativeElement.querySelector('img');
    expect(img).toBeNull();
    const matIcon = fixture.nativeElement.querySelector('mat-icon');
    expect(matIcon).not.toBeNull();
  });

  it('should render an img for a valid custom icon', () => {
    component.customIconUrl = 'https://example.com/icon.png';
    component.iconType = 'custom';
    fixture.detectChanges();

    const img = fixture.nativeElement.querySelector('img');
    expect(img).not.toBeNull();
    expect(img.getAttribute('loading')).toBe('lazy');
  });
});

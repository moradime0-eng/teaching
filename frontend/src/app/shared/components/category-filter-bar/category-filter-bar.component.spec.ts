import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CategoryFilterBarComponent } from './category-filter-bar.component';
import { Category } from '../../../core/models/category.model';

describe('CategoryFilterBarComponent', () => {
  let component: CategoryFilterBarComponent;
  let fixture: ComponentFixture<CategoryFilterBarComponent>;

  const mockCategories: Category[] = [
    { _id: '1', name: 'برنامه‌نویسی', slug: 'programming', level: 0, order: 1, isActive: true, totalCourses: 10, createdAt: '', updatedAt: '' },
    { _id: '2', name: 'طراحی', slug: 'design', level: 0, order: 2, isActive: true, totalCourses: 5, createdAt: '', updatedAt: '' },
  ];

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CategoryFilterBarComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(CategoryFilterBarComponent);
    component = fixture.componentInstance;
    component.categories = mockCategories;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should render "all" chip plus one chip per category', () => {
    const chips = fixture.nativeElement.querySelectorAll('.cfb__chip');
    expect(chips.length).toBe(mockCategories.length + 1);
  });

  it('should mark "all" as active when activeId is null', () => {
    component.activeId = null;
    fixture.detectChanges();
    const firstChip = fixture.nativeElement.querySelector('.cfb__chip');
    expect(firstChip.classList.contains('is-active')).toBeTrue();
    expect(firstChip.getAttribute('aria-selected')).toBe('true');
  });

  it('should emit null when the "all" chip is clicked', () => {
    spyOn(component.categoryChange, 'emit');
    component.activeId = '1';
    component.select(null);
    expect(component.categoryChange.emit).toHaveBeenCalledWith(null);
  });

  it('should emit the category id when a category chip is clicked', () => {
    spyOn(component.categoryChange, 'emit');
    component.select('2');
    expect(component.categoryChange.emit).toHaveBeenCalledWith('2');
  });

  it('should not emit when selecting the already-active category', () => {
    spyOn(component.categoryChange, 'emit');
    component.activeId = '1';
    component.select('1');
    expect(component.categoryChange.emit).not.toHaveBeenCalled();
  });

  it('should render skeleton chips when loading', () => {
    component.loading = true;
    fixture.detectChanges();
    const skeletons = fixture.nativeElement.querySelectorAll('.cfb__sk');
    expect(skeletons.length).toBeGreaterThan(0);
    expect(fixture.nativeElement.querySelectorAll('.cfb__chip').length).toBe(0);
  });
});

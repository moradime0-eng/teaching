import { Component, EventEmitter, Input, OnInit, Output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import {
  CAMPAIGN_COLOR_PALETTE,
  CAMPAIGN_GRADIENT_PRESETS,
  ColorPreset,
  normalizeHex,
} from '../../../core/utils/color.utils';
import { CampaignColors, CampaignTheme } from '../../../core/models/campaign.model';

type PickerMode = 'theme' | 'solid' | 'gradient';

@Component({
  selector: 'app-campaign-color-picker',
  standalone: true,
  imports: [CommonModule, MatIconModule],
  templateUrl: './campaign-color-picker.component.html',
  styleUrl: './campaign-color-picker.component.scss',
})
export class CampaignColorPickerComponent implements OnInit {
  /** Selected theme (used in 'theme' mode) */
  @Input() theme: CampaignTheme = 'fire';
  /** Custom colors (used in 'solid' / 'gradient' mode) */
  @Input() colors: CampaignColors | null = null;

  @Output() themeChange = new EventEmitter<CampaignTheme>();
  @Output() colorsChange = new EventEmitter<CampaignColors | null>();

  readonly palette = CAMPAIGN_COLOR_PALETTE;
  readonly gradientPresets: ColorPreset[] = CAMPAIGN_GRADIENT_PRESETS;
  readonly anglePresets = [0, 45, 90, 120, 180, 270];

  readonly themeOptions: { value: CampaignTheme; label: string; icon: string }[] = [
    { value: 'fire', label: 'آتشین (قرمز/نارنجی)', icon: 'local_fire_department' },
    { value: 'cold', label: 'سرد (آبی/بنفش)', icon: 'ac_unit' },
    { value: 'gold', label: 'طلایی (زرد/طلایی)', icon: 'workspace_premium' },
    { value: 'green', label: 'سبز (طبیعت/موفقیت)', icon: 'eco' },
  ];

  readonly mode = signal<PickerMode>('theme');
  readonly selectedTheme = signal<CampaignTheme>('fire');
  readonly solidColor = signal<string>('#b93818');
  readonly gradientStops = signal<string[]>(['#b93818', '#e66a12']);
  readonly gradientAngle = signal<number>(120);

  ngOnInit(): void {
    this.selectedTheme.set(this.theme || 'fire');

    const colors = this.colors;
    if (colors?.gradient && colors.gradient.length >= 2) {
      this.mode.set('gradient');
      this.gradientStops.set([...colors.gradient].slice(0, 4));
      this.gradientAngle.set(colors.gradientAngle ?? 120);
    } else if (colors?.background) {
      this.mode.set('solid');
      this.solidColor.set(normalizeHex(colors.background) ?? '#b93818');
    }
  }

  // ─────────────────────────── Mode ───────────────────────────

  setMode(mode: PickerMode): void {
    this.mode.set(mode);
    // Switching to a custom mode starts from the current theme's first color
    if (mode === 'solid' && !this.colors?.background) {
      // keep current solidColor
    }
    if (mode === 'gradient' && !this.colors?.gradient) {
      // keep current stops
    }
  }

  // ─────────────────────────── Theme ───────────────────────────

  pickTheme(theme: CampaignTheme): void {
    this.selectedTheme.set(theme);
    this.themeChange.emit(theme);
    // Choosing a built-in theme clears any custom colors
    this.colorsChange.emit(null);
    this.mode.set('theme');
  }

  // ─────────────────────────── Solid ───────────────────────────

  pickSolid(color: string): void {
    const hex = normalizeHex(color);
    if (!hex) return;
    this.solidColor.set(hex);
    this.emitSolid();
  }

  onSolidInput(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    const hex = normalizeHex(value);
    if (!hex) return;
    this.solidColor.set(hex);
    this.emitSolid();
  }

  onHexInput(event: Event, mode: 'solid' | 'gradient'): void {
    const raw = (event.target as HTMLInputElement).value;
    const hex = normalizeHex(raw);
    if (!hex) return;
    if (mode === 'solid') {
      this.solidColor.set(hex);
      this.emitSolid();
    }
  }

  private emitSolid(): void {
    this.colorsChange.emit({
      background: this.solidColor(),
      gradient: [],
      gradientAngle: this.gradientAngle(),
    });
  }

  // ─────────────────────────── Gradient ───────────────────────────

  addStop(): void {
    if (this.gradientStops().length >= 4) return;
    const stops = [...this.gradientStops()];
    stops.push(this.suggestNextColor());
    this.gradientStops.set(stops);
    this.emitGradient();
  }

  removeStop(index: number): void {
    if (this.gradientStops().length <= 2) return;
    const stops = this.gradientStops().filter((_, i) => i !== index);
    this.gradientStops.set(stops);
    this.emitGradient();
  }

  updateStop(index: number, event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    const hex = normalizeHex(value);
    if (!hex) return;
    const stops = [...this.gradientStops()];
    stops[index] = hex;
    this.gradientStops.set(stops);
    this.emitGradient();
  }

  updateStopHex(index: number, event: Event): void {
    const raw = (event.target as HTMLInputElement).value;
    const hex = normalizeHex(raw);
    if (!hex) return;
    const stops = [...this.gradientStops()];
    stops[index] = hex;
    this.gradientStops.set(stops);
    this.emitGradient();
  }

  onAngleInput(event: Event): void {
    const value = Number((event.target as HTMLInputElement).value);
    if (Number.isNaN(value)) return;
    this.gradientAngle.set(Math.max(0, Math.min(360, value)));
    this.emitGradient();
  }

  setAngle(angle: number): void {
    this.gradientAngle.set(angle);
    this.emitGradient();
  }

  applyGradientPreset(preset: ColorPreset): void {
    this.gradientStops.set([normalizeHex(preset.from)!, normalizeHex(preset.to)!]);
    this.mode.set('gradient');
    this.emitGradient();
  }

  private emitGradient(): void {
    this.colorsChange.emit({
      background: this.solidColor(),
      gradient: [...this.gradientStops()],
      gradientAngle: this.gradientAngle(),
    });
  }

  /**
   * Suggest a visually distinct next stop color.
   * Rotates the hue slightly so multi-stop gradients stay readable.
   */
  private suggestNextColor(): string {
    const palette = CAMPAIGN_COLOR_PALETTE.filter((c) => !this.gradientStops().includes(c));
    return palette[Math.floor(Math.random() * palette.length)] ?? '#7c3aed';
  }

  // ─────────────────────────── Clear ───────────────────────────

  clearCustom(): void {
    this.colorsChange.emit(null);
    this.mode.set('theme');
  }
}

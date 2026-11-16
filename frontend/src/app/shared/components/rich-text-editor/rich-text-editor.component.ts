import {
  AfterViewInit,
  Component,
  EventEmitter,
  forwardRef,
  HostListener,
  inject,
  Input,
  OnChanges,
  OnDestroy,
  OnInit,
  Output,
  PLATFORM_ID,
  SimpleChanges,
  ViewEncapsulation,
  ChangeDetectorRef,
} from '@angular/core';

import { CommonModule, isPlatformBrowser } from '@angular/common';

import {
  ControlValueAccessor,
  FormsModule,
  NG_VALUE_ACCESSOR,
} from '@angular/forms';

import { QuillModule } from 'ngx-quill';

// ✅ Quill به صورت dynamic import می‌شود تا در SSR خطا ندهد
let Quill: any = null;

@Component({
  selector: 'app-rich-text-editor',
  standalone: true,
  imports: [CommonModule, FormsModule, QuillModule],
  encapsulation: ViewEncapsulation.None,
  templateUrl: './rich-text-editor.component.html',
  styleUrls: ['./rich-text-editor.component.scss'],
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => RichTextEditorComponent),
      multi: true,
    },
  ],
  host: {
    '[class.auto-expand]': 'autoExpand',
  },
})
export class RichTextEditorComponent
  implements ControlValueAccessor, OnInit, AfterViewInit, OnChanges, OnDestroy
{
  @Input() placeholder = 'متن خود را وارد کنید...';
  @Input() minHeight = '150px';
  @Input() maxHeight = '500px';
  @Input() direction: 'rtl' | 'ltr' = 'rtl';
  @Input() required = false;
  @Input() compact = false;
  @Input() showEmojiButton = true;
  @Input() markdownMode = false; // ⭐ Enable markdown input mode
  @Input() autoExpand = false; // ⭐ Allow editor to grow beyond maxHeight
  @Input() toolbar: string[] = []; // ⭐ Custom toolbar buttons

  @Output() contentChanged = new EventEmitter<string>();

  private readonly platformId = inject(PLATFORM_ID);
  private cdr = inject(ChangeDetectorRef);

  isBrowser = false;
  isQuillLoaded = false; // ⭐ فلگ برای کنترل رندر HTML پس از لود شدن کامل کویل
  
  value = '';
  isDisabled = false;
  showEmojiPicker = false;
  editorModules: any = null;

  // ⭐ تولید یک ID اختصاصی و یکتا برای هر اینستنس از کامپوننت
  toolbarId = 'quill-toolbar-' + Math.random().toString(36).substring(2, 9);

  private quillEditor: any = null;
  private initialized = false;
  private isSettingValue = false;

  onChange: (value: string) => void = () => {};
  onTouched: () => void = () => {};

  emojis = [
    '😀', '😂', '😍', '🥰', '😎', '🤔', '👍', '👎', '🙏', '❤️', '🔥', '✨',
    '💪', '🎉', '👏', '🙌', '💡', '📚', '✅', '❌', '⭐', '🌟', '🎯', '🚀',
    '💻', '📱', '🔧', '📝', '✏️', '🎨', '🎬', '🎵',
  ];

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (!this.showEmojiPicker) return;
    const target = event.target as HTMLElement;
    if (!target.closest('.ql-emoji-picker') && !target.closest('.ql-emoji')) {
      this.showEmojiPicker = false;
    }
  }

  ngOnInit(): void {
    this.isBrowser = isPlatformBrowser(this.platformId);
    if (this.isBrowser) {
      // ⭐ ابتدا کویل را دانلود می‌کنیم
      import('quill').then((m) => {
        Quill = m.default;
        this.isQuillLoaded = true;
        this.setupModules(); // ⭐ ماژول‌ها را دقیقاً بعد از لود شدن کویل تنظیم می‌کنیم
        this.cdr.detectChanges(); // ⭐ به انگولار می‌گوییم HTML را آپدیت کند
      });
    }
  }

  ngAfterViewInit(): void {
    if (!this.isBrowser) return;
    this.initialized = true;
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (!this.isBrowser || !this.isQuillLoaded) return; // تا کویل لود نشده آپدیت نکن
    if (changes['compact'] || changes['showEmojiButton']) {
      if (this.initialized) {
        setTimeout(() => this.setupModules());
      }
    }
    if (changes['direction'] && this.quillEditor) {
      this.applyDirection(this.direction);
    }
  }

  ngOnDestroy(): void {
    this.quillEditor = null;
    this.editorModules = null;
    this.showEmojiPicker = false;
  }

  private setupModules(): void {
    if (!this.isBrowser) return;

    // If custom toolbar is provided, use it; otherwise use default
    const toolbarButtons = this.toolbar.length > 0 ? this.toolbar : [
      'bold', 'italic', 'underline', 'strike',
      'blockquote', 'code-block',
      'header', 'size',
      'list', 'bullet',
      'indent',
      'direction-rtl', 'direction-ltr',
      'color', 'background',
      'link', 'image',
      'emoji',
      'clean'
    ];

    this.editorModules = {
      toolbar: {
        container: '#' + this.toolbarId,
        handlers: {
          emoji: () => {
            this.showEmojiPicker = !this.showEmojiPicker;
          },
          'direction-rtl': () => {
            this.setDirection('rtl');
          },
          'direction-ltr': () => {
            this.setDirection('ltr');
          },
        },
      },
    };
  }

  private setDirection(direction: 'rtl' | 'ltr'): void {
    if (!this.quillEditor) return;
    const editor = this.quillEditor;
    editor.format('direction', direction === 'rtl' ? 'rtl' : false, 'user');
    editor.format('align', false, 'user');
    this.applyDirection(direction);
    this.updateDirectionButtons(direction);
    editor.focus();
  }

  private applyDirection(direction: 'rtl' | 'ltr'): void {
    if (!this.quillEditor) return;
    const root = this.quillEditor.root;
    root.setAttribute('dir', direction);
    root.style.direction = direction;
    root.style.textAlign = direction === 'rtl' ? 'right' : 'left';
    this.updateDirectionButtons(direction);
  }

  private updateDirectionButtons(direction: 'rtl' | 'ltr'): void {
    if (!this.isBrowser) return;
    const toolbar = document.getElementById(this.toolbarId);
    if (!toolbar) return;

    const rtlButton = toolbar.querySelector('.ql-direction-rtl') as HTMLElement;
    const ltrButton = toolbar.querySelector('.ql-direction-ltr') as HTMLElement;

    rtlButton?.classList.toggle('ql-active', direction === 'rtl');
    ltrButton?.classList.toggle('ql-active', direction === 'ltr');
    rtlButton?.setAttribute('aria-pressed', String(direction === 'rtl'));
    ltrButton?.setAttribute('aria-pressed', String(direction === 'ltr'));
  }

  insertEmoji(emoji: string): void {
    if (!this.quillEditor) return;
    const range = this.quillEditor.getSelection(true);
    const index = range ? range.index : Math.max(this.quillEditor.getLength() - 1, 0);

    if (range?.length) {
      this.quillEditor.deleteText(index, range.length, 'user');
    }

    this.quillEditor.insertText(index, emoji, 'user');
    this.quillEditor.setSelection(index + emoji.length, 0, 'silent');
    this.showEmojiPicker = false;

    setTimeout(() => {
      this.quillEditor?.focus();
    });
  }

  /** Check if a toolbar button should be shown */
  showToolbarButton(button: string): boolean {
    if (this.toolbar.length === 0) return true; // Show all by default
    return this.toolbar.includes(button);
  }

  writeValue(value: string): void {
    this.value = value || '';
    if (this.quillEditor) {
      this.isSettingValue = true;
      // If markdown mode is enabled and value looks like markdown, convert it
      if (this.markdownMode && this.isMarkdown(value)) {
        this.quillEditor.root.innerHTML = this.markdownToHtml(value);
      } else {
        this.quillEditor.root.innerHTML = this.value;
      }
      this.isSettingValue = false;
    }
  }

  registerOnChange(fn: (value: string) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.isDisabled = isDisabled;
    if (this.quillEditor) {
      this.quillEditor.enable(!isDisabled);
    }
  }

  onContentChange(event: any): void {
    const html = event?.html || '';
    if (this.isSettingValue) {
      this.value = html;
      return;
    }
    if (this.value !== html) {
      this.value = html;
      this.onChange(html);
      this.contentChanged.emit(html);
    }
  }

  onEditorCreated(editor: any): void {
    if (!editor) return;
    this.quillEditor = editor;
    this.applyDirection(this.direction);
    editor.enable(!this.isDisabled);
    
    if (this.value) {
      this.isSettingValue = true;
      this.quillEditor.root.innerHTML = this.value;
      this.isSettingValue = false;
    }
    
    setTimeout(() => {
      this.updateDirectionButtons(this.direction);
      if (this.quillEditor?.theme?.tooltip) {
        this.quillEditor.theme.tooltip.hide();
      }
      // ⭐ یک رفرش به مرورگر می‌فرستیم تا اگر محاسبه ارتفاع گیر کرده، باز شود
      window.dispatchEvent(new Event('resize')); 
    }, 100);
  }

  onEditorBlur(): void {
    this.onTouched();
  }

  // ⭐ Markdown detection and conversion methods
  private isMarkdown(text: string): boolean {
    if (!text) return false;
    // Check for common markdown patterns
    const markdownPatterns = [
      /^#{1,6}\s/m,           // Headers
      /\*\*.*\*\*/,           // Bold
      /\*.*\*/,               // Italic
      /^[-*+]\s/m,            // Unordered lists
      /^\d+\.\s/m,            // Ordered lists
      /\[.*\]\(.*\)/,         // Links
      /!\[.*\]\(.*\)/,        // Images
      /^>\s/m,                // Blockquotes
      /`.*`/,                 // Inline code
      /^```/m,                // Code blocks
      /^\|.*\|/m,             // Tables
      /^---$/m,               // Horizontal rules
    ];
    return markdownPatterns.some(pattern => pattern.test(text));
  }

  private markdownToHtml(markdown: string): string {
    try {
      // Dynamic import of marked for markdown conversion
      // We'll use a simple approach here - in production, you'd want to import marked
      // For now, let's do basic conversion
      return this.basicMarkdownToHtml(markdown);
    } catch (e) {
      console.warn('Markdown conversion failed:', e);
      return markdown;
    }
  }

  private basicMarkdownToHtml(markdown: string): string {
    let html = markdown;
    
    // Escape HTML first
    html = html.replace(/&/g, '&')
               .replace(/</g, '<')
               .replace(/>/g, '>');
    
    // Headers
    html = html.replace(/^### (.*$)/gim, '<h3>$1</h3>');
    html = html.replace(/^## (.*$)/gim, '<h2>$1</h2>');
    html = html.replace(/^# (.*$)/gim, '<h1>$1</h1>');
    html = html.replace(/^#### (.*$)/gim, '<h4>$1</h4>');
    html = html.replace(/^##### (.*$)/gim, '<h5>$1</h5>');
    html = html.replace(/^###### (.*$)/gim, '<h6>$1</h6>');
    
    // Bold
    html = html.replace(/\*\*(.*?)\*\*/gim, '<strong>$1</strong>');
    html = html.replace(/__(.*?)__/gim, '<strong>$1</strong>');
    
    // Italic
    html = html.replace(/\*(.*?)\*/gim, '<em>$1</em>');
    html = html.replace(/_(.*?)_/gim, '<em>$1</em>');
    
    // Strikethrough
    html = html.replace(/~~(.*?)~~/gim, '<del>$1</del>');
    
    // Inline code
    html = html.replace(/`(.*?)`/gim, '<code>$1</code>');
    
    // Code blocks
    html = html.replace(/```([\s\S]*?)```/gim, '<pre><code>$1</code></pre>');
    
    // Links
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/gim, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
    
    // Images
    html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/gim, '<img src="$2" alt="$1" />');
    
    // Blockquotes
    html = html.replace(/^> (.*$)/gim, '<blockquote>$1</blockquote>');
    
    // Horizontal rules
    html = html.replace(/^---$/gim, '<hr />');
    
    // Unordered lists
    html = html.replace(/^[-*+] (.*$)/gim, '<li>$1</li>');
    html = html.replace(/(<li>.*<\/li>)/gim, '<ul>$1</ul>');
    
    // Ordered lists
    html = html.replace(/^\d+\. (.*$)/gim, '<li>$1</li>');
    html = html.replace(/(<li>.*<\/li>)/gim, '<ol>$1</ol>');
    
    // Paragraphs - wrap lines that aren't already block elements
    const lines = html.split('\n');
    const result: string[] = [];
    let inList = false;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();
      
      // Check if line is a block element
      const isBlock = /^<\/?(h[1-6]|ul|ol|li|blockquote|pre|hr|table|thead|tbody|tr|th|td|div|p)/i.test(trimmed);
      
      if (trimmed === '') {
        if (inList) {
          inList = false;
        }
        result.push('');
      } else if (isBlock) {
        inList = /^<\/?(ul|ol)/i.test(trimmed);
        result.push(line);
      } else {
        // Wrap in paragraph if not already wrapped
        if (!/^<p>/i.test(trimmed)) {
          result.push('<p>' + line + '</p>');
        } else {
          result.push(line);
        }
      }
    }
    
    // Clean up empty paragraphs
    html = result.join('\n');
    html = html.replace(/<p>\s*<\/p>/gim, '');
    html = html.replace(/<p>\s*(<\/p>)/gim, '');
    
    // Fix nested lists
    html = html.replace(/<\/ul>\s*<ul>/gim, '');
    html = html.replace(/<\/ol>\s*<ol>/gim, '');
    
    return html;
  }
}
import {
  Component,
  OnInit,
  signal,
  computed,
  ViewChild,
  ElementRef,
  AfterViewChecked,
  Inject,
  PLATFORM_ID,
  OnDestroy,
} from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { ApiService } from '../../core/services/api.service';
import { SocketService } from '../../core/services/socket.service';
import { AuthService } from '../../core/services/auth.service';
import { JalaliDatePipe } from '../../shared/pipes/jalali-date.pipe';
import { SanitizeHtmlPipe } from '../../shared/pipes/sanitize-html.pipe';
import { Router } from '@angular/router';
import { RichTextEditorComponent } from '../../shared/components/rich-text-editor/rich-text-editor.component';

@Component({
  selector: 'app-messages',
  standalone: true,
  imports: [CommonModule, FormsModule, MatIconModule, JalaliDatePipe, SanitizeHtmlPipe, RichTextEditorComponent],
  templateUrl: './messages.component.html',
  styleUrl: './messages.component.scss',
})
export class MessagesComponent implements OnInit, AfterViewChecked, OnDestroy {
  @ViewChild('scrollContainer') private scrollContainer!: ElementRef;
  @ViewChild('messageInput') private messageInput!: RichTextEditorComponent;

  conversations = signal<any[]>([]);
  activeConversation = signal<any>(null);
  messages = signal<any[]>([]);
  newMessage: string = '';

  isLoadingConversations = signal<boolean>(true);
  isLoadingMessages = signal<boolean>(false);
  searchQuery = signal<string>('');
  isMobileChatOpen = signal<boolean>(false);
  isTyping = signal<boolean>(false);
  showEmojiPicker = signal<boolean>(false);
  isInfoPanelOpen = signal<boolean>(false);

  isSendingLock = false;

  // ── New Conversation Dialog ──
  showNewConversationDialog = signal<boolean>(false);
  availableUsers = signal<any[]>([]);
  userSearchQuery = signal<string>('');
  selectedRecipient = signal<any>(null);
  newConversationMessage = signal<string>('');
  isStartingConversation = signal<boolean>(false);

  // ── Broadcast Dialog ──
  showBroadcastDialog = signal<boolean>(false);
  broadcastMessage = signal<string>('');
  broadcastMode = signal<'all' | 'specific'>('all');
  selectedBroadcastInstructors = signal<any[]>([]);
  instructorSearchQuery = signal<string>('');
  isSendingBroadcast = signal<boolean>(false);

  private shouldScrollToBottom = false;
  private isBrowser = false;
  private typingTimeout: any;

  quickEmojis = ['😊', '👍', '❤️', '😂', '🎉', '🙏', '👏', '🔥', '💯', '✅', '⭐', '💪'];

  constructor(
    private api: ApiService,
    private socketService: SocketService,
    public authService: AuthService,
    private router: Router,
    @Inject(PLATFORM_ID) private platformId: Object,
  ) {
    this.isBrowser = isPlatformBrowser(this.platformId);
  }

  // ⚠️ FIX: مرجع لیسنرها برای حذف دقیق در ngOnDestroy
  // (قبلاً off(event) بدون callback لیسنرهای سایر کامپوننت‌ها را هم پاک می‌کرد)
  private readonly onNewMessage = (payload: any) => {
    const msg = payload.message || payload;
    const convId = payload.conversation || msg.conversation;

    if (this.activeConversation()?._id === convId) {
      // اگر فرستنده خود کاربر جاری است، پیام قبلاً از REST اضافه شده — رد شو
      const currentUserId = (this.authService.currentUser() as any)?._id;
      if (msg.sender?._id === currentUserId || msg.sender === currentUserId) {
        return;
      }

      // جلوگیری از اضافه شدن تکراری
      const alreadyExists = this.messages().some((m) => m._id === msg._id);
      if (alreadyExists) return;

      this.messages.update((list) => [...list, msg]);
      this.shouldScrollToBottom = true;
    }

    this.conversations.update((convs) =>
      convs.map((c) =>
        c._id === convId
          ? { ...c, lastMessage: msg, lastMessageAt: new Date().toISOString() }
          : c,
      ),
    );
  };

  private readonly onUserTyping = (data: any) => {
    if (this.activeConversation()?._id === data.conversationId) {
      this.isTyping.set(true);
      clearTimeout(this.typingTimeout);
      this.typingTimeout = setTimeout(() => this.isTyping.set(false), 2500);
    }
  };

  ngOnInit(): void {
    this.loadConversations();

    // Socket connection is already managed by AppComponent effect — no need to reconnect here
    // Just ensure listeners are registered
    this.socketService.on('new_message', this.onNewMessage);
    this.socketService.on('user_typing', this.onUserTyping);
  }

  ngAfterViewChecked(): void {
    if (this.shouldScrollToBottom) {
      this.scrollToBottom();
      this.shouldScrollToBottom = false;
    }
  }

  ngOnDestroy(): void {
    clearTimeout(this.typingTimeout);
    this.socketService.off('new_message', this.onNewMessage);
    this.socketService.off('user_typing', this.onUserTyping);
  }

  loadConversations(): void {
    this.isLoadingConversations.set(true);
    this.api.get<any[]>('/messages/conversations').subscribe({
      next: (res) => {
        if (res.success && res.data) {
          this.conversations.set(res.data);
        }
        this.isLoadingConversations.set(false);
      },
      error: () => this.isLoadingConversations.set(false),
    });
  }

  openConversation(conv: any): void {
    this.activeConversation.set(conv);
    this.isMobileChatOpen.set(true);
    this.isLoadingMessages.set(true);
    this.showEmojiPicker.set(false);
    this.socketService.joinConversation(conv._id);

    this.api.getPaginated<any>(`/messages/conversations/${conv._id}/messages`).subscribe({
      next: (res) => {
        if (res.data) {
          this.messages.set(res.data);
          this.shouldScrollToBottom = true;
        }
        this.isLoadingMessages.set(false);
      },
      error: () => this.isLoadingMessages.set(false),
    });

    setTimeout(() => {
      if (this.isBrowser && this.messageInput) {
        const el = this.messageInput as any;
        if (el.nativeElement) {
          const editorEl = el.nativeElement.querySelector('.ql-editor');
          if (editorEl) editorEl.focus();
          else el.nativeElement.focus();
        }
      }
    }, 300);
  }

  sendMessage(): void {
    if (!this.newMessage.trim() || !this.activeConversation() || this.isSendingLock) return;

    this.isSendingLock = true;

    const currentMsg = this.newMessage.trim();
    const currentConv = this.activeConversation();

    this.newMessage = '';
    this.showEmojiPicker.set(false);

    // ارسال فقط از طریق REST API — پاسخ سرور پیام واقعی را برمی‌گرداند
    // و سرور از طریق سوکت به سایر شرکت‌کنندگان ارسال می‌کند
    this.api
      .post<any>('/messages/send', {
        conversationId: currentConv._id,
        content: currentMsg,
      })
      .subscribe({
        next: (res) => {
          if (res.success && res.data) {
            const serverMsg = res.data;

            // اگر پیام قبلاً از طریق سوکت اضافه شده، دوباره اضافه نکن
            const alreadyExists = this.messages().some((m) => m._id === serverMsg._id);
            if (!alreadyExists) {
              this.messages.update((list) => [...list, serverMsg]);
              this.shouldScrollToBottom = true;
            }

            // آپدیت آخرین پیام در لیست مکالمات
            this.conversations.update((convs) =>
              convs.map((c) =>
                c._id === currentConv._id
                  ? { ...c, lastMessage: serverMsg, lastMessageAt: new Date().toISOString() }
                  : c,
              ),
            );
          }
          this.isSendingLock = false;
        },
        error: () => {
          this.newMessage = currentMsg; // بازگرداندن متن در صورت خطا
          this.isSendingLock = false;
        },
      });
  }

  // ──────────────────────────────────────
  //  New Conversation
  // ──────────────────────────────────────
  openNewConversationDialog(): void {
    this.showNewConversationDialog.set(true);
    this.selectedRecipient.set(null);
    this.newConversationMessage.set('');
    this.userSearchQuery.set('');
    this.loadAvailableUsers();
  }

  closeNewConversationDialog(): void {
    this.showNewConversationDialog.set(false);
    this.selectedRecipient.set(null);
    this.availableUsers.set([]);
  }

  loadAvailableUsers(): void {
    this.api.get<any[]>('/messages/available-users').subscribe({
      next: (res) => {
        if (res.success && res.data) {
          this.availableUsers.set(res.data);
        }
      },
    });
  }

  filteredAvailableUsers = computed(() => {
    const q = this.userSearchQuery().trim().toLowerCase();
    const list = this.availableUsers();
    if (!q) return list;
    return list.filter(
      (u) => u.fullName?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q),
    );
  });

  selectRecipient(user: any): void {
    this.selectedRecipient.set(user);
  }

  startNewConversation(): void {
    const recipient = this.selectedRecipient();
    const content = this.newConversationMessage().trim();
    if (!recipient || !content) return;

    this.isStartingConversation.set(true);

    this.api
      .post<any>('/messages/conversations', {
        recipientId: recipient._id,
        content,
      })
      .subscribe({
        next: (res) => {
          if (res.success && res.data) {
            const conv = res.data.conversation;
            this.conversations.update((list) => {
              const exists = list.find((c) => c._id === conv._id);
              if (exists) return list;
              return [conv, ...list];
            });
            this.openConversation(conv);
          }
          this.isStartingConversation.set(false);
          this.closeNewConversationDialog();
        },
        error: () => this.isStartingConversation.set(false),
      });
  }

  // ──────────────────────────────────────
  //  Broadcast
  // ──────────────────────────────────────
  openBroadcastDialog(): void {
    this.showBroadcastDialog.set(true);
    this.broadcastMessage.set('');
    this.broadcastMode.set('all');
    this.selectedBroadcastInstructors.set([]);
    this.instructorSearchQuery.set('');
    this.loadAvailableUsers();
  }

  closeBroadcastDialog(): void {
    this.showBroadcastDialog.set(false);
  }

  filteredBroadcastInstructors = computed(() => {
    const q = this.instructorSearchQuery().trim().toLowerCase();
    const list = this.availableUsers().filter((u) => u.role === 'instructor');
    if (!q) return list;
    return list.filter(
      (u) => u.fullName?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q),
    );
  });

  toggleBroadcastInstructor(instructor: any): void {
    this.selectedBroadcastInstructors.update((list) => {
      const exists = list.find((i) => i._id === instructor._id);
      if (exists) return list.filter((i) => i._id !== instructor._id);
      return [...list, instructor];
    });
  }

  isBroadcastInstructorSelected(instructor: any): boolean {
    return this.selectedBroadcastInstructors().some((i) => i._id === instructor._id);
  }

  sendBroadcast(): void {
    const content = this.broadcastMessage().trim();
    if (!content) return;

    this.isSendingBroadcast.set(true);

    const recipientIds =
      this.broadcastMode() === 'specific'
        ? this.selectedBroadcastInstructors().map((i) => i._id)
        : [];

    this.api
      .post<any>('/messages/broadcast', {
        content,
        recipientIds,
      })
      .subscribe({
        next: (res) => {
          if (res.success) {
            this.closeBroadcastDialog();
            this.loadConversations();
          }
          this.isSendingBroadcast.set(false);
        },
        error: () => this.isSendingBroadcast.set(false),
      });
  }

  // ──────────────────────────────────────
  //  Helpers
  // ──────────────────────────────────────
  onTyping(): void {
    const conv = this.activeConversation();
    if (conv) {
      this.socketService.emit('typing', { conversationId: conv._id });
    }
  }

  insertEmoji(emoji: string): void {
    this.newMessage += emoji;
    if (this.isBrowser && this.messageInput) {
      const el = this.messageInput as any;
      if (el.nativeElement) {
        const editorEl = el.nativeElement.querySelector('.ql-editor');
        if (editorEl) editorEl.focus();
        else el.nativeElement.focus();
      }
    }
  }

  toggleEmojiPicker(): void {
    this.showEmojiPicker.update((v) => !v);
  }

  closeMobileChat(): void {
    this.isMobileChatOpen.set(false);
    this.activeConversation.set(null);
    this.showEmojiPicker.set(false);
  }

  toggleInfoPanel(): void {
    this.isInfoPanelOpen.update((v) => !v);
  }

  viewProfile(): void {
    const partner = this.getOtherParticipant(this.activeConversation());
    if (!partner?._id) return;

    if (partner.role === 'instructor') {
      this.router.navigate(['/instructor', partner._id]);
    } else {
      this.router.navigate(['/dashboard/profile']);
    }
    this.isInfoPanelOpen.set(false);
  }

  muteConversation(): void {
    if (!this.activeConversation()) return;
    const conv = this.activeConversation();

    this.api.post<any>(`/messages/conversations/${conv._id}/mute`, {}).subscribe({
      next: (res) => {
        if (res.success) {
          const muted = res.data?.muted ?? true;
          this.conversations.update((list) =>
            list.map((c) => (c._id === conv._id ? { ...c, isMuted: muted } : c)),
          );
          this.activeConversation.update((c) =>
            c?._id === conv._id ? { ...c, isMuted: muted } : c,
          );
        }
      },
    });
  }

  blockUser(): void {
    const partner = this.getOtherParticipant(this.activeConversation());
    if (!partner?._id) return;

    if (!confirm(`آیا از مسدود کردن "${partner.fullName}" اطمینان دارید؟`)) return;

    this.api.post<any>(`/messages/block`, { userId: partner._id }).subscribe({
      next: () => {
        this.conversations.update((list) =>
          list.filter((c) => c._id !== this.activeConversation()?._id),
        );
        this.activeConversation.set(null);
        this.isInfoPanelOpen.set(false);
        this.isMobileChatOpen.set(false);
      },
    });
  }

  scrollToBottom(): void {
    if (this.isBrowser && this.scrollContainer) {
      try {
        const el = this.scrollContainer.nativeElement;
        el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
      } catch (err) {}
    }
  }

  getOtherParticipant(conv: any): any {
    if (!conv || !conv.participants) return { fullName: 'کاربر گفتگو' };
    const currentUserId = (this.authService.currentUser() as any)?._id;
    const partner = conv.participants.find((p: any) => p._id !== currentUserId);
    return partner || conv.participants[0] || { fullName: 'کاربر گفتگو' };
  }

  isMyMessage(msg: any): boolean {
    if (!msg) return false;
    const currentUserId = (this.authService.currentUser() as any)?._id;
    const senderId = msg.sender?._id || msg.sender;
    if (senderId && currentUserId) {
      return senderId.toString() === currentUserId.toString();
    }
    return (
      msg.sender?.fullName === 'شما' ||
      msg.sender?.fullName === this.authService.currentUser()?.fullName
    );
  }

  getInitials(name: string): string {
    if (!name) return 'گ';
    const parts = name.trim().split(' ');
    return parts.length >= 2 ? `${parts[0][0]}${parts[1][0]}` : parts[0][0];
  }

  getRoleLabel(role: string): string {
    switch (role) {
      case 'admin':
        return 'مدیر';
      case 'instructor':
        return 'مدرس';
      case 'student':
        return 'دانشجو';
      default:
        return '';
    }
  }

  shouldShowDateSeparator(index: number): boolean {
    if (index === 0) return true;
    const msgs = this.messages();
    if (!msgs[index] || !msgs[index - 1]) return false;
    const current = new Date(msgs[index].createdAt).toDateString();
    const previous = new Date(msgs[index - 1].createdAt).toDateString();
    return current !== previous;
  }

  getDateLabel(dateStr: string): string {
    const date = new Date(dateStr);
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    if (date.toDateString() === today.toDateString()) return 'امروز';
    if (date.toDateString() === yesterday.toDateString()) return 'دیروز';
    return date.toLocaleDateString('fa-IR');
  }

  shouldShowAvatar(index: number): boolean {
    const msgs = this.messages();
    if (index === 0) return true;
    return msgs[index].sender?._id !== msgs[index - 1].sender?._id;
  }

  filteredConversations = computed(() => {
    const q = this.searchQuery().trim().toLowerCase();
    const list = this.conversations();
    if (!q) return list;

    return list.filter((conv) => {
      const partner = this.getOtherParticipant(conv);
      const nameMatch = partner?.fullName?.toLowerCase().includes(q);
      const msgMatch = conv.lastMessage?.content?.toLowerCase().includes(q);
      return nameMatch || msgMatch;
    });
  });

  get skeletonArray(): number[] {
    return Array(6)
      .fill(0)
      .map((_, i) => i);
  }

  trackByConvId(index: number, conv: any): string {
    return conv._id;
  }

  trackByMsgId(index: number, msg: any): string {
    return msg._id;
  }
  /**
 * حذف تگ‌های HTML و نمایش متن خالص برای پیش‌نمایش
 */
stripHtml(html: string | undefined | null): string {
  if (!html) return 'هنوز پیامی ارسال نشده';
  
  // حذف تگ‌های HTML
  const temp = document.createElement('div');
  temp.innerHTML = html;
  const text = temp.textContent || temp.innerText || '';
  
  // حذف فاصله‌های اضافی
  return text.trim().replace(/\s+/g, ' ') || 'پیام خالی';
}

/**
 * کوتاه کردن متن با اضافه کردن ...
 */
truncateText(text: string, maxLength: number = 50): string {
  if (!text) return '';
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + '...';
}

/**
 * پیش‌نمایش پیام برای Sidebar
 */
getMessagePreview(content: string | undefined | null): string {
  const plainText = this.stripHtml(content);
  return this.truncateText(plainText, 60);
}
}

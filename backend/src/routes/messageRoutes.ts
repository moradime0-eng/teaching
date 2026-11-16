import { Router } from 'express';
import {
  startConversation,
  getMyConversations,
  getConversationMessages,
  sendMessage,
  deleteMessage,
  getAvailableUsers,
  sendBroadcast,
  muteConversation,
  blockUser,
  getMyUnreadSummary,
  markAllConversationsRead,
} from '../controllers/messageController';
import { authenticate } from '../middlewares/auth';
import { validate } from '../middlewares/validate';
import {
  sendMessageValidator,
  startConversationValidator,
  broadcastValidator,
} from '../validators/messageValidator';
import { sanitizeRichText } from '../middlewares/sanitize.middleware';
import { generalLimiter } from '../middlewares/rateLimiter';

const router = Router();

router.use(authenticate);

// ── مکالمات ──
router.post('/conversations', validate(startConversationValidator), sanitizeRichText, startConversation);
router.get('/conversations', getMyConversations);
router.get('/conversations/:id/messages', getConversationMessages);

// ── ارسال پیام ──
router.post('/send', validate(sendMessageValidator), sanitizeRichText, sendMessage);

// ── کاربران قابل پیام‌رسانی ──
router.get('/available-users', getAvailableUsers);

// ── پیام مشترک (فقط ادمین) ──
router.post('/broadcast', validate(broadcastValidator), sanitizeRichText, sendBroadcast);

// ── بی‌صدا کردن مکالمه ──
router.post('/conversations/:id/mute', muteConversation);

// ── مسدود کردن کاربر ──
router.post('/block', blockUser);

// ── خلاصه اعلان‌ها و پیام‌های خوانده‌نشده ──
// ⚠️ FIX: کش حذف شد — این داده برای هر کاربر متفاوت و لحظه‌ای است
// (کش‌کردن آن باعث نشت داده بین کاربران و شمارش‌های کهنه می‌شد)
router.get('/unread-summary', getMyUnreadSummary);

// ── علامت‌گذاری همه مکالمات خوانده‌شده ──
router.put('/read-all', markAllConversationsRead);

// ── حذف پیام ──
router.delete('/:id', deleteMessage);

export default router;
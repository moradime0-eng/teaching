import { Server as SocketServer, Socket } from 'socket.io';
import mongoose from 'mongoose';
import Notification from '../models/Notification';

export const registerNotificationHandlers = (io: SocketServer, socket: Socket) => {
  const userId = socket.data.userId;

  /** ارسال شمارنده خوانده‌نشده به همه تب‌های همین کاربر */
  const broadcastUnreadCount = async (): Promise<void> => {
    try {
      const count = await Notification.countDocuments({
        recipient: userId,
        isRead: false,
      });
      io.to(`user:${userId}`).emit('unread_count', { count });
    } catch (error) {
      console.error('Unread count error:', error);
    }
  };

  // Get unread count on connect
  socket.on('get_unread_count', async () => {
    try {
      const count = await Notification.countDocuments({
        recipient: userId,
        isRead: false,
      });
      socket.emit('unread_count', { count });
    } catch (error) {
      socket.emit('error', { message: 'خطا در دریافت تعداد اعلان‌ها' });
    }
  });

  // Mark notification as read via socket
  socket.on('mark_notification_read', async (notificationId: string) => {
    try {
      // ⚠️ FIX: اعتبارسنجی شناسه — جلوگیری از CastError مongoose
      if (!mongoose.isValidObjectId(notificationId)) return;

      await Notification.findOneAndUpdate(
        { _id: notificationId, recipient: userId },
        { $set: { isRead: true, readAt: new Date() } },
      );

      // ⚠️ FIX: به‌روزرسانی همه تب‌های کاربر (قبلاً فقط همین سوکت)
      await broadcastUnreadCount();
    } catch (error) {
      console.error('Mark notification read error:', error);
    }
  });
};
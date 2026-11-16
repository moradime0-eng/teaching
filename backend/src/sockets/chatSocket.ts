import { Server as SocketServer, Socket } from 'socket.io';
import Message from '../models/Message';
import Conversation from '../models/Conversation';

export const registerChatHandlers = (io: SocketServer, socket: Socket) => {
  const userId = socket.data.userId;
  const tenantId = socket.data.tenantId;

  socket.join(`user:${userId}`);

  // ── پیوستن به روم مکالمه ──
  socket.on('join_conversation', async (conversationId: string) => {
    try {
      const query: any = {
        _id: conversationId,
        participants: userId,
      };
      if (tenantId) query.tenant = tenantId;

      const conversation = await Conversation.findOne(query);
      if (conversation) {
        socket.join(`conversation:${conversationId}`);
        console.log(`👤 User ${userId} joined conversation ${conversationId}`);
      } else {
        socket.emit('error', { message: 'دسترسی به مکالمه ندارید' });
      }
    } catch (error) {
      console.error('join_conversation error:', error);
      socket.emit('error', { message: 'خطا در پیوستن به مکالمه' });
    }
  });

  socket.on('leave_conversation', (conversationId: string) => {
    socket.leave(`conversation:${conversationId}`);
  });

  // ── دریافت پیام از سوکت و پژواک (Echo) به فرستنده با clientMsgId ──
  socket.on(
    'send_message',
    async (data: {
      conversationId: string;
      content: string;
      replyTo?: string;
      clientMsgId?: string;
    }) => {
      try {
        const { conversationId, content, replyTo, clientMsgId } = data;

        if (!content || !content.trim()) {
          socket.emit('error', { message: 'متن پیام الزامی است' });
          return;
        }

        const query: any = {
          _id: conversationId,
          participants: userId,
        };
        if (tenantId) query.tenant = tenantId;

        const conversation = await Conversation.findOne(query);
        if (!conversation) {
          socket.emit('error', { message: 'دسترسی به مکالمه ندارید' });
          return;
        }

        const messageData: any = {
          conversation: conversationId,
          sender: userId,
          content: content.trim(),
          replyTo: replyTo || undefined,
        };
        if (tenantId) messageData.tenant = tenantId;

        const message = await Message.create(messageData);

        conversation.lastMessage = message._id;
        conversation.lastMessageAt = new Date();

        // افزایش شمارنده پیام‌های خوانده نشده برای سایر کاربران
        const others = conversation.participants.filter((p) => p.toString() !== userId.toString());
        for (const participant of others) {
          const ucIndex = conversation.unreadCount.findIndex(
            (uc) => uc.user.toString() === participant.toString(),
          );
          if (ucIndex > -1) {
            conversation.unreadCount[ucIndex].count += 1;
          } else {
            conversation.unreadCount.push({ user: participant, count: 1 });
          }
        }

        await conversation.save();

        const populatedMessage = await Message.findById(message._id).populate(
          'sender',
          'fullName avatar role',
        );

        // 🔑 کلید حل مشکل: کپسوله‌سازی پاسخ سوکت به همراه فیلد clientMsgId
        const socketPayload = {
          conversation: conversationId,
          message: populatedMessage,
          clientMsgId: clientMsgId || null,
        };

        // ارسال پیام به روم مکالمه (فرستنده پیام هم به این روم وصل است و آن را دریافت می‌کند)
        io.to(`conversation:${conversationId}`).emit('new_message', socketPayload);

        // ارسال سیگنال نوتیفیکیشن اختصاصی برای سایرین
        for (const participant of others) {
          io.to(`user:${participant}`).emit('new_message_notification', {
            conversation: conversationId,
            message: populatedMessage,
          });
        }
      } catch (error: any) {
        console.error('send_message error:', error);
        socket.emit('error', { message: 'خطا در ارسال پیام: ' + error.message });
      }
    },
  );

  // Typing indicators
  socket.on('typing', (data: { conversationId: string }) => {
    socket.to(`conversation:${data.conversationId}`).emit('user_typing', {
      userId,
      conversationId: data.conversationId,
    });
  });

  socket.on('stop_typing', (data: { conversationId: string }) => {
    socket.to(`conversation:${data.conversationId}`).emit('user_stop_typing', {
      userId,
      conversationId: data.conversationId,
    });
  });

  socket.on('mark_read', async (data: { conversationId: string }) => {
    try {
      await Message.updateMany(
        {
          conversation: data.conversationId,
          sender: { $ne: userId },
          'readBy.user': { $ne: userId },
        },
        { $push: { readBy: { user: userId, readAt: new Date() } } },
      );

      await Conversation.updateOne(
        { _id: data.conversationId, 'unreadCount.user': userId },
        { $set: { 'unreadCount.$.count': 0 } },
      );

      socket.to(`conversation:${data.conversationId}`).emit('messages_read', {
        userId,
        conversationId: data.conversationId,
      });
    } catch (error) {
      console.error('mark_read error:', error);
    }
  });
};

import { Request, Response } from 'express';
import Conversation from '../models/Conversation';
import Message from '../models/Message';
import Notification from '../models/Notification';
import User from '../models/User';
import Course from '../models/Course';
import Enrollment from '../models/Enrollment';
import { ApiError } from '../utils/ApiError';
import { ApiResponse } from '../utils/ApiResponse';
import { asyncHandler } from '../middlewares/asyncHandler';
import { getPaginationOptions } from '../utils/paginationHelper';
import { getIO } from '../config/socket';
import mongoose from 'mongoose';

const getTenantId = (req: Request): mongoose.Types.ObjectId | undefined => {
  const user = req.user as any;
  const tenant =
    (req as any).tenant?._id || (req as any).tenantId || user?.activeTenant || user?.tenant;

  return tenant ? new mongoose.Types.ObjectId(tenant.toString()) : undefined;
};

const canMessage = (senderRole: string, recipientRole: string): boolean => {
  if (senderRole === 'admin' && recipientRole === 'instructor') return true;
  if (senderRole === 'instructor' && recipientRole === 'admin') return true;
  if (senderRole === 'student' && recipientRole === 'instructor') return true;
  if (senderRole === 'instructor' && recipientRole === 'student') return true;
  return false;
};

const getRoleMismatchMessage = (senderRole: string, recipientRole: string): string => {
  if (senderRole === 'student' && recipientRole === 'student')
    return 'دانشجویان نمی‌توانند به یکدیگر پیام ارسال کنند';
  if (senderRole === 'student' && recipientRole === 'admin')
    return 'دانشجویان فقط می‌توانند به مدیرِ مدرس دوره‌هایشان پیام ارسال کنند';
  if (senderRole === 'admin' && recipientRole === 'student')
    return 'مدیر فقط می‌تواند به دانشجویان دوره‌های خودش پیام ارسال کند';
  return 'ارسال پیام به این کاربر مجاز نیست';
};

/**
 * ✅ آیا دانشجو و مدیر بر سر دوره‌ای مشترک‌اند که مدیر مدرس (یا مدرس همکار) آن است؟
 * شرط دسترسی دانشجو یکی از این دوست:
 *   ۱) ثبت‌نام فعال در دوره (isRefunded نباشد)
 *   یا ۲) دوره رایگان باشد (دسترسی آزاد — مانند بخش پرسش و پاسخ کلاس‌روم)
 * اگر courseId داده شده باشد فقط همان دوره بررسی می‌شود.
 */
const sharesCourseAsTeacher = async (
  studentId: string,
  adminId: string,
  courseId?: string,
): Promise<boolean> => {
  try {
    const courseFilter: any = {
      $or: [{ instructor: adminId }, { coInstructors: adminId }],
    };
    if (courseId) {
      if (!mongoose.isValidObjectId(courseId)) return false;
      courseFilter._id = courseId;
    }

    const courses = await Course.find(courseFilter).select('_id isFree').lean();
    if (!courses.length) return false;

    // دوره رایگان → دسترسی آزاد
    if (courses.some((c: any) => c.isFree)) return true;

    // در غیر این صورت باید ثبت‌نام غیربازپرداختی داشته باشد
    const enrollment = await Enrollment.findOne({
      student: studentId,
      course: { $in: courses.map((c: any) => c._id) },
      isRefunded: { $ne: true },
    })
      .select('_id')
      .lean();

    return !!enrollment;
  } catch {
    return false;
  }
};

/**
 * ادمین‌هایی که مدرس دوره‌های قابل دسترس دانشجو هستند
 * (برای نمایش در لیست «مکالمه جدید» دانشجو)
 */
const findAdminTeacherIdsForStudent = async (
  studentId: string,
): Promise<mongoose.Types.ObjectId[]> => {
  try {
    const enrollments = await Enrollment.find({
      student: studentId,
      isRefunded: { $ne: true },
    })
      .select('course')
      .lean();

    const enrolledIds = enrollments.map((e: any) => e.course);
    const accessConditions: any[] = [{ isFree: true }];
    if (enrolledIds.length > 0) accessConditions.push({ _id: { $in: enrolledIds } });

    const courses = await Course.find({ $or: accessConditions })
      .select('instructor coInstructors')
      .lean();

    const teacherIds = new Set<string>();
    for (const c of courses) {
      if (c.instructor) teacherIds.add(c.instructor.toString());
      for (const co of c.coInstructors || []) {
        const id = (co && typeof co === 'object' ? (co as any)._id || co : co)?.toString();
        if (id) teacherIds.add(id);
      }
    }
    if (teacherIds.size === 0) return [];

    const admins = await User.find({ _id: { $in: [...teacherIds] }, role: 'admin' })
      .select('_id')
      .lean();
    return admins.map((a: any) => a._id);
  } catch {
    return [];
  }
};

const flattenUnreadCount = (conv: any, userId: string): number => {
  if (!conv.unreadCount || !Array.isArray(conv.unreadCount)) return 0;
  const entry = conv.unreadCount.find(
    (uc: any) => uc.user?.toString() === userId || uc.user?._id?.toString() === userId,
  );
  return entry ? entry.count : 0;
};

export const startConversation = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();

  const { recipientId, courseId, content } = req.body;
  const tenantId = getTenantId(req);

  if (recipientId === req.user._id.toString()) {
    throw ApiError.badRequest('نمی‌توانید به خودتان پیام ارسال کنید');
  }

  const recipient = await User.findById(recipientId).select('fullName role avatar');
  if (!recipient) throw ApiError.notFound('گیرنده یافت نشد');

  if (!canMessage(req.user.role, recipient.role)) {
    // ✅ استثنا: دانشجو ↔ مدیر — اگر مدیر «مدرس» دوره‌ای باشد که دانشجو به آن
    // دسترسی دارد (ثبت‌نام فعال یا دوره رایگان)، دقیقاً مثل مدرس عادی اجازه پیام دارد
    const isStudentAdminPair =
      (req.user.role === 'student' && recipient.role === 'admin') ||
      (req.user.role === 'admin' && recipient.role === 'student');

    const hasSharedCourse = isStudentAdminPair
      ? await sharesCourseAsTeacher(
          req.user.role === 'student' ? req.user._id.toString() : recipientId, // دانشجو
          req.user.role === 'admin' ? req.user._id.toString() : recipientId, // مدیر-مدرس
          courseId,
        )
      : false;

    if (!hasSharedCourse) {
      throw ApiError.forbidden(getRoleMismatchMessage(req.user.role, recipient.role));
    }
  }

  let conversation = await Conversation.findOne({
    isGroup: false,
    participants: { $all: [req.user._id, recipientId] },
  });

  let isNew = false;
  if (!conversation) {
    isNew = true;
    const convData: any = {
      participants: [req.user._id, recipientId],
      course: courseId || undefined,
      unreadCount: [
        { user: req.user._id, count: 0 },
        { user: recipientId, count: 1 },
      ],
    };
    if (tenantId) convData.tenant = tenantId;

    conversation = await Conversation.create(convData);
  }

  if (isNew && content) {
    const messageData: any = {
      conversation: conversation._id,
      sender: req.user._id,
      content,
    };
    if (tenantId) messageData.tenant = tenantId;

    const message = await Message.create(messageData);

    conversation.lastMessage = message._id;
    conversation.lastMessageAt = new Date();
    await conversation.save();

    await message.populate('sender', 'fullName avatar role');

    try {
      const io = getIO();
      const payload = {
        conversation: conversation._id,
        message,
        clientMsgId: null,
      };
      io.to(`user:${recipientId}`).emit('new_message', payload);
      io.to(`conversation:${conversation._id}`).emit('new_message', payload);
    } catch {
      // Socket not initialized
    }
  }

  await conversation.populate('participants', 'fullName avatar role');
  if (conversation.lastMessage) {
    await conversation.populate('lastMessage');
  }

  return ApiResponse.created(
    res,
    { conversation, unreadCount: flattenUnreadCount(conversation, req.user._id.toString()) },
    isNew ? 'مکالمه شروع شد' : 'مکالمه موجود یافت شد',
  );
});

export const getAvailableUsers = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();

  const role = req.user.role;
  let targetRoles: string[] = [];

  if (role === 'student') {
    targetRoles = ['instructor'];
  } else if (role === 'instructor') {
    targetRoles = ['student', 'admin'];
  } else if (role === 'admin') {
    targetRoles = ['instructor'];
  }

  let filter: any = { role: { $in: targetRoles } };

  // ✅ دانشجو باید ادمین‌هایی را هم ببیند که مدرس دوره‌های او هستند
  // (در غیر این صورت در لیست «مکالمه جدید» اصلاً دیده نمی‌شدند)
  if (role === 'student') {
    const adminTeacherIds = await findAdminTeacherIdsForStudent(req.user._id.toString());
    if (adminTeacherIds.length > 0) {
      filter = {
        $or: [{ role: { $in: targetRoles } }, { _id: { $in: adminTeacherIds } }],
      };
    }
  }

  const users = await User.find(filter)
    .select('fullName email avatar role')
    .sort({ fullName: 1 })
    .lean();

  return ApiResponse.success(res, users);
});

export const sendBroadcast = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  if (req.user.role !== 'admin') {
    throw ApiError.forbidden('فقط مدیر می‌تواند پیام مشترک ارسال کند');
  }

  const { recipientIds, content } = req.body;
  const tenantId = getTenantId(req);

  let targetInstructorIds: string[] = recipientIds;

  if (!targetInstructorIds || targetInstructorIds.length === 0) {
    const instructors = await User.find({ role: 'instructor' }).select('_id').lean();
    targetInstructorIds = instructors.map((i) => i._id.toString());
  }

  if (targetInstructorIds.length === 0) {
    throw ApiError.notFound('هیچ استادی یافت نشد');
  }

  const results: any[] = [];

  for (const instructorId of targetInstructorIds) {
    let conversation = await Conversation.findOne({
      isGroup: false,
      participants: { $all: [req.user._id, instructorId] },
    });

    if (!conversation) {
      const convData: any = {
        participants: [req.user._id, instructorId],
        unreadCount: [
          { user: req.user._id, count: 0 },
          { user: instructorId, count: 1 },
        ],
      };
      if (tenantId) convData.tenant = tenantId;

      conversation = await Conversation.create(convData);
    }

    const messageData: any = {
      conversation: conversation._id,
      sender: req.user._id,
      content,
    };
    if (tenantId) messageData.tenant = tenantId;

    const message = await Message.create(messageData);

    conversation.lastMessage = message._id;
    conversation.lastMessageAt = new Date();

    const ucIndex = conversation.unreadCount.findIndex((uc) => uc.user.toString() === instructorId);
    if (ucIndex > -1) {
      conversation.unreadCount[ucIndex].count += 1;
    } else {
      conversation.unreadCount.push({ user: instructorId as any, count: 1 });
    }
    await conversation.save();

    await message.populate('sender', 'fullName avatar role');

    try {
      const io = getIO();
      const payload = {
        conversation: conversation._id,
        message,
        clientMsgId: null,
      };
      io.to(`user:${instructorId}`).emit('new_message', payload);
      io.to(`conversation:${conversation._id}`).emit('new_message', payload);
    } catch {
      // Socket not initialized
    }

    results.push({ instructorId, conversationId: conversation._id, messageId: message._id });
  }

  return ApiResponse.created(
    res,
    { sent: results.length, details: results },
    `پیام مشترک به ${results.length} استاد ارسال شد`,
  );
});

export const getMyConversations = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();

  const conversations = await Conversation.find({
    participants: req.user._id,
  })
    .populate('participants', 'fullName avatar role')
    .populate('lastMessage')
    .populate('course', 'title slug')
    .sort({ lastMessageAt: -1 });

  const result = conversations.map((conv) => {
    const obj: any = conv.toObject();
    obj.unreadCount = flattenUnreadCount(obj, req.user!._id.toString());
    obj.isMuted =
      obj.mutedBy?.some((uid: any) => uid.toString() === req.user!._id.toString()) || false;
    return obj;
  });

  return ApiResponse.success(res, result);
});

export const getConversationMessages = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  if (!req.user) throw ApiError.unauthorized();
  const { page, limit, skip } = getPaginationOptions(req, 50);

  const conversation = await Conversation.findOne({
    _id: id,
    participants: req.user._id,
  });

  if (!conversation) throw ApiError.forbidden('دسترسی به این مکالمه ندارید');

  const messages = await Message.find({ conversation: id, isDeleted: false })
    .populate('sender', 'fullName avatar role')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);

  const total = await Message.countDocuments({ conversation: id, isDeleted: false });

  await Message.updateMany(
    { conversation: id, sender: { $ne: req.user._id }, 'readBy.user': { $ne: req.user._id } },
    { $push: { readBy: { user: req.user._id, readAt: new Date() } } },
  );

  await Conversation.updateOne(
    { _id: id, 'unreadCount.user': req.user._id },
    { $set: { 'unreadCount.$.count': 0 } },
  );

  return ApiResponse.paginated(res, messages.reverse(), page, limit, total);
});

// ─── متد ارسال پیام REST با پشتیبانی کامل از همگام‌ساز سوکت ───
export const sendMessage = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();

  const { conversationId, content, replyTo, clientMsgId } = req.body;
  const tenantId = getTenantId(req);

  const conversation = await Conversation.findOne({
    _id: conversationId,
    participants: req.user._id,
  });

  if (!conversation) throw ApiError.forbidden('دسترسی به این مکالمه ندارید');

  const messageData: any = {
    conversation: conversationId,
    sender: req.user._id,
    content,
    replyTo: replyTo || undefined,
  };
  if (tenantId) messageData.tenant = tenantId;

  const message = await Message.create(messageData);

  conversation.lastMessage = message._id;
  conversation.lastMessageAt = new Date();

  const otherParticipants = conversation.participants.filter(
    (p) => p.toString() !== req.user!._id.toString(),
  );

  for (const participant of otherParticipants) {
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
  await message.populate('sender', 'fullName avatar role');

  try {
    const io = getIO();
    const payload = {
      conversation: conversationId,
      message,
      clientMsgId: clientMsgId || null, // پژواک شناسه موقت
    };

    io.to(`conversation:${conversationId}`).emit('new_message', payload);

    for (const participant of otherParticipants) {
      io.to(`user:${participant}`).emit('new_message_notification', {
        conversation: conversationId,
        message,
      });
    }
  } catch (err) {
    console.error('Socket emit error:', err);
  }

  return ApiResponse.created(
    res,
    { ...message.toObject(), clientMsgId: clientMsgId || null },
    'پیام ارسال شد',
  );
});

export const deleteMessage = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  if (!req.user) throw ApiError.unauthorized();

  const message = await Message.findOne({ _id: id, sender: req.user._id });
  if (!message) throw ApiError.notFound('پیام یافت نشد');

  message.isDeleted = true;
  message.content = 'این پیام حذف شده است';
  await message.save();

  return ApiResponse.success(res, null, 'پیام حذف شد');
});

export const muteConversation = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();

  const { id } = req.params;

  const conversation = await Conversation.findOne({
    _id: id,
    participants: req.user._id,
  });

  if (!conversation) throw ApiError.forbidden('دسترسی به این مکالمه ندارید');

  const userId = req.user._id as mongoose.Types.ObjectId;
  const isMuted = conversation.mutedBy.some((uid) => uid.equals(userId));

  if (isMuted) {
    await Conversation.updateOne({ _id: id }, { $pull: { mutedBy: userId } });
    return ApiResponse.success(res, { muted: false }, 'مکالمه از حالت بی‌صدا خارج شد');
  } else {
    await Conversation.updateOne({ _id: id }, { $addToSet: { mutedBy: userId } });
    return ApiResponse.success(res, { muted: true }, 'مکالمه بی‌صدا شد');
  }
});

export const blockUser = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();

  const { userId } = req.body;

  if (!userId) throw ApiError.badRequest('شناسه کاربر الزامی است');

  if (userId === req.user._id.toString()) {
    throw ApiError.badRequest('نمی‌توانید خودتان را مسدود کنید');
  }

  const targetUser = await User.findById(userId).select('_id fullName');
  if (!targetUser) throw ApiError.notFound('کاربر یافت نشد');

  await Conversation.deleteMany({
    participants: { $all: [req.user._id, userId] },
  });

  return ApiResponse.success(res, null, `${targetUser.fullName} مسدود شد`);
});

// ─── خلاصه اعلان‌ها و پیام‌های خوانده‌نشده ───
export const getMyUnreadSummary = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();

  const userId = req.user._id;

  // ۱. شمارش پیام‌های خوانده‌نشده از مکالمات
  const conversations = await Conversation.find({
    participants: userId,
  }).select('unreadCount participants lastMessage lastMessageAt').lean();

  let totalUnreadMessages = 0;
  const unreadConversations: any[] = [];

  for (const conv of conversations) {
    const count = flattenUnreadCount(conv, userId.toString());
    if (count > 0) {
      totalUnreadMessages += count;
      unreadConversations.push({
        conversationId: conv._id,
        unreadCount: count,
        lastMessageAt: conv.lastMessageAt,
      });
    }
  }

  // ۲. شمارش اعلان‌های خوانده‌نشده
  const [totalUnreadNotifications, recentNotifications] = await Promise.all([
    Notification.countDocuments({ recipient: userId, isRead: false }),
    Notification.find({ recipient: userId, isRead: false })
      .populate('sender', 'fullName avatar')
      .sort({ createdAt: -1 })
      .limit(5)
      .lean(),
  ]);

  // ۴. آخرین پیام‌های خوانده‌نشده از مکالمات (حداکثر ۵ تا)
  const recentUnreadMessages: any[] = [];
  const sortedConvs = unreadConversations
    .sort((a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime())
    .slice(0, 5);

  if (sortedConvs.length > 0) {
    const convIds = sortedConvs.map((c) => c.conversationId);
    // Single batch query instead of N individual queries
    const lastMessages = await Message.aggregate([
      { $match: { conversation: { $in: convIds }, sender: { $ne: userId } } },
      { $sort: { createdAt: -1 } },
      { $group: { _id: '$conversation', doc: { $first: '$$ROOT' } } },
      { $replaceRoot: { newRoot: '$doc' } },
      {
        $lookup: {
          from: 'users',
          localField: 'sender',
          foreignField: '_id',
          as: 'sender',
        },
      },
      { $unwind: { path: '$sender', preserveNullAndEmptyArrays: true } },
      // ⚠️ FIX: فیلد conversation باید در $project باشد — در غیر این صورت
      // بعد از پروجکشن حذف می‌شد و m.conversation.toString() پایین خط می‌خورد
      {
        $project: {
          conversation: 1,
          'sender.fullName': 1,
          'sender.avatar': 1,
          content: 1,
          createdAt: 1,
        },
      },
    ]);

    const msgMap = new Map(
      lastMessages
        .filter((m) => m?.conversation)
        .map((m) => [m.conversation.toString(), m]),
    );

    for (const uc of sortedConvs) {
      const lastMsg = uc.conversationId ? msgMap.get(uc.conversationId.toString()) : undefined;
      if (lastMsg) {
        recentUnreadMessages.push({
          conversationId: uc.conversationId,
          message: lastMsg,
          unreadCount: uc.unreadCount,
        });
      }
    }
  }

  return ApiResponse.success(res, {
    totalUnread: totalUnreadMessages + totalUnreadNotifications,
    unreadMessages: totalUnreadMessages,
    unreadNotifications: totalUnreadNotifications,
    recentNotifications,
    recentMessages: recentUnreadMessages,
  });
});

// ─── علامت‌گذاری همه مکالمات به‌عنوان خوانده‌شده ───
export const markAllConversationsRead = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();

  await Conversation.updateMany(
    { participants: req.user._id, 'unreadCount.user': req.user._id },
    { $set: { 'unreadCount.$.count': 0 } },
  );

  return ApiResponse.success(res, null, 'همه مکالمات به‌عنوان خوانده‌شده علامت‌گذاری شد');
});

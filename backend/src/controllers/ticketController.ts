import { Request, Response } from 'express';
import Ticket from '../models/Ticket';
import User from '../models/User';
import { ApiError } from '../utils/ApiError';
import { ApiResponse } from '../utils/ApiResponse';
import { asyncHandler } from '../middlewares/asyncHandler';
import { getPaginationOptions } from '../utils/paginationHelper';
import { TicketStatus } from '../types';
import { createNotification } from './notificationController';
import { NotificationType } from '../types';

const generateTicketNumber = (): string => {
  const date = new Date();
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const rand = Math.floor(Math.random() * 10000)
    .toString()
    .padStart(4, '0');
  return `TKT-${y}${m}${d}-${rand}`;
};

/**
 * شناسه همه ادمین‌ها (به‌جز کاربر مشخص‌شده)
 * برای تیکت‌های بدون مسئول — اطلاع‌رسانی نباید گم شود.
 */
const getAdminRecipientIds = async (excludeUserId?: string): Promise<string[]> => {
  try {
    const admins = await User.find({ role: 'admin' }).select('_id').lean();
    return admins
      .map((a: any) => a._id.toString())
      .filter((id: string) => id !== excludeUserId);
  } catch {
    return [];
  }
};

export const createTicket = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();

  const { subject, category, priority, message, relatedCourse } = req.body;

  const ticket = await Ticket.create({
    user: req.user._id,
    ticketNumber: generateTicketNumber(),
    subject,
    category,
    priority: priority || 'medium',
    messages: [
      {
        sender: req.user._id,
        content: message,
        createdAt: new Date(),
      },
    ],
    relatedCourse: relatedCourse || undefined,
  });

  // populate user info before returning
  await ticket.populate('user', 'fullName email role avatar');

  // 🔔 FIX: اطلاع‌رسانی به ادمین‌ها هنگام ثبت تیکت جدید
  // (قبلاً هیچ نوتیفیکیشنی ارسال نمی‌شد و تیکت‌ها دیده نمی‌شدند)
  try {
    const adminIds = await getAdminRecipientIds(req.user._id.toString());
    for (const adminId of adminIds) {
      await createNotification({
        recipient: adminId,
        sender: req.user._id.toString(),
        type: NotificationType.NEW_MESSAGE,
        title: 'تیکت پشتیبانی جدید',
        message: `${req.user.fullName} تیکت جدیدی با موضوع «${subject}» ثبت کرد.`,
        link: `/admin/tickets?ticket=${ticket._id}`,
        data: { ticketId: ticket._id.toString(), ticketNumber: ticket.ticketNumber },
      });
    }
  } catch {
    // اطلاع‌رسانی نباید ثبت تیکت را بشکند
  }

  return ApiResponse.created(res, ticket, 'تیکت شما با موفقیت ثبت شد');
});

export const getMyTickets = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const { page, limit, skip } = getPaginationOptions(req);

  const filter: Record<string, any> = { user: req.user._id };
  if (req.query.status) filter.status = req.query.status;

  const tickets = await Ticket.find(filter)
    .populate('user', 'fullName email role avatar')
    .populate('messages.sender', 'fullName avatar role')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);

  const total = await Ticket.countDocuments(filter);

  return ApiResponse.paginated(res, tickets, page, limit, total);
});

export const getTicketById = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  if (!req.user) throw ApiError.unauthorized();

  const ticket = await Ticket.findOne({
    _id: id,
    ...(req.user.role !== 'admin' ? { user: req.user._id } : {}),
  })
    .populate('user', 'fullName email avatar role')
    .populate('messages.sender', 'fullName avatar role')
    .populate('assignedTo', 'fullName')
    .populate('relatedCourse', 'title slug');

  if (!ticket) throw ApiError.notFound('تیکت یافت نشد');

  return ApiResponse.success(res, ticket);
});

export const replyToTicket = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  if (!req.user) throw ApiError.unauthorized();
  const { content } = req.body;

  const ticket = await Ticket.findOne({
    _id: id,
    ...(req.user.role !== 'admin' ? { user: req.user._id } : {}),
  });

  if (!ticket) throw ApiError.notFound('تیکت یافت نشد');

  if (ticket.status === TicketStatus.CLOSED) {
    throw ApiError.badRequest('این تیکت بسته شده است');
  }

  ticket.messages.push({
    sender: req.user._id,
    content,
    createdAt: new Date(),
  });

  if (req.user.role === 'admin' && ticket.status === TicketStatus.OPEN) {
    ticket.status = TicketStatus.IN_PROGRESS;
  }

  // Capture IDs before populate (populate replaces ObjectId refs with full objects)
  const ticketUserId = ticket.user.toString();

  await ticket.save();

  // Re-populate after save
  await ticket.populate('user', 'fullName email avatar role');
  await ticket.populate('messages.sender', 'fullName avatar role');

  // 🔔 FIX: اطلاع‌رسانی به طرف مقابل
  // - ادمین پاسخ داده → صاحب تیکت
  // - شرکت‌کننده پاسخ داده → ادمین اختصاص‌یافته؛ اگر تیکت هنوز واگذار نشده → همه ادمین‌ها
  //   (قبلاً وقتی assignedTo خالی بود هیچ نوتیفیکیشنی ارسال نمی‌شد)
  try {
    if (req.user.role === 'admin') {
      await createNotification({
        recipient: ticketUserId,
        sender: req.user._id.toString(),
        type: NotificationType.NEW_MESSAGE,
        title: 'پاسخ جدید تیکت',
        message: `پاسخ جدیدی برای تیکت «${ticket.subject}» ثبت شد.`,
        link: `/support?ticket=${ticket._id}`,
        data: { ticketId: ticket._id.toString() },
      });
    } else {
      const assignedAdmin = ticket.assignedTo?.toString();
      const recipients = assignedAdmin
        ? [assignedAdmin]
        : await getAdminRecipientIds(req.user._id.toString());

      for (const recipientId of recipients) {
        await createNotification({
          recipient: recipientId,
          sender: req.user._id.toString(),
          type: NotificationType.NEW_MESSAGE,
          title: 'پاسخ جدید تیکت',
          message: `${req.user.fullName} به تیکت «${ticket.subject}» پاسخ داد.`,
          link: `/admin/tickets?ticket=${ticket._id}`,
          data: { ticketId: ticket._id.toString() },
        });
      }
    }
  } catch {
    // اطلاع‌رسانی نباید ثبت پاسخ را بشکند
  }

  return ApiResponse.success(res, ticket, 'پاسخ شما ثبت شد');
});

export const updateTicketStatus = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const { status } = req.body;

  const ticket = await Ticket.findById(id);
  if (!ticket) throw ApiError.notFound('تیکت یافت نشد');

  ticket.status = status;
  if (status === TicketStatus.RESOLVED) ticket.resolvedAt = new Date();
  if (status === TicketStatus.CLOSED) ticket.closedAt = new Date();
  await ticket.save();

  await ticket.populate('user', 'fullName email role avatar');

  return ApiResponse.success(res, ticket, 'وضعیت تیکت بروزرسانی شد');
});

export const assignTicket = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const { assignedTo } = req.body;

  const ticket = await Ticket.findByIdAndUpdate(id, { $set: { assignedTo } }, { new: true })
    .populate('user', 'fullName email role avatar');

  if (!ticket) throw ApiError.notFound('تیکت یافت نشد');

  return ApiResponse.success(res, ticket, 'تیکت اختصاص داده شد');
});

export const getAllTickets = asyncHandler(async (req: Request, res: Response) => {
  const { page, limit, skip } = getPaginationOptions(req);
  const filter: Record<string, any> = {};

  if (req.query.status) filter.status = req.query.status;
  if (req.query.priority) filter.priority = req.query.priority;
  if (req.query.category) filter.category = req.query.category;

  // فیلتر بر اساس نقش کاربر
  if (req.query.role && ['student', 'instructor'].includes(req.query.role as string)) {
    const User = (await import('../models/User')).default;
    const roleUsers = await User.find({ role: req.query.role }).select('_id').lean();
    const userIds = roleUsers.map((u: any) => u._id);
    filter.user = { $in: userIds };
  }

  const tickets = await Ticket.find(filter)
    .populate('user', 'fullName email role avatar')
    .populate('assignedTo', 'fullName')
    .populate('messages.sender', 'fullName avatar role')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);

  const total = await Ticket.countDocuments(filter);

  return ApiResponse.paginated(res, tickets, page, limit, total);
});
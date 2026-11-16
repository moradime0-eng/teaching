import { Request, Response } from 'express';
import Report from '../models/Report';
import { ApiError } from '../utils/ApiError';
import { ApiResponse } from '../utils/ApiResponse';
import { asyncHandler } from '../middlewares/asyncHandler';
import { getPaginationOptions } from '../utils/paginationHelper';

export const createReport = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();

  const { targetType, targetId, reason, description } = req.body;

  // Check duplicate report
  const existing = await Report.findOne({
    reporter: req.user._id,
    targetType,
    targetId,
    status: { $in: ['pending', 'reviewing'] },
  });

  if (existing) {
    throw ApiError.conflict('شما قبلاً این مورد را گزارش کرده‌اید');
  }

  const report = await Report.create({
    reporter: req.user._id,
    targetType,
    targetId,
    reason,
    description,
  });

  return ApiResponse.created(res, report, 'گزارش شما با موفقیت ثبت شد');
});

export const getAllReports = asyncHandler(async (req: Request, res: Response) => {
  const { page, limit, skip } = getPaginationOptions(req);
  const filter: Record<string, any> = {};

  if (req.query.status) filter.status = req.query.status;
  if (req.query.targetType) filter.targetType = req.query.targetType;

  const reports = await Report.find(filter)
    .populate('reporter', 'fullName email')
    .populate('reviewedBy', 'fullName')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);

  const total = await Report.countDocuments(filter);

  return ApiResponse.paginated(res, reports, page, limit, total);
});

export const updateReportStatus = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const { id } = req.params;
  const { status, actionTaken } = req.body;

  const report = await Report.findByIdAndUpdate(
    id,
    {
      $set: {
        status,
        actionTaken,
        reviewedBy: req.user._id,
        reviewedAt: new Date(),
      },
    },
    { new: true },
  );

  if (!report) throw ApiError.notFound('گزارش یافت نشد');

  return ApiResponse.success(res, report, 'وضعیت گزارش بروزرسانی شد');
});

import { Request, Response, NextFunction } from 'express';
import { ApiError } from '../utils/ApiError';
import { UserRole } from '../types';

export const authorize = (...roles: UserRole[]) => {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(ApiError.unauthorized('احراز هویت الزامی است'));
    }

    if (!roles.includes(req.user.role)) {
      return next(ApiError.forbidden('شما دسترسی لازم برای انجام این عملیات را ندارید'));
    }

    next();
  };
};

// Shortcuts
export const adminOnly = authorize(UserRole.ADMIN);
export const instructorOnly = authorize(UserRole.INSTRUCTOR, UserRole.ADMIN);
export const studentOnly = authorize(UserRole.STUDENT, UserRole.ADMIN);

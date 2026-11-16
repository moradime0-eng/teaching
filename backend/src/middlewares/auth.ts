import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import User from '../models/User';
import { ApiError } from '../utils/ApiError';
import { asyncHandler } from './asyncHandler';

export const authenticate = asyncHandler(
  async (req: Request, _res: Response, next: NextFunction) => {
    let token: string | undefined;

    // 1. Check Authorization header
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1];
    }

    // 2. Check cookies
    if (!token && req.cookies?.accessToken) {
      token = req.cookies.accessToken;
    }

    if (!token) {
      throw ApiError.unauthorized('لطفاً ابتدا وارد حساب کاربری خود شوید');
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET!) as {
        id: string;
      };

      const user = await User.findById(decoded.id).select(
        '-password -refreshTokens',
      );

      if (!user) {
        throw ApiError.unauthorized('کاربر یافت نشد');
      }

      if (!user.isActive) {
        throw ApiError.unauthorized('حساب کاربری شما غیرفعال شده است');
      }

      if (user.isBanned) {
        throw ApiError.forbidden(
          `حساب کاربری شما مسدود شده است. دلیل: ${user.banReason || 'نامشخص'}`,
        );
      }

      req.user = user;
      next();
    } catch (error) {
      if (error instanceof jwt.JsonWebTokenError) {
        throw ApiError.unauthorized('توکن نامعتبر است');
      }
      if (error instanceof jwt.TokenExpiredError) {
        throw ApiError.unauthorized('توکن منقضی شده است');
      }
      throw error;
    }
  },
);

// Optional auth - doesn't throw if no token
export const optionalAuth = asyncHandler(
  async (req: Request, _res: Response, next: NextFunction) => {
    let token: string | undefined;

    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1];
    }
    if (!token && req.cookies?.accessToken) {
      token = req.cookies.accessToken;
    }

    if (token) {
      try {
        const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET!) as {
          id: string;
        };
        const user = await User.findById(decoded.id).select('-password -refreshTokens');
        if (user && user.isActive && !user.isBanned) {
          req.user = user;
        }
      } catch {
        // Silently ignore invalid token for optional auth
      }
    }

    next();
  },
);

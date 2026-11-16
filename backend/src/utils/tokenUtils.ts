import jwt, { SignOptions } from 'jsonwebtoken';
import crypto from 'crypto';
import { JwtPayload, UserRole } from '../types';

export interface TenantJwtPayload extends JwtPayload {
  tenantId?: string;
}

export const generateAccessToken = (payload: TenantJwtPayload): string => {
  return jwt.sign(payload, process.env.JWT_ACCESS_SECRET!, {
    expiresIn: process.env.JWT_ACCESS_EXPIRE || '15m',
  } as SignOptions);
};

export const generateRefreshToken = (payload: TenantJwtPayload): string => {
  return jwt.sign(payload, process.env.JWT_REFRESH_SECRET!, {
    expiresIn: process.env.JWT_REFRESH_EXPIRE || '7d',
  } as SignOptions);
};

export const verifyAccessToken = (token: string): TenantJwtPayload => {
  return jwt.verify(token, process.env.JWT_ACCESS_SECRET!) as TenantJwtPayload;
};

export const verifyRefreshToken = (token: string): TenantJwtPayload => {
  return jwt.verify(token, process.env.JWT_REFRESH_SECRET!) as TenantJwtPayload;
};

/**
 * Generate a 6-digit numeric OTP code.
 * Stored as plain string — the caller should hash it before saving to DB.
 */
export const generateOTP = (): string => {
  return crypto.randomInt(100000, 999999).toString();
};

export const generateTokenPair = (payload: TenantJwtPayload) => ({
  accessToken: generateAccessToken(payload),
  refreshToken: generateRefreshToken(payload),
});

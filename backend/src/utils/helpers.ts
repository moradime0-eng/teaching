import crypto from 'crypto';
import moment from 'jalali-moment';

export const generateRandomCode = (length = 6): string => {
  return Math.floor(Math.random() * Math.pow(10, length))
    .toString()
    .padStart(length, '0');
};

export const generateRandomString = (length = 32): string => {
  return crypto.randomBytes(length).toString('hex');
};

export const hashToken = (token: string): string => {
  return crypto.createHash('sha256').update(token).digest('hex');
};

export const toJalaliDate = (date: Date | string): string => {
  return moment(date).locale('fa').format('YYYY/MM/DD HH:mm');
};

export const sanitizeUser = (user: any) => {
  const obj = user.toObject ? user.toObject() : user;
  delete obj.password;
  delete obj.refreshTokens;
  delete obj.resetPasswordOTP;
  return obj;
};

export const calculateReadingTime = (text: string): number => {
  const wordsPerMinute = 200;
  const wordCount = text.split(/\s+/).length;
  return Math.ceil(wordCount / wordsPerMinute);
};

export const formatPrice = (price: number): string => {
  return new Intl.NumberFormat('fa-IR').format(price);
};
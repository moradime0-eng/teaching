import crypto from 'crypto';

export const generateCertificateNumber = (): string => {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = crypto.randomBytes(4).toString('hex').toUpperCase();
  return `CERT-${timestamp}-${random}`;
};

export const generateCertificateHash = (
  userId: string,
  courseId: string,
  issuedAt: Date,
): string => {
  const data = `${userId}-${courseId}-${issuedAt.getTime()}`;
  return crypto.createHash('sha256').update(data).digest('hex').substring(0, 16);
};

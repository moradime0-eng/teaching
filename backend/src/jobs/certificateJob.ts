import Bull from 'bull';
import Certificate from '../models/Certificate';
import Enrollment from '../models/Enrollment';
import { generateCertificateNumber, generateCertificateHash } from '../utils/certificateGenerator';
import { runWithTenantContext } from '../utils/tenantContext';

const certificateQueue = new Bull('certificate-queue', {
  redis: {
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    retryStrategy: () => null,
  },
});

certificateQueue.on('error', () => {
  // جلوگیری از اسپم شدن لاگ
});

const generateCertDirectly = async (enrollmentId: string, tenantId?: string) => {
  // Run with tenant context if provided
  if (tenantId) {
    return runWithTenantContext({ tenantId }, async () => {
      return generateCertDirectlyInternal(enrollmentId);
    });
  }
  return generateCertDirectlyInternal(enrollmentId);
};

const generateCertDirectlyInternal = async (enrollmentId: string) => {
  const enrollment = await Enrollment.findById(enrollmentId).populate('course').populate('student');

  if (!enrollment || !enrollment.isCompleted || enrollment.certificateIssued) return;

  const course = enrollment.course as any;
  const student = enrollment.student as any;

  const certificateNumber = generateCertificateNumber();
  const verificationHash = generateCertificateHash(
    student._id.toString(),
    course._id.toString(),
    new Date(),
  );

  const certificate = await Certificate.create({
    user: student._id,
    course: course._id,
    enrollment: enrollment._id,
    certificateNumber,
    verificationHash,
    studentName: student.fullName,
    courseName: course.title,
    instructorName: 'Instructor',
    completedAt: enrollment.completedAt || new Date(),
    totalHours: Math.round(course.totalDuration / 3600) || 1,
  });

  enrollment.certificateIssued = true;
  enrollment.certificate = certificate._id;
  await enrollment.save();
};

certificateQueue.process(async (job) => {
  const { enrollmentId, tenantId } = job.data;
  await generateCertDirectly(enrollmentId, tenantId);
  return { success: true };
});

export const queueCertificateGeneration = async (enrollmentId: string, tenantId?: string) => {
  try {
    await certificateQueue.add({ enrollmentId, tenantId });
  } catch {
    // در صورت در دسترس نبودن ریدیس، صدور مدرک به صورت مستقیم انجام می‌شود
    await generateCertDirectly(enrollmentId, tenantId);
  }
};

export default certificateQueue;

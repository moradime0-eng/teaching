import Bull from 'bull';
import EmailService from '../config/email';

const emailQueue = new Bull('email-queue', {
  redis: {
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    retryStrategy: () => null,
  },
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: true,
  },
});

emailQueue.on('error', () => {
});

emailQueue.process(async (job) => {
  const { to, subject, html, text, tenantId } = job.data;
  // Set tenant context for the job
  if (tenantId) {
    process.env.CURRENT_TENANT_ID = tenantId;
  }
  await EmailService.sendEmail({ to, subject, html, text });
  return { success: true };
});

export const queueEmail = async (data: {
  to: string;
  subject: string;
  html: string;
  text?: string;
  tenantId?: string; // Add tenantId for multi-tenancy
}) => {
  try {
    await emailQueue.add(data);
  } catch {
    await EmailService.sendEmail(data);
  }
};

export const queueBulkEmail = async (
  recipients: string[],
  subject: string,
  html: string,
  tenantId?: string,
) => {
  for (const to of recipients) {
    await queueEmail({ to, subject, html, tenantId });
  }
};

export default emailQueue;

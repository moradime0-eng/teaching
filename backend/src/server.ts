/// <reference path="./types/express.d.ts" />

// FIRST import: load .env + Docker `_FILE` secrets BEFORE any config module
// reads `process.env` at module-init time (passport, cloudinary, email, etc.).
// See `./config/loadEnv.ts` for the full precedence rules.
import './config/loadEnv';

import http from 'http';
import app from './app';
import database from './config/database';
import { initializeSocket } from './config/socket';
import { startCleanupJobs } from './jobs/cleanupJob';
import { startReconciliationJob } from './jobs/reconciliationJob';

// Required environment variables for production
const REQUIRED_ENV_VARS = ['MONGODB_URI', 'JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET', 'CLIENT_URL'];

// Optional but recommended environment variables
const RECOMMENDED_ENV_VARS = [
  'SMTP_HOST',
  'SMTP_PORT',
  'SMTP_USER',
  'SMTP_PASS',
  'NIKPAL_API_KEY',
  'NIKPAL_BASE_URL',
  'NIKPAL_SANDBOX',
  'FRONTEND_PAYMENT_SUCCESS_URL',
  'FRONTEND_PAYMENT_FAILURE_URL',
  'CLOUDINARY_CLOUD_NAME',
  'CLOUDINARY_API_KEY',
  'CLOUDINARY_API_SECRET',
  'REDIS_HOST',
  'REDIS_PORT',
];

function validateEnvironment(): void {
  const missing: string[] = [];
  const missingRecommended: string[] = [];

  for (const envVar of REQUIRED_ENV_VARS) {
    if (!process.env[envVar]) {
      missing.push(envVar);
    }
  }

  for (const envVar of RECOMMENDED_ENV_VARS) {
    if (!process.env[envVar]) {
      missingRecommended.push(envVar);
    }
  }

  if (missing.length > 0) {
    console.error('\n❌ Missing required environment variables:');
    missing.forEach((v) => console.error(`   - ${v}`));
    console.error('\nPlease check your .env file and ensure all required variables are set.');
    console.error('See .env.example for reference.\n');
    process.exit(1);
  }

  if (missingRecommended.length > 0 && process.env.NODE_ENV === 'production') {
    console.warn('\n⚠️  Missing recommended environment variables for production:');
    missingRecommended.forEach((v) => console.warn(`   - ${v}`));
    console.warn('Some features may not work correctly.\n');
  }

  // Validate JWT secrets are not default values in production
  if (process.env.NODE_ENV === 'production') {
    const PLACEHOLDER_MARKERS = [
      'your_super_secret',
      'CHANGE_ME',
      'change_this',
      'change_me',
      'example',
    ];
    const weakSecrets = ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET'].filter((name) => {
      const value = process.env[name] || '';
      const isPlaceholder = PLACEHOLDER_MARKERS.some((m) =>
        value.toLowerCase().includes(m.toLowerCase()),
      );
      return isPlaceholder || value.length < 32;
    });
    if (weakSecrets.length > 0) {
      console.error(
        `\n❌ JWT secrets must be strong (≥32 chars, no placeholder values) in production! Offenders: ${weakSecrets.join(', ')}`,
      );
      process.exit(1);
    }
  }

  console.log('✅ Environment validation passed');

  // ⚠️ بررسی پیکربندی OAuth
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    console.warn(
      '⚠️  Google OAuth is not fully configured (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET missing).',
    );
  }
  if (!process.env.GITHUB_CLIENT_ID || !process.env.GITHUB_CLIENT_SECRET) {
    console.warn(
      '⚠️  GitHub OAuth is not fully configured (GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET missing).',
    );
  }
}

const PORT = parseInt(process.env.PORT || '5000', 10);

const startServer = async () => {
  try {
    // Validate environment before starting
    validateEnvironment();

    // 1. Connect to Database
    await database.connect();

    // 2. Create HTTP Server
    const httpServer = http.createServer(app);

    // 3. Initialize Socket.IO
    initializeSocket(httpServer);

    // 4. Start Cleanup Cron Jobs
    startCleanupJobs();

    startReconciliationJob();

    // 5. Start Server
    httpServer.listen(PORT, () => {
      console.log('\n╔══════════════════════════════════════════════╗');
      console.log('║     🚀 Iranian Udemy Backend Server          ║');
      console.log('╠══════════════════════════════════════════════╣');
      console.log(`║  📡 Server:   http://localhost:${PORT}            ║`);
      console.log(`║  📚 API Docs: http://localhost:${PORT}/api-docs   ║`);
      console.log(`║  💚 Health:   http://localhost:${PORT}/health     ║`);
      console.log(`║  🌍 Env:      ${process.env.NODE_ENV || 'development'}                    ║`);
      console.log('╚══════════════════════════════════════════════╝\n');
    });

    // 6. Graceful Shutdown
    let isShuttingDown = false;

    const gracefulShutdown = async (signal: string) => {
      if (isShuttingDown) return;
      isShuttingDown = true;

      console.log(`\n⚠️ ${signal} received. Shutting down gracefully...`);

      // Stop accepting new connections
      httpServer.close(() => {
        console.log('✅ HTTP server closed');
      });

      // Force-close idle keep-alive connections so httpServer.close() resolves
      if (typeof (httpServer as any).closeAllConnections === 'function') {
        (httpServer as any).closeAllConnections();
      }

      try {
        await database.disconnect();
        console.log('✅ Database disconnected');
      } catch (err) {
        console.error('❌ Error disconnecting database:', err);
      }

      console.log('✅ Shutdown complete');
      process.exit(0);

      // Force shutdown after 10 seconds as a safety net
      setTimeout(() => {
        console.error('❌ Forced shutdown after timeout');
        process.exit(1);
      }, 10000);
    };

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

    // Handle unhandled errors
    process.on('unhandledRejection', (reason) => {
      console.error('❌ Unhandled Rejection:', reason);
    });

    process.on('uncaughtException', (error) => {
      console.error('❌ Uncaught Exception:', error);
      gracefulShutdown('UncaughtException');
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
};

startServer();

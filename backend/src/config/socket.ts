import { Server as HttpServer } from 'http';
import { Server as SocketServer } from 'socket.io';
import jwt from 'jsonwebtoken';
import { registerChatHandlers } from '../sockets/chatSocket';
import { registerNotificationHandlers } from '../sockets/notificationSocket';
import Tenant from '../models/Tenant';

let io: SocketServer;

function parseCookies(cookieHeader?: string): Record<string, string> {
  const result: Record<string, string> = {};
  if (!cookieHeader) return result;

  cookieHeader.split(';').forEach((pair) => {
    const [key, ...val] = pair.trim().split('=');
    if (key) {
      result[key] = decodeURIComponent(val.join('='));
    }
  });

  return result;
}

function sanitizeToken(rawToken: string): string {
  let token = rawToken.trim();
  if (token.startsWith('Bearer ')) {
    token = token.slice(7).trim();
  }
  if (token.startsWith('s:')) {
    token = token.slice(2);
  }
  if (token.includes('.')) {
    const parts = token.split('.');
    if (parts.length > 3) {
      token = parts.slice(0, 3).join('.');
    }
  }
  return token;
}

export const initializeSocket = (httpServer: HttpServer): SocketServer => {
  io = new SocketServer(httpServer, {
    cors: {
      origin: process.env.CLIENT_URL || 'http://localhost:4200', // در production حتماً CLIENT_URL=https://homayoon.academy تنظیم شود
      credentials: true,
      methods: ['GET', 'POST'],
    },
    pingTimeout: 60000,
    transports: ['websocket', 'polling'],
  });

  io.use(async (socket, next) => {
    try {
      let token: string | undefined =
        socket.handshake.auth?.token ||
        socket.handshake.headers.authorization?.split(' ')[1];

      if (!token) {
        const parsedCookies = parseCookies(socket.handshake.headers.cookie);
        token =
          parsedCookies['accessToken'] ||
          parsedCookies['access_token'] ||
          parsedCookies['token'] ||
          parsedCookies['jwt'];
      }

      if (!token) {
        return next(new Error('Authentication required'));
      }

      const cleanToken = sanitizeToken(token);
      const decoded = jwt.verify(cleanToken, process.env.JWT_ACCESS_SECRET!) as any;
      socket.data.userId = decoded.id || decoded._id || decoded.userId;
      socket.data.role = decoded.role;
      socket.data.tenantId = decoded.tenantId || null;

      if (!socket.data.userId) {
        return next(new Error('Invalid token payload'));
      }

      // 🔒 بررسی وضعیت حساب: کاربر مسدود/غیرفعال نباید به چت متصل شود
      // (توکن تا ۱۵ دقیقه معتبر می‌ماند؛ این چک جلوی سوءاستفاده مسدودشدگان را می‌گیرد)
      const User = require('../models/User').default;
      const accountUser = await User.findById(socket.data.userId).select('isActive isBanned');
      if (!accountUser || !accountUser.isActive || accountUser.isBanned) {
        return next(new Error('Account disabled'));
      }

      next();
    } catch (err: any) {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', async (socket) => {
    socket.join(`user:${socket.data.userId}`);

    if (!socket.data.tenantId) {
      try {
        const User = require('../models/User').default;
        const user = await User.findById(socket.data.userId).select('activeTenant tenant');
        if (user?.activeTenant) {
          socket.data.tenantId = user.activeTenant.toString();
        } else if (user?.tenant) {
          socket.data.tenantId = user.tenant.toString();
        } else {
          const tenant = await Tenant.findOne({ isActive: true }).select('_id');
          if (tenant) socket.data.tenantId = tenant._id.toString();
        }
      } catch (error) {
        console.error('Failed to resolve tenant for socket:', error);
      }
    }

    if (socket.data.tenantId) {
      socket.join(`tenant:${socket.data.tenantId}`);
      socket.join(`tenant:${socket.data.tenantId}:user:${socket.data.userId}`);
    }

    registerChatHandlers(io, socket);
    registerNotificationHandlers(io, socket);

    socket.on('disconnect', () => {});
  });

  return io;
};

export const getIO = (): SocketServer => {
  if (!io) throw new Error('Socket.IO not initialized');
  return io;
};
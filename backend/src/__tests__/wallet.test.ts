/// <reference types="jest" />
/**
 * 💰 تست‌های سرویس کیف پول (دفتر کل)
 *
 * پوشش: credit/debit اتمیک، جلوگیری از موجودی منفی، رگرسیون double-spend،
 * ثبت رکورد دفتر کل با balanceAfter صحیح، صورت حساب صفحه‌بندی‌شده و
 * rollback تراکنشی (اسپشال به معماری پرداخت کیف پولی).
 */
import './setup';
import mongoose from 'mongoose';
import User from '../models/User';
import WalletTransaction from '../models/WalletTransaction';
import { walletService, InsufficientBalanceError } from '../services/wallet.service';
import { createStudent, createInstructor } from './factories';

describe('Wallet Service', () => {
  describe('credit — افزایش موجودی + دفتر کل', () => {
    it('should create ledger entry on credit with correct balanceAfter', async () => {
      const user = await createStudent();

      const wallet = await walletService.credit(user._id, 50000, {
        reason: 'topup',
        description: 'شارژ آزمایشی',
      });

      expect(wallet.balance).toBe(50000);
      expect(wallet.totalDeposited).toBe(50000);

      const entries = await WalletTransaction.find({ user: user._id });
      expect(entries).toHaveLength(1);
      expect(entries[0].type).toBe('credit');
      expect(entries[0].amount).toBe(50000);
      expect(entries[0].balanceAfter).toBe(50000);
      expect(entries[0].reason).toBe('topup');
    });

    it('should reject non-positive credit amounts', async () => {
      const user = await createStudent();

      await expect(
        walletService.credit(user._id, 0, { reason: 'topup' }),
      ).rejects.toThrow('Credit amount must be positive');
    });

    it('should decrement totalSpent on refund credit (secondaryCounter)', async () => {
      const user = await createStudent({
        wallet: { balance: 10000, totalDeposited: 10000, totalWithdrawn: 0, totalSpent: 10000 },
      });

      const wallet = await walletService.credit(user._id, 4000, {
        reason: 'refund',
        secondaryCounter: 'totalSpent',
      });

      // بازگشت وجه: خرج ثبت‌شده کم می‌شود، واریز تغییر نمی‌کند
      expect(wallet.balance).toBe(14000);
      expect(wallet.totalSpent).toBe(6000);
      expect(wallet.totalDeposited).toBe(10000);
    });
  });

  describe('debit — کاهش موجودی + جلوگیری از منفی شدن', () => {
    it('should create ledger entry on debit and update totalSpent', async () => {
      const user = await createStudent({
        wallet: { balance: 80000, totalDeposited: 80000, totalWithdrawn: 0, totalSpent: 0 },
      });

      const wallet = await walletService.debit(user._id, 30000, {
        reason: 'purchase',
        description: 'خرید دوره',
      });

      expect(wallet.balance).toBe(50000);
      expect(wallet.totalSpent).toBe(30000);

      const entry = await WalletTransaction.findOne({ user: user._id, type: 'debit' });
      expect(entry).not.toBeNull();
      expect(entry!.balanceAfter).toBe(50000);
      expect(entry!.reason).toBe('purchase');
    });

    it('should prevent negative balance and throw InsufficientBalanceError', async () => {
      const user = await createStudent({
        wallet: { balance: 10000, totalDeposited: 10000, totalWithdrawn: 0, totalSpent: 0 },
      });

      await expect(
        walletService.debit(user._id, 25000, { reason: 'purchase' }),
      ).rejects.toThrow(InsufficientBalanceError);

      // موجودی دست‌نخورده و هیچ رکورد دفتر کلی ثبت نشده
      const refreshed = await User.findById(user._id);
      expect(refreshed!.wallet.balance).toBe(10000);
      expect(await WalletTransaction.countDocuments({ user: user._id })).toBe(0);
    });

    it('should allow negative balance only with allowNegative (refund instructor deduction)', async () => {
      const instructor = await createInstructor(); // موجودی صفر

      const wallet = await walletService.debit(instructor._id, 7000, {
        reason: 'refund',
        secondaryCounter: 'totalDeposited',
        deltaInstructorEarnings: true,
        allowNegative: true,
      });

      // بدهی مدرس: موجودی منفی ثبت می‌شود (دفتر کل min:0 ندارد — عمداً)
      expect(wallet.balance).toBe(-7000);
      const entry = await WalletTransaction.findOne({ user: instructor._id });
      expect(entry!.balanceAfter).toBe(-7000);
    });

    it('should handle concurrent debits without double-spend', async () => {
      const user = await createStudent({
        wallet: { balance: 1000, totalDeposited: 1000, totalWithdrawn: 0, totalSpent: 0 },
      });

      // ۵ درخواست همزمان ۴۰۰ تومانی با موجودی ۱۰۰۰ → فقط ۲ تا موفق
      const results = await Promise.allSettled(
        Array.from({ length: 5 }, () =>
          walletService.debit(user._id, 400, { reason: 'purchase' }),
        ),
      );

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');

      expect(fulfilled).toHaveLength(2);
      expect(rejected).toHaveLength(3);
      rejected.forEach((r) => {
        expect((r as PromiseRejectedResult).reason).toBeInstanceOf(InsufficientBalanceError);
      });

      const refreshed = await User.findById(user._id);
      expect(refreshed!.wallet.balance).toBe(200);

      // دفتر کل دقیقاً ۲ رکورد دارد؛ موجودی با جمع تراکنش‌ها می‌خواند
      const entries = await WalletTransaction.find({ user: user._id });
      expect(entries).toHaveLength(2);
      const balanceAfters = entries.map((e) => e.balanceAfter).sort((a, b) => a - b);
      // کسرهای ۴۰۰تایی از ۱۰۰۰: مسیرهای موفق به ترتیب ۶۰۰ و ۲۰۰ را ثبت کرده‌اند
      expect(balanceAfters).toEqual([200, 600]);
    });
  });

  describe('صورت حساب و خلاصه', () => {
    it('should return correct transaction history with pagination and filters', async () => {
      const user = await createStudent();

      for (let i = 0; i < 25; i++) {
        await walletService.credit(user._id, 1000, { reason: 'topup' });
      }
      await walletService.debit(user._id, 3000, { reason: 'purchase' });

      const page2 = await walletService.getTransactions(user._id, 2, 20);
      expect(page2.pagination.total).toBe(26);
      expect(page2.pagination.pages).toBe(2);
      expect(page2.transactions).toHaveLength(6); // ۲۶ تراکنش → صفحه‌ی دوم ۶ تا

      const debits = await walletService.getTransactions(user._id, 1, 20, { type: 'debit' });
      expect(debits.pagination.total).toBe(1);
      expect(debits.transactions[0].reason).toBe('purchase');

      const topups = await walletService.getTransactions(user._id, 1, 50, { reason: 'topup' });
      expect(topups.pagination.total).toBe(25);
    });

    it('should return summary with wallet and 5 most recent transactions', async () => {
      const user = await createStudent();

      await walletService.credit(user._id, 10000, { reason: 'topup' });
      for (let i = 0; i < 7; i++) {
        await walletService.credit(user._id, 100, { reason: 'admin_adjust' });
      }

      const summary = await walletService.getSummary(user._id);
      expect(summary.wallet!.balance).toBe(10700);
      expect(summary.recentTransactions.length).toBeLessThanOrEqual(5);
    });

    it('should return zeroed wallet for unknown user', async () => {
      const wallet = await walletService.getBalance(new mongoose.Types.ObjectId());
      expect(wallet.balance).toBe(0);
      expect(wallet.totalDeposited).toBe(0);
    });
  });

  describe('تراکنش اتمیک (session) — پایه‌ی پرداخت کیف پولی', () => {
    it('should roll back balance and ledger when transaction aborts', async () => {
      const user = await createStudent({
        wallet: { balance: 20000, totalDeposited: 20000, totalWithdrawn: 0, totalSpent: 0 },
      });

      const session = await mongoose.startSession();
      try {
        await expect(
          session.withTransaction(async () => {
            await walletService.debit(user._id, 5000, {
              reason: 'purchase',
              description: 'پرداخت سفارش آزمایشی',
              session,
            });
            // شبیه‌سازی خطای وسط تراکنش (مثلاً شکست ساخت سند پرداخت)
            throw new Error('simulated transaction failure');
          }),
        ).rejects.toThrow('simulated transaction failure');
      } finally {
        await session.endSession();
      }

      // ⚠️ رگرسیون: کسر موجودی باید کاملاً rollback شود
      const refreshed = await User.findById(user._id);
      expect(refreshed!.wallet.balance).toBe(20000);
      expect(refreshed!.wallet.totalSpent).toBe(0);
      expect(await WalletTransaction.countDocuments({ user: user._id })).toBe(0);
    });

    it('should commit balance and ledger when transaction succeeds', async () => {
      const user = await createStudent({
        wallet: { balance: 20000, totalDeposited: 20000, totalWithdrawn: 0, totalSpent: 0 },
      });

      const session = await mongoose.startSession();
      try {
        await session.withTransaction(async () => {
          await walletService.debit(user._id, 5000, { reason: 'purchase', session });
        });
      } finally {
        await session.endSession();
      }

      const refreshed = await User.findById(user._id);
      expect(refreshed!.wallet.balance).toBe(15000);
      expect(await WalletTransaction.countDocuments({ user: user._id })).toBe(1);
    });
  });
});

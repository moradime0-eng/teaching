import { Router } from 'express';
import {
  createTicket,
  getMyTickets,
  getTicketById,
  replyToTicket,
  updateTicketStatus,
  assignTicket,
  getAllTickets,
} from '../controllers/ticketController';
import { authenticate } from '../middlewares/auth';
import { adminOnly } from '../middlewares/authorize';
import { validate } from '../middlewares/validate';
import { createTicketValidator, replyTicketValidator } from '../validators/ticketValidator';
import { sanitizeRichText, sanitizeCompactText } from '../middlewares/sanitize.middleware';

const router = Router();

router.use(authenticate);

// ⚠️ مسیرهای ثابت باید قبل از مسیرهای پارامتری ثبت شوند
// Admin routes (باید قبل از /:id باشد)
router.get('/', adminOnly, getAllTickets);

// User routes
router.post('/', validate(createTicketValidator), sanitizeRichText, createTicket);
router.get('/my', getMyTickets);
router.post('/:id/reply', validate(replyTicketValidator), sanitizeRichText, replyToTicket);
router.get('/:id', getTicketById);

// Admin routes (با پارامتر)
router.put('/:id/status', adminOnly, updateTicketStatus);
router.put('/:id/assign', adminOnly, assignTicket);

export default router;

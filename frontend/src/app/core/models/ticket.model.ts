export enum TicketStatus {
  OPEN = 'open',
  IN_PROGRESS = 'in_progress',
  RESOLVED = 'resolved',
  CLOSED = 'closed',
}

export interface TicketUser {
  _id: string;
  fullName?: string;
  name?: string;
  email?: string;
  avatar?: string;
  role?: string;
}

export interface TicketMessage {
  sender: string | TicketUser;
  content: string;
  attachments?: { url: string; name: string }[];
  createdAt: string;
}

export interface Ticket {
  _id: string;
  user: string | TicketUser;
  ticketNumber: string;
  subject: string;
  category: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  status: TicketStatus | string;
  messages: TicketMessage[];
  assignedTo?: string | TicketUser;
  relatedCourse?: any;
  resolvedAt?: string;
  closedAt?: string;
  createdAt: string;
  updatedAt: string;
}

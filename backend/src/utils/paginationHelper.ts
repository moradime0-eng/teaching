import { Request } from 'express';

export interface PaginationOptions {
  page: number;
  limit: number;
  skip: number;
  sort: Record<string, 1 | -1>;
}

export const getPaginationOptions = (req: Request, defaultLimit = 10): PaginationOptions => {
  const page = Math.max(parseInt(req.query.page as string) || 1, 1);
  const limit = Math.min(Math.max(parseInt(req.query.limit as string) || defaultLimit, 1), 100);
  const skip = (page - 1) * limit;

  const sortField = (req.query.sort as string) || 'createdAt';
  const order = req.query.order === 'asc' ? 1 : -1;
  const sort = { [sortField]: order } as Record<string, 1 | -1>;

  return { page, limit, skip, sort };
};

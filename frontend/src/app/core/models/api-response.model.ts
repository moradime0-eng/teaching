export interface ApiResponse<T = any> {
  success: boolean;
  message: string;
  data?: T;
  meta?: PaginationMeta;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface PaginatedResponse<T> {
  total: any;
  pagination: any;
  success: boolean;
  message: string;
  data: T[];
  meta: PaginationMeta;
}

export interface ApiError {
  success: false;
  message: string;
  errors?: { field: string; message: string }[];
  stack?: string;
}

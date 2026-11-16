import { Response } from 'express';

export class ApiResponse {
  static success<T>(res: Response, data: T, message = 'Success', statusCode = 200, meta?: object) {
    return res.status(statusCode).json({
      success: true,
      message,
      data,
      ...(meta && { meta }),
    });
  }

  static created<T>(res: Response, data: T, message = 'Created successfully') {
    return this.success(res, data, message, 201);
  }

  static error(res: Response, message = 'Error', statusCode = 500, errors?: unknown) {
    return res.status(statusCode).json({
      success: false,
      message,
      ...(errors !== undefined && { errors }),
    });
  }

  static noContent(res: Response) {
    return res.status(204).send();
  }

  static paginated<T>(
    res: Response,
    data: T[],
    page: number,
    limit: number,
    total: number,
    message = 'Success',
  ) {
    return res.status(200).json({
      success: true,
      message,
      data,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  }
}

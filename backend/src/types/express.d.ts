import { IUser } from '../models/User';
import { ITenant } from '../models/Tenant';

declare global {
  namespace Express {
    interface User extends IUser {}
    interface Request {
      user?: IUser;
      tenantId?: string; // شناسه تننت جاری
      tenant?: ITenant;  // اطلاعات کامل تننت جاری
      membership?: any;
      resource?: any;
      tenantContext?: {
        tenantId?: string;
        userId?: string;
        userRole?: string;
        membershipRole?: string;
        isSuperAdmin?: boolean;
        bypassTenant?: boolean;
      };
    }
  }
}

export {};
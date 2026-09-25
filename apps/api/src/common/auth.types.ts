export interface AuthenticatedUser {
  id: string;
  organizationId: string;
  branchId?: string;
  hubId?: string;
  riderId?: string;
  roles: string[];
  permissions: string[];
}

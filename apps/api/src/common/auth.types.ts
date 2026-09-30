export interface AuthenticatedUser {
  id: string;
  displayName: string;
  organizationId: string;
  customerId?: string;
  branchId?: string;
  hubId?: string;
  riderId?: string;
  roles: string[];
  permissions: string[];
}

import { Module, Type } from '@nestjs/common';

const domainNames = [
  'auth', 'users', 'roles', 'permissions', 'organizations', 'branches', 'hubs', 'locations',
  'customers', 'consignments', 'booking', 'packages', 'pricing', 'pickups', 'manifests',
  'transit', 'riders', 'delivery', 'tracking', 'payments', 'cod', 'returns', 'notifications',
  'documents', 'reports', 'audit', 'settings',
] as const;

export const DomainModules: Type[] = domainNames.map((domainName) => {
  class DomainModule {
    static readonly domain = domainName;
  }
  return Module({})(DomainModule) as Type;
});

export const permissionCodes = [
  'shipment:create', 'shipment:view', 'shipment:verify', 'shipment:cancel',
  'manifest:create', 'manifest:update', 'manifest:seal', 'manifest:dispatch', 'manifest:receive', 'manifest:reconcile',
  'delivery:view', 'delivery:scan', 'delivery:assign', 'delivery:update', 'delivery:complete',
  'pickup:view', 'pickup:create', 'pickup:assign', 'pickup:update',
  'transit:view', 'transit:update', 'return:view', 'return:create',
  'payment:view', 'payment:proof', 'payment:upload_proof', 'payment:verify', 'payment:reject', 'payment:settle',
  'report:view', 'report:export', 'report:pdf', 'documents:view', 'documents:create', 'documents:download',
  'customer:view', 'customer:create', 'customer:update',
  'project:view', 'project:create', 'project:update',
  'route:view', 'user:view', 'audit:view',
] as const;

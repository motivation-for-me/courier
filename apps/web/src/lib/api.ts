export class ApiError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

export type AuthSession = {
  accessToken: string;
  refreshToken: string;
  user: { id: string; displayName: string; organizationId: string; riderId?: string; roles: string[]; permissions: string[] };
};

// Same-origin by default. In Vercel, the Next route handler forwards this path
// to the internal Nest service through the runtime-only API_INTERNAL_URL binding.
const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL ?? '/api/v1';
const sessionKey = 'courier.auth-session';
export const sessionExpiredEvent = 'courier:session-expired';
export const dataChangedEvent = 'courier:data-changed';

export type AppNotification = { id: string; status: string; template: string; payload?: { title?: string; message?: string; consignmentId?: string } | null; createdAt: string };
export function getNotifications() { return apiRequest<AppNotification[]>('/notifications'); }
export function readNotification(id: string) { return apiRequest<AppNotification>(`/notifications/${id}/read`, { method: 'PATCH', body: '{}' }); }
export function readAllNotifications() { return apiRequest<{ success: true; count: number }>('/notifications/read-all', { method: 'PATCH', body: '{}' }); }

function errorMessage(value: unknown, fallback: string): string {
  if (typeof value === 'string' && value.trim()) return value;
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === 'string').join('. ') || fallback;
  if (value && typeof value === 'object' && 'message' in value) return errorMessage((value as { message?: unknown }).message, fallback);
  return fallback;
}

export function getSession(): AuthSession | null {
  if (typeof window === 'undefined') return null;
  try {
    const serialized = sessionStorage.getItem(sessionKey);
    return serialized ? JSON.parse(serialized) as AuthSession : null;
  } catch {
    sessionStorage.removeItem(sessionKey);
    return null;
  }
}

export function clearSession() {
  if (typeof window !== 'undefined') sessionStorage.removeItem(sessionKey);
}

export function getAccessTokenExpiry(accessToken: string): number | null {
  try {
    const payload = accessToken.split('.')[1];
    if (!payload) return null;
    const normalized = payload.replaceAll('-', '+').replaceAll('_', '/');
    const decoded = JSON.parse(atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '='))) as { exp?: unknown };
    return typeof decoded.exp === 'number' ? decoded.exp * 1000 : null;
  } catch {
    return null;
  }
}

export async function login(email: string, password: string): Promise<AuthSession> {
  const session = await apiRequest<AuthSession>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
  sessionStorage.setItem(sessionKey, JSON.stringify(session));
  return session;
}

export async function logout(): Promise<void> {
  const refreshToken = getSession()?.refreshToken;
  try {
    if (refreshToken) {
      await fetch(`${apiBaseUrl}/auth/logout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });
    }
  } finally {
    clearSession();
  }
}

export async function apiRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const method = (options.method ?? 'GET').toUpperCase();
  if (typeof navigator !== 'undefined' && !navigator.onLine && method !== 'GET' && method !== 'HEAD') throw new ApiError(0, 'You are offline. Reconnect before saving changes.');
  const accessToken = getSession()?.accessToken;
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 20_000);
  if (options.signal) options.signal.addEventListener('abort', () => controller.abort(), { once: true });
  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl}${path}`, {
      ...options,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        ...options.headers,
      },
      credentials: 'include',
    });
  } catch (error) {
    if (controller.signal.aborted) throw new ApiError(0, 'The API did not respond within 20 seconds. Check the API and database connection, then try again.');
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }

  if (!response.ok) {
    const fallback = `Request failed with status ${response.status}`;
    let message = fallback;
    try {
      const body = (await response.json()) as { message?: unknown; error?: unknown };
      message = errorMessage(body.message, errorMessage(body.error, fallback));
    } catch {
      // Preserve the HTTP error when the API does not return JSON.
    }
    if (response.status === 401 && accessToken) {
      clearSession();
      window.dispatchEvent(new CustomEvent(sessionExpiredEvent));
    }
    throw new ApiError(response.status, message);
  }

  const result = await response.json() as T;
  if (method !== 'GET' && method !== 'HEAD' && !path.startsWith('/auth/')) {
    window.dispatchEvent(new CustomEvent(dataChangedEvent, { detail: { method, path } }));
  }
  return result;
}

export function getConsignments(query = '') {
  return apiRequest<DispatchSummary[]>(`/dispatches${query}`);
}

export type DispatchSummary = { id: string; cnNumber: string; status: string; serviceType: string; currentStatusAt: string; createdAt: string; publicTrackingKey?: string; customer?: { id: string; name: string } | null; project?: { id: string; name: string; siteName?: string | null; addressLine: string } | null; parties: Array<{ kind: string; name: string; phone?: string | null }>; items: Array<{ id: string; description: string; quantity: number; unit: string }>; payments: Array<{ amount: string | number; status: string; method: string }>; assignments: Array<{ riderId: string; rider: { employeeCode: string; user: { displayName: string; phone?: string | null } } }> };
export type TrackingResult = { found: false } | { found: true; shipment: { cnNumber: string; status: string; serviceType: string; currentStatusAt: string; organization?: { name?: string | null } | null; receiver?: { name: string; phone?: string | null } | null; destination?: { addressLine: string; city?: string | null; landmark?: string | null; deliveryNote?: string | null } | null; rider?: { employeeCode: string; vehicleDetails?: { vehicleNumber?: string } | null; user: { displayName: string; phone?: string | null } } | null; events: Array<{ eventType: string; eventTime: string; remarks?: string | null }> } };

export function trackDispatch(cnNumber: string, key?: string) {
  const query = key ? `?key=${encodeURIComponent(key)}` : '';
  return apiRequest<TrackingResult>(`/tracking/public/${encodeURIComponent(cnNumber.trim())}${query}`);
}

export async function openDispatchDocument(id: string, kind: 'dispatch' | 'label', mode: 'view' | 'download') {
  const accessToken = getSession()?.accessToken;
  const suffix = kind === 'label' ? '/label.pdf' : '.pdf';
  const preview = mode === 'view' ? window.open('about:blank', '_blank') : null;
  if (preview) { preview.opener = null; preview.document.title = 'Preparing PDF'; preview.document.body.textContent = 'Preparing secure PDF preview...'; }
  const response = await fetch(`${apiBaseUrl}/documents/consignments/${id}${suffix}?download=${mode === 'download' ? '1' : '0'}`, { headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {} });
  if (!response.ok) {
    preview?.close();
    if (response.status === 401 && accessToken) {
      clearSession();
      window.dispatchEvent(new CustomEvent(sessionExpiredEvent));
    }
    const body = await response.json().catch(() => null) as { message?: string } | null;
    throw new ApiError(response.status, body?.message ?? `Unable to open ${kind} PDF`);
  }
  const disposition = response.headers.get('content-disposition') ?? '';
  const filename = disposition.match(/filename="([^"]+)"/)?.[1] ?? `swiftlog-${kind}.pdf`;
  const url = URL.createObjectURL(await response.blob());
  if (mode === 'view') {
    if (preview) preview.location.href = url;
    else throw new ApiError(0, 'PDF preview was blocked. Allow pop-ups for this site and try again.');
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } else {
    const link = document.createElement('a'); link.href = url; link.download = filename; document.body.appendChild(link); link.click(); link.remove();
    URL.revokeObjectURL(url);
  }
}

export function createConsignment(payload: unknown) {
  return apiRequest<{ id: string; cnNumber: string; status: string }>('/consignments', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export type ShopBranchOption = { id: string; label?: string | null; addressLine: string; city?: string | null; region?: string | null; countryCode?: string | null };
export type CustomerOption = { id: string; name: string; email?: string | null; phone?: string | null; addresses: ShopBranchOption[] };
export type ProjectOption = { id: string; name: string; siteName?: string | null; addressLine: string; customer?: { id: string; name: string } | null };

export function getCustomers() {
  return apiRequest<CustomerOption[]>('/customers');
}

export function createCustomer(payload: { name: string; email?: string; phone?: string }) {
  return apiRequest<CustomerOption>('/customers', { method: 'POST', body: JSON.stringify(payload) });
}
export function updateCustomer(id: string, payload: { name?: string; email?: string; phone?: string }) { return apiRequest<CustomerOption>(`/customers/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }); }
export function deleteCustomer(id: string) { return apiRequest<{ success: true }>(`/customers/${id}`, { method: 'DELETE' }); }
export type ShopUserOption = { id: string; displayName: string; email: string; phone?: string | null; isActive: boolean; createdAt: string };
export function getShopUsers(customerId: string) { return apiRequest<ShopUserOption[]>(`/customers/${customerId}/users`); }
export function createShopUser(customerId: string, payload: { displayName: string; email: string; password: string; phone?: string }) { return apiRequest<ShopUserOption>(`/customers/${customerId}/users`, { method: 'POST', body: JSON.stringify(payload) }); }
export type ShopFinancialRow = { id: string; cnNumber: string; status: string; bookedAt: string; currencyCode: string; revenue: string; cost: string; profit: string; codCollected: string; shopPayable: string; paidToShop: string; outstanding: string; entries: Array<{ id: string; category: string; type: string; amount: string; reason?: string | null; createdAt: string }> };
export type ShopFinancialSummary = { shop: { id: string; name: string }; range: { from: string; to: string; basis: string }; counts: { total: number; delivered: number; pending: number; failedOrReturned: number }; totals: { revenue: string; cost: string; profit: string; codCollected: string; shopPayable: string; paidToShop: string; outstanding: string }; shipments: ShopFinancialRow[] };
export type ShopPricingAgreement = { id: string; currencyCode: string; shipmentCharge: string; codFeeFixed: string; codFeePercent: string; returnCharge: string; deductChargesFromCod: boolean; effectiveFrom: string; effectiveTo?: string | null };
export function getShopFinancialSummary(customerId: string, from?: string, to?: string) { const query = new URLSearchParams(); if (from) query.set('from', from); if (to) query.set('to', to); return apiRequest<ShopFinancialSummary>(`/shops/${customerId}/financials/summary?${query}`); }
export function getShopPricing(customerId: string) { return apiRequest<ShopPricingAgreement[]>(`/shops/${customerId}/financials/pricing`); }
export function saveShopPricing(customerId: string, payload: { currencyCode: string; shipmentCharge: number; codFeeFixed: number; codFeePercent: number; returnCharge: number; deductChargesFromCod: boolean }) { return apiRequest<ShopPricingAgreement>(`/shops/${customerId}/financials/pricing`, { method: 'PUT', body: JSON.stringify(payload) }); }

export function createShopBranch(customerId: string, payload: { label: string; addressLine: string; city?: string; region?: string; countryCode?: string }) {
  return apiRequest<ShopBranchOption>(`/customers/${customerId}/addresses`, { method: 'POST', body: JSON.stringify(payload) });
}
export function saveShopBranch(customerId: string, payload: { label: string; addressLine: string; city?: string; region?: string; countryCode?: string }) { return apiRequest<ShopBranchOption>(`/customers/${customerId}/address`, { method: 'PUT', body: JSON.stringify(payload) }); }

export type BranchOption = { id: string; code: string; name: string };
export function getBranches() { return apiRequest<BranchOption[]>('/branches'); }
export function createBranch(payload: { name: string; code: string }) { return apiRequest<BranchOption>('/branches', { method: 'POST', body: JSON.stringify(payload) }); }
export function updateBranch(id: string, payload: { name?: string; code?: string }) { return apiRequest<BranchOption>(`/branches/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }); }
export function deleteBranch(id: string) { return apiRequest<{ success: true }>(`/branches/${id}`, { method: 'DELETE' }); }
export type StaffOption = { id: string; displayName: string; email: string; phone?: string | null; isActive: boolean; branch?: BranchOption | null; permissions?: string[]; riderEnabled?: boolean; rider?: { id: string; employeeCode: string; isActive: boolean } | null };
export function getStaff() { return apiRequest<StaffOption[]>('/staff'); }
export type AccessOption = { code: string; description?: string | null };
export function getStaffAccessOptions() { return apiRequest<AccessOption[]>('/staff/access-options'); }
export function updateStaffAccess(id: string, payload: { permissions: string[]; riderEnabled: boolean; employeeCode?: string }) { return apiRequest<{ success: true }>(`/staff/${id}/access`, { method: 'PATCH', body: JSON.stringify(payload) }); }
export function createBranchStaff(payload: { displayName: string; email: string; password: string; phone?: string }) { return apiRequest<StaffOption>('/staff', { method: 'POST', body: JSON.stringify(payload) }); }
export function updateBranchStaff(id: string, payload: { displayName?: string; email?: string; phone?: string }) { return apiRequest<StaffOption>(`/staff/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }); }
export function deleteBranchStaff(id: string) { return apiRequest<{ success: true }>(`/staff/${id}`, { method: 'DELETE' }); }
export type PickupAssignment = { id: string; status: string; consignment: DispatchSummary & { addresses: Array<{ kind: string; addressLine: string; city?: string | null }> } };
export type RiderDeliveryAssignment = { id: string; status: 'ACTIVE' | 'ENDED'; assignedAt: string; endedAt?: string | null; allowedStatuses: RiderStatus[]; consignment: DispatchSummary & { addresses: Array<{ kind: string; addressLine: string; city?: string | null; landmark?: string | null; deliveryNote?: string | null }> } };
export function getAssignedPickups() { return apiRequest<PickupAssignment[]>('/pickups/assigned'); }
export function getMyRiderAssignments() { return apiRequest<RiderDeliveryAssignment[]>('/riders/me/assignments'); }
export function startPickup(id: string) { return apiRequest(`/pickups/${id}/start`, { method: 'POST', body: '{}' }); }
export function completePickup(id: string, remarks?: string) { return apiRequest(`/pickups/${id}/complete`, { method: 'POST', body: JSON.stringify({ remarks }) }); }
export function failPickup(id: string, reason: string) { return apiRequest(`/pickups/${id}/fail`, { method: 'POST', body: JSON.stringify({ reason }) }); }

export function getProjects(customerId?: string) {
  const query = customerId ? `?customerId=${encodeURIComponent(customerId)}` : '';
  return apiRequest<ProjectOption[]>(`/projects${query}`);
}

export function createProject(payload: { customerId?: string; name: string; siteName?: string; addressLine: string; city?: string; contactName?: string; contactPhone?: string }) {
  return apiRequest<ProjectOption>('/projects', { method: 'POST', body: JSON.stringify(payload) });
}

export type RiderScanResult = { id: string; cnNumber: string; status: string; serviceType: string; assignedToActor: boolean; allowedStatuses: RiderStatus[] };
export type RiderStatus = 'OUT_FOR_DELIVERY' | 'DELIVERED' | 'DELIVERY_FAILED';

export function unlockRiderDispatch(cnNumber: string) {
  return apiRequest<RiderScanResult>('/delivery/scan', { method: 'POST', body: JSON.stringify({ cnNumber: cnNumber.trim() }) });
}

export function updateRiderDispatchStatus(id: string, status: RiderStatus, remarks?: string) {
  return apiRequest<{ id: string; cnNumber: string; status: string; allowedStatuses: RiderStatus[] }>(`/delivery/${id}/status`, { method: 'POST', body: JSON.stringify({ status, remarks }) });
}

export function completeRiderDelivery(id: string, collectedAmount?: number, remarks?: string) {
  return apiRequest<{ id: string; cnNumber: string; status: string }>(`/delivery/${id}/complete`, {
    method: 'POST',
    headers: { 'Idempotency-Key': `rider-complete-${id}` },
    body: JSON.stringify({ collectedAmount, remarks }),
  });
}

export function failRiderDelivery(id: string, reason: string, remarks?: string) {
  return apiRequest<{ id: string }>(`/delivery/${id}/failed`, {
    method: 'POST',
    body: JSON.stringify({ reason, remarks }),
  });
}

export type RiderOption = { id: string; employeeCode: string; isActive: boolean; vehicleDetails?: { vehicleNumber?: string } | null; serviceAreas: string[]; dailyCapacity: number; deliveryFee: string | number; availability: 'AVAILABLE' | 'BUSY' | 'OFF_DUTY'; branch?: BranchOption | null; user: { id: string; displayName: string; email: string; phone?: string | null }; assignments: Array<{ consignmentId: string }>; earnings?: Array<{ amount: string | number; status: string }> };
export type RiderRecommendation = RiderOption & { activeParcels: number; remainingCapacity: number; atCapacity: boolean; areaMatched: boolean; matchedArea?: string | null };

export function getRiders() { return apiRequest<RiderOption[]>('/riders'); }
export function getRiderRecommendations(consignmentId: string) { return apiRequest<RiderRecommendation[]>(`/riders/recommendations/${consignmentId}`); }

export function createRider(payload: { displayName: string; email: string; password: string; phone?: string; employeeCode: string; vehicleNumber?: string; serviceAreas?: string[]; dailyCapacity?: number; deliveryFee?: number; availability?: string }) {
  return apiRequest<RiderOption>('/riders', { method: 'POST', body: JSON.stringify(payload) });
}
export function updateRider(id: string, payload: { displayName?: string; email?: string; phone?: string; employeeCode?: string; vehicleNumber?: string; serviceAreas?: string[]; dailyCapacity?: number; deliveryFee?: number; availability?: string }) { return apiRequest<RiderOption>(`/riders/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }); }
export function deleteRider(id: string) { return apiRequest<{ success: true }>(`/riders/${id}`, { method: 'DELETE' }); }
export function enableMyRiderAccess(employeeCode: string) { return apiRequest<{ id: string; employeeCode: string }>('/riders/me', { method: 'POST', body: JSON.stringify({ employeeCode }) }); }

export function assignDispatchRider(dispatchId: string, riderId: string) {
  return apiRequest(`/delivery/${dispatchId}/assign`, { method: 'POST', body: JSON.stringify({ riderId }) });
}

export function updateAdminDispatchStatus(dispatchId: string, status: string) {
  return apiRequest<DispatchSummary>(`/dispatches/${dispatchId}/status`, { method: 'POST', body: JSON.stringify({ status }) });
}
export function correctDispatchStatus(dispatchId: string, status: string, reason: string) { return apiRequest<DispatchSummary>(`/dispatches/${dispatchId}/correct-status`, { method: 'PATCH', body: JSON.stringify({ status, reason }) }); }
export function deleteDispatch(dispatchId: string) { return apiRequest<{ success: true }>(`/dispatches/${dispatchId}`, { method: 'DELETE' }); }

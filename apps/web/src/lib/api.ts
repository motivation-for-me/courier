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

// Browser traffic always remains same-origin. In Vercel, the Next route handler
// forwards this path through the private API_INTERNAL_URL service binding.
// Keeping deployment URLs out of the client bundle also prevents a local or
// stale NEXT_PUBLIC_API_URL from breaking production authentication.
const apiBaseUrl = '/api/v1';
const sessionKey = 'courier.auth-session';
export const sessionExpiredEvent = 'courier:session-expired';
export const dataChangedEvent = 'courier:data-changed';

export type AppNotification = { id: string; status: string; template: string; payload?: { title?: string; message?: string; consignmentId?: string; cnNumber?: string; section?: string; riderId?: string } | null; createdAt: string };
export type RiderPaymentEntry = { id: string; amount: string; currencyCode: string; status: string; kind: string; note?: string | null; reference?: string | null; sentAt?: string | null; sentById?: string | null; confirmedAt?: string | null; confirmedById?: string | null; createdAt: string; consignment?: { id: string; cnNumber: string; deliveredAt?: string | null; serviceType: string; parties: Array<{ kind: string; name: string }>; addresses: Array<{ kind: string; addressLine: string; city?: string | null }> } | null };
export type RiderPaymentTotal = { status: string; currencyCode: string; kind?: string; _count: { _all: number }; _sum: { amount: string | null } };
export type RiderPaymentRider = { id: string; employeeCode: string; deliveryFee: string; isActive: boolean; user: { displayName: string; email: string }; totals: RiderPaymentTotal[] };
export type RiderPaymentDetail = { rider: RiderPaymentRider & { organization: { currencyCode: string } }; entries: RiderPaymentEntry[]; totals: RiderPaymentTotal[]; missing: Array<{ id: string; cnNumber: string; deliveredAt?: string | null }>; missingCount: number; unpricedCount: number; total: number; page: number; pages: number; log: Array<{ id: string; action: string; actorId: string; createdAt: string; newValues: unknown }> };
export function getPaymentRiders() { return apiRequest<RiderPaymentRider[]>('/rider-payments'); }
export function saveRiderDefaultFee(id: string, amount: string) { return apiRequest(`/rider-payments/${id}/default-fee`, { method: 'POST', body: JSON.stringify({ amount, reason: 'Configure saved delivery fee' }) }); }
export function syncRiderDeliveryFees(id: string) { return apiRequest(`/rider-payments/${id}/sync-fees`, { method: 'POST', body: '{}' }); }
export function payAllRiderEarnings(id: string, reference: string) { return apiRequest(`/rider-payments/${id}/pay-all`, { method: 'POST', body: JSON.stringify({ reference }) }); }
export function getRiderPayments(id: string, page = 1, status = '') { return apiRequest<RiderPaymentDetail>(`/rider-payments/${id}?page=${page}${status ? `&status=${status}` : ''}`); }
export function recordRiderEarning(id: string, amount: string, reason: string, consignmentId?: string) { return apiRequest(`/rider-payments/${id}/entries`, { method: 'POST', body: JSON.stringify({ amount, reason, consignmentId }) }); }
export function amendRiderEarning(id: string, entryId: string, amount: string, reason: string) { return apiRequest(`/rider-payments/${id}/entries/${entryId}`, { method: 'PATCH', body: JSON.stringify({ amount, reason }) }); }
export function sendRiderPayment(id: string, ids: string[], reference: string) { return apiRequest(`/rider-payments/${id}/pay`, { method: 'POST', body: JSON.stringify({ ids, reference }) }); }
export function confirmRiderPayment(entryId: string, decision: 'confirm' | 'dispute', reason?: string) { return apiRequest(`/rider-payments/entries/${entryId}/receipt`, { method: 'POST', body: JSON.stringify({ decision, reason }) }); }
export function getNotificationInbox(unreadOnly = false) { return apiRequest<{ items: AppNotification[]; unread: number }>(`/notifications/inbox?unread=${unreadOnly}`); }
export function getNotifications() { return apiRequest<AppNotification[]>('/notifications'); }
export function sendRiderMessage(message: string) { return apiRequest<{ success: true; recipients: number }>('/notifications/rider-message', { method: 'POST', body: JSON.stringify({ message }) }); }
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

export function getAuthConfig() { return apiRequest<{ googleClientId: string | null; emailEnabled: boolean }>('/auth/config'); }
export async function loginWithGoogle(credential: string) {
  const session = await apiRequest<AuthSession>('/auth/google', { method: 'POST', body: JSON.stringify({ credential }) });
  sessionStorage.setItem(sessionKey, JSON.stringify(session));
  return session;
}
export function requestAccountEmail(email: string, reset = false) { return apiRequest<{ message: string }>(reset ? '/auth/forgot-password' : '/auth/request-verification', { method: 'POST', body: JSON.stringify({ email }) }); }
export function verifyAccountEmail(token: string) { return apiRequest<{ message: string }>('/auth/verify-email', { method: 'POST', body: JSON.stringify({ token }) }); }
export function resetAccountPassword(token: string, password: string) { return apiRequest<{ message: string }>('/auth/reset-password', { method: 'POST', body: JSON.stringify({ token, password }) }); }
export async function changeAccountPassword(currentPassword: string, password: string) {
  const result = await apiRequest<{ message: string }>('/auth/change-password', { method: 'POST', body: JSON.stringify({ currentPassword, password }) });
  clearSession();
  window.dispatchEvent(new CustomEvent(sessionExpiredEvent));
  return result;
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
    throw new ApiError(0, typeof navigator !== 'undefined' && !navigator.onLine ? 'You are offline. Reconnect and try again.' : 'Unable to reach the courier API. Please wait a moment and try again.');
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

  let result: T;
  try {
    result = await response.json() as T;
  } catch {
    throw new ApiError(response.status, `The API returned an invalid response for ${path}. Refresh the page and try again.`);
  }
  if (method !== 'GET' && method !== 'HEAD' && !path.startsWith('/auth/')) {
    window.dispatchEvent(new CustomEvent(dataChangedEvent, { detail: { method, path } }));
  }
  return result;
}

export function getConsignments(query = '') {
  return apiRequest<DispatchSummary[]>(`/dispatches${query}`);
}

export type DispatchPage = { items: DispatchSummary[]; total: number; page: number; pageSize: number; pages: number };
export async function getConsignmentPage(query = '') {
  const result = await apiRequest<DispatchPage | DispatchSummary[]>(`/dispatches/page${query}`);
  if (Array.isArray(result)) return { items: result, total: result.length, page: 1, pageSize: result.length, pages: 1 };
  return {
    items: Array.isArray(result?.items) ? result.items : [],
    total: typeof result?.total === 'number' ? result.total : 0,
    page: typeof result?.page === 'number' ? result.page : 1,
    pageSize: typeof result?.pageSize === 'number' ? result.pageSize : result?.items?.length ?? 0,
    pages: typeof result?.pages === 'number' ? result.pages : 1,
  };
}

export type DispatchDashboardSummary = { counts: { today: number; pending: number; active: number; delivered: number; total: number }; recent: DispatchSummary[] };
export function getDispatchDashboardSummary() { return apiRequest<DispatchDashboardSummary>('/dispatches/summary'); }

export type DispatchSummary = { id: string; cnNumber: string; status: string; serviceType: string; currentStatusAt: string; createdAt: string; publicTrackingKey?: string; customer?: { id: string; name: string } | null; project?: { id: string; name: string; siteName?: string | null; addressLine: string } | null; parties: Array<{ kind: string; name: string; phone?: string | null }>; items: Array<{ id: string; description: string; quantity: number; unit: string }>; payments: Array<{ amount: string | number; status: string; method: string }>; assignments: Array<{ riderId: string; rider: { employeeCode: string; user: { displayName: string; phone?: string | null } } }> };
export type TrackingResult = { found: false } | { found: true; shipment: { cnNumber: string; status: string; serviceType: string; currentStatusAt: string; organization?: { name?: string | null } | null; receiver?: { name: string } | null; destination?: { addressLine: string; city?: string | null; landmark?: string | null; deliveryNote?: string | null } | null; rider?: { employeeCode: string; vehicleDetails?: { vehicleNumber?: string } | null; user: { displayName: string; phone?: string | null } } | null; events: Array<{ eventType: string; eventTime: string; remarks?: string | null }> } };

export function trackDispatch(cnNumber: string, key?: string) {
  const query = key ? `?key=${encodeURIComponent(key)}` : '';
  return apiRequest<TrackingResult>(`/tracking/public/${encodeURIComponent(cnNumber.trim())}${query}`);
}

export async function openDispatchDocument(id: string, mode: 'view' | 'download') {
  const accessToken = getSession()?.accessToken;
  const preview = mode === 'view' ? window.open('about:blank', '_blank') : null;
  if (preview) { preview.opener = null; preview.document.title = 'Preparing PDF'; preview.document.body.textContent = 'Preparing secure PDF preview...'; }
  const response = await fetch(`${apiBaseUrl}/documents/consignments/${id}.pdf?download=${mode === 'download' ? '1' : '0'}`, { headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {} });
  if (!response.ok) {
    preview?.close();
    if (response.status === 401 && accessToken) {
      clearSession();
      window.dispatchEvent(new CustomEvent(sessionExpiredEvent));
    }
    const body = await response.json().catch(() => null) as { message?: string } | null;
    throw new ApiError(response.status, body?.message ?? 'Unable to open dispatch PDF');
  }
  const disposition = response.headers.get('content-disposition') ?? '';
  const filename = disposition.match(/filename="([^"]+)"/)?.[1] ?? 'swiftlog-dispatch.pdf';
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
export type ShopUserOption = { id: string; displayName: string; email: string; phone?: string | null; isActive: boolean; createdAt: string; emailVerifiedAt?: string | null; shopPermissions?: string[] };
export type AccountDirectoryResult = { total: number; page: number; pages: number; accounts: Array<{ id: string; displayName: string; email: string; phone?: string | null; roles: string[]; isActive: boolean; emailVerifiedAt?: string | null; customer?: { name: string } | null; rider?: { employeeCode: string } | null }> };
export function getAccountDirectory(role: string, search: string, page: number) { const query = new URLSearchParams({ page: String(page) }); if (role) query.set('role', role); if (search) query.set('search', search); return apiRequest<AccountDirectoryResult>(`/auth/accounts?${query}`); }
export type AccountInput = { displayName: string; email: string; phone: string; password?: string; isActive?: boolean; role?: string; employeeCode?: string; customerId?: string };
export function saveAccount(id: string | null, input: AccountInput) { return apiRequest(id ? `/accounts/${id}` : '/accounts', { method: id ? 'PATCH' : 'POST', body: JSON.stringify(input) }); }
export function deleteAccount(id: string) { return apiRequest(`/accounts/${id}`, { method: 'DELETE' }); }
export type RecycleBinResult = { items: Array<{ id: string; label: string; entityType: string; createdAt: string }>; total: number; page: number; pages: number };
export function getRecycleBin(type: string, search: string, page: number) { return apiRequest<RecycleBinResult>(`/recycle-bin?${new URLSearchParams({ type, search, page: String(page) })}`); }
export function restoreDeletedRecord(id: string) { return apiRequest(`/recycle-bin/${id}/restore`, { method: 'POST', body: '{}' }); }
export function updateShopUser(customerId: string, userId: string, payload: { isActive?: boolean; permissions?: string[]; password?: string }) { return apiRequest<ShopUserOption>(`/customers/${customerId}/users/${userId}`, { method: 'PATCH', body: JSON.stringify(payload) }); }
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
export type PickupAssignment = { id: string; status: string; consignment: DispatchSummary & { addresses: Array<{ kind: string; addressLine: string; city?: string | null }> } };
export type RiderDeliveryAssignment = { id: string; status: 'ACTIVE' | 'ENDED'; assignedAt: string; endedAt?: string | null; allowedStatuses: RiderStatus[]; consignment: DispatchSummary & { addresses: Array<{ kind: string; addressLine: string; city?: string | null; landmark?: string | null; deliveryNote?: string | null }> } };
export function getAssignedPickups() { return apiRequest<PickupAssignment[]>('/pickups/assigned'); }
export function getMyRiderAssignments() { return apiRequest<RiderDeliveryAssignment[]>('/riders/me/assignments'); }
export type RiderFinanceSummary = { completed: number; completedToday: number; completedThisMonth: number; pending: number; paid: number; deliveryFee: string | number; currencyCode: string; recent: Array<{ id: string; amount: string | number; currencyCode: string; status: string; paidAt?: string | null; createdAt: string; consignment: { cnNumber: string } }> };
export function getMyRiderFinance() { return apiRequest<RiderFinanceSummary>('/riders/me/finance'); }
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

export type RiderScanResult = { id: string; cnNumber: string; status: string; serviceType: string; assignedToActor: boolean; currentStatusAt: string; parties: Array<{ kind: string; name: string; phone?: string | null }>; addresses: Array<{ kind: string; addressLine: string; city?: string | null; landmark?: string | null; deliveryNote?: string | null }>; items: Array<{ description: string; quantity: number; unit: string }>; events: Array<{ eventType: string; eventTime: string; remarks?: string | null; location?: { name: string; city?: string | null } | null }>; allowedStatuses: RiderStatus[] };
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

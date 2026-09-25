export type ApiError = {
  status: number;
  message: string;
};

const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';

export async function apiRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    credentials: 'include',
  });

  if (!response.ok) {
    let message = `Request failed with status ${response.status}`;
    try {
      const body = (await response.json()) as { message?: string; error?: { message?: string } };
      message = body.error?.message ?? body.message ?? message;
    } catch {
      // Preserve the HTTP error when the API does not return JSON.
    }
    throw { status: response.status, message } satisfies ApiError;
  }

  return response.json() as Promise<T>;
}

export function getConsignments(query = '') {
  return apiRequest<{ items: unknown[]; nextCursor?: string }>(`/consignments${query}`);
}

export function createConsignment(payload: unknown) {
  return apiRequest<{ id: string; cnNumber: string; status: string }>('/consignments', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

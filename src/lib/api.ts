export class ApiError extends Error {
  status: number;
  code?: string;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const isForm = options.body instanceof FormData;
  const res = await fetch(path, {
    credentials: 'include',
    headers: isForm ? undefined : { 'Content-Type': 'application/json' },
    ...options,
  });

  const text = await res.text();
  const data = text ? JSON.parse(text) : null;

  if (!res.ok) {
    throw new ApiError(data?.error ?? 'تعذّر إكمال الطلب', res.status, data?.code);
  }
  return data as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'POST', body: body instanceof FormData ? body : JSON.stringify(body ?? {}) }),
  patch: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PATCH', body: JSON.stringify(body ?? {}) }),
  del: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};

export function uploadFile(file: File, onProgress?: (percent: number) => void): Promise<{ id: string; name: string; url: string; size: number }> {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.append('file', file);
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/teacher/upload');
    xhr.withCredentials = true;
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && onProgress) onProgress(Math.round((event.loaded / event.total) * 100));
    };
    xhr.onload = () => {
      try {
        const data = JSON.parse(xhr.responseText || '{}');
        if (xhr.status >= 200 && xhr.status < 300) resolve(data);
        else reject(new ApiError(data.error ?? 'فشل رفع الملف', xhr.status));
      } catch {
        reject(new ApiError('فشل رفع الملف', xhr.status));
      }
    };
    xhr.onerror = () => reject(new ApiError('تعذّر الاتصال بالخادم', 0));
    xhr.send(form);
  });
}

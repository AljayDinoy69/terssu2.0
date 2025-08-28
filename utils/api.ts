// For Expo Go on a physical device, point to your PC's LAN IP
// Detected IP from your ipconfig: 192.168.100.10
export const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://192.168.100.10:4000';

async function request<T = any>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    ...options,
  });
  const text = await res.text();
  let data: any;
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
  if (!res.ok) {
    const msg = data?.error || res.statusText || 'Request failed';
    throw new Error(msg);
  }
  return data as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: any) => request<T>(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined }),
  patch: <T>(path: string, body?: any) => request<T>(path, { method: 'PATCH', body: body ? JSON.stringify(body) : undefined }),
  delete: <T>(path: string, body?: any) => request<T>(path, { method: 'DELETE', body: body ? JSON.stringify(body) : undefined }),
};

// Upload image to server -> Cloudinary. Expects a local file URI (Expo/React Native)
export async function uploadImage(uri: string): Promise<{ url: string; publicId: string; width: number; height: number; bytes: number; format: string; }>{
  const form = new FormData();
  // Guess a filename and type from uri
  const name = uri.split('/').pop() || `photo.jpg`;
  const ext = (name.split('.').pop() || 'jpg').toLowerCase();
  const type = `image/${ext === 'jpg' ? 'jpeg' : ext}`;
  form.append('file', { uri, name, type } as any);

  const res = await fetch(`${API_BASE_URL}/upload`, {
    method: 'POST',
    // Do NOT set Content-Type; RN will set the correct multipart boundary
    body: form,
  });
  const text = await res.text();
  let data: any;
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
  if (!res.ok) {
    const msg = data?.error || res.statusText || 'Upload failed';
    throw new Error(msg);
  }
  return data as any;
}

export default api;

import { Platform } from 'react-native';
import Constants from 'expo-constants';

// Resolve API base URL to work on emulators AND real devices.
// Order of precedence:
// 1) EXPO_PUBLIC_API_URL (recommended)
// 2) Expo hostUri-derived LAN IP + port 4000 (dev convenience)
// 3) Defaults: Android emulator 10.0.2.2, iOS simulator/others localhost
function resolveBaseUrl() {
  const envUrl = (process.env.EXPO_PUBLIC_API_URL || '').trim();
  let base = envUrl;

  if (!base) {
    const anyConstants = Constants as any;
    const hostUri = anyConstants?.expoConfig?.hostUri || anyConstants?.manifest2?.extra?.hostUri || anyConstants?.manifest?.hostUri || '';
    if (hostUri) {
      // hostUri like "192.168.1.5:19000" or "localhost:19000"
      const host = String(hostUri).split(':')[0];
      const resolvedHost = (Platform.OS === 'android' && (host === 'localhost' || host === '127.0.0.1')) ? '10.0.2.2' : host;
      base = `http://${resolvedHost}:4000`;
    }
  }

  if (!base) {
    // Final fallbacks
    base = Platform.OS === 'android' ? 'http://10.0.2.2:4000' : 'http://localhost:4000';
  }

  // Ensure Android emulator localhost mapping if someone hardcoded localhost
  if (Platform.OS === 'android') {
    base = base.replace('localhost', '10.0.2.2').replace('127.0.0.1', '10.0.2.2');
  }

  // Normalize: remove trailing slash
  base = base.replace(/\/$/, '');
  return base;
}

export const API_BASE_URL = resolveBaseUrl();
console.log('[API] Base URL:', API_BASE_URL);

async function request<T = any>(path: string, options: RequestInit = {}): Promise<T> {
  const url = `${API_BASE_URL}${path}`;
  const controller = new AbortController();
  const timeoutMs = 12000; // 12s timeout for mobile networks
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  console.log('[API] ->', options.method || 'GET', url);
  try {
    const res = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
      ...options,
      signal: controller.signal,
    });
    const text = await res.text();
    let data: any;
    try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
    if (!res.ok) {
      const msg = data?.error || res.statusText || 'Request failed';
      throw new Error(msg);
    }
    console.log('[API] <-', res.status, url);
    return data as T;
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      throw new Error(`Network timeout. Cannot reach ${API_BASE_URL}. Please check your API URL and connectivity.`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
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

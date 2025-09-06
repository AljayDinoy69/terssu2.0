import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import NetInfo, { NetInfoState } from '@react-native-community/netinfo';
import { API_BASE_URL } from '../../utils/api';

export type ServerStatus = 'unknown' | 'online' | 'offline';

export const checkServerHealth = createAsyncThunk('network/checkServerHealth', async () => {
  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 6000);
    const res = await fetch(`${API_BASE_URL}/health`, { signal: controller.signal });
    clearTimeout(t);
    if (res.ok) return 'online' as ServerStatus;
    return 'offline' as ServerStatus;
  } catch {
    return 'offline' as ServerStatus;
  }
});

export type NetworkState = {
  isConnected: boolean | null;
  isInternetReachable: boolean | null;
  serverStatus: ServerStatus;
  lastChecked: number | null;
  baseUrl: string;
};

const initialState: NetworkState = {
  isConnected: null,
  isInternetReachable: null,
  serverStatus: 'unknown',
  lastChecked: null,
  baseUrl: API_BASE_URL,
};

const networkSlice = createSlice({
  name: 'network',
  initialState,
  reducers: {
    netInfoChanged(state, action: PayloadAction<Pick<NetInfoState, 'isConnected' | 'isInternetReachable'>>){
      state.isConnected = action.payload.isConnected ?? null;
      state.isInternetReachable = action.payload.isInternetReachable ?? null;
    },
  },
  extraReducers: builder => {
    builder
      .addCase(checkServerHealth.pending, (state) => {
        state.lastChecked = Date.now();
      })
      .addCase(checkServerHealth.fulfilled, (state, action) => {
        state.serverStatus = action.payload;
        state.lastChecked = Date.now();
      })
      .addCase(checkServerHealth.rejected, (state) => {
        state.serverStatus = 'offline';
        state.lastChecked = Date.now();
      });
  },
});

export const { netInfoChanged } = networkSlice.actions;
export default networkSlice.reducer;

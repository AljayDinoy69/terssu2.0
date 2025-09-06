import React, { useEffect, useRef } from 'react';
import NetInfo from '@react-native-community/netinfo';
import { AppState, AppStateStatus } from 'react-native';
import { useAppDispatch } from '../store/hooks';
import { checkServerHealth, netInfoChanged } from '../store/slices/networkSlice';

type Props = { children: React.ReactNode };

const NetworkProvider: React.FC<Props> = ({ children }) => {
  const dispatch = useAppDispatch();
  const appState = useRef<AppStateStatus>(AppState.currentState);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    // Subscribe to NetInfo changes
    const unsubscribeNetInfo = NetInfo.addEventListener((state) => {
      dispatch(netInfoChanged({
        isConnected: state.isConnected ?? null,
        isInternetReachable: (state.isInternetReachable as boolean | null) ?? null,
      }));
    });

    // Initial checks
    dispatch(checkServerHealth());

    // Periodic server health check (every 20s)
    intervalRef.current = setInterval(() => {
      dispatch(checkServerHealth());
    }, 20000);

    // AppState listener to re-check on foreground
    const onChange = (next: AppStateStatus) => {
      const prev = appState.current;
      appState.current = next;
      if (prev.match(/inactive|background/) && next === 'active') {
        dispatch(checkServerHealth());
      }
    };
    const appStateSub = AppState.addEventListener('change', onChange);

    return () => {
      unsubscribeNetInfo();
      appStateSub.remove();
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [dispatch]);

  return <>{children}</>;
};

export default NetworkProvider;

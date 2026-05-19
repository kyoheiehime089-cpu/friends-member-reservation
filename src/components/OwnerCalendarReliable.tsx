"use client";

import { useCallback, useEffect, useState } from 'react';
import { OwnerCalendarFinal } from '@/components/OwnerCalendarFinal';

export function OwnerCalendarReliable() {
  const [version, setVersion] = useState(0);

  const refresh = useCallback(() => {
    setVersion((current) => current + 1);
  }, []);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh();
    };

    window.addEventListener('focus', refresh);
    window.addEventListener('pageshow', refresh);
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      window.removeEventListener('focus', refresh);
      window.removeEventListener('pageshow', refresh);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [refresh]);

  return <OwnerCalendarFinal key={version} />;
}

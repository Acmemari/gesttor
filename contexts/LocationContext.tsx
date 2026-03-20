import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useAuth } from './AuthContext';

type Country = 'BR' | 'PY';

interface LocationContextType {
  country: Country;
  setCountry: (country: Country) => void;
  currency: string;
  currencySymbol: string;
  paraguayEnabled: boolean;
  refreshSettings: () => Promise<void>;
}

const LocationContext = createContext<LocationContextType | undefined>(undefined);

export const LocationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  useAuth();
  const paraguayEnabled = false;
  const [country, setCountry] = useState<Country>(() => {
    const saved = localStorage.getItem('selectedCountry');
    return (saved === 'PY' ? 'PY' : 'BR') as Country;
  });

  const fetchParaguayEnabled = useCallback(async () => {
    // Paraguay feature not available in current architecture
  }, []);

  useEffect(() => {
    fetchParaguayEnabled();
  }, [fetchParaguayEnabled]);

  // Paraguay is always disabled; force BR if PY was saved
  useEffect(() => {
    if (country === 'PY') {
      setCountry('BR');
    }
  }, [country]);

  useEffect(() => {
    localStorage.setItem('selectedCountry', country);
  }, [country]);

  const currency = country === 'PY' ? 'PYG' : 'BRL';
  const currencySymbol = country === 'PY' ? 'G$' : 'R$';

  return (
    <LocationContext.Provider
      value={{ country, setCountry, currency, currencySymbol, paraguayEnabled, refreshSettings: fetchParaguayEnabled }}
    >
      {children}
    </LocationContext.Provider>
  );
};

export const useLocation = () => {
  const context = useContext(LocationContext);
  if (context === undefined) {
    throw new Error('useLocation must be used within a LocationProvider');
  }
  return context;
};

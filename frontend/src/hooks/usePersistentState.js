import { useState, useEffect } from 'react';

/**
 * Custom hook để lưu state vào localStorage
 * State sẽ không bị mất khi reload
 */
export const usePersistentState = (key, defaultValue) => {
  const [state, setState] = useState(() => {
    try {
      // Lấy data từ localStorage khi component mount
      const savedValue = localStorage.getItem(key);
      if (savedValue) {
        return JSON.parse(savedValue);
      }
      return defaultValue;
    } catch (error) {
      console.error(`Error loading ${key} from localStorage:`, error);
      return defaultValue;
    }
  });

  useEffect(() => {
    try {
      // Lưu state vào localStorage mỗi khi state thay đổi
      localStorage.setItem(key, JSON.stringify(state));
    } catch (error) {
      console.error(`Error saving ${key} to localStorage:`, error);
    }
  }, [key, state]);

  return [state, setState];
};

export default usePersistentState;
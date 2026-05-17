import { useState } from 'react';
import { AUTH_KEY, PASSCODE } from '../constants';

interface PasscodeScreenProps {
  onAuth: () => void;
}

export function PasscodeScreen({ onAuth }: PasscodeScreenProps) {
  const [value, setValue] = useState('');
  const [error, setError] = useState(false);

  const submit = () => {
    if (value === PASSCODE) {
      localStorage.setItem(AUTH_KEY, '1');
      onAuth();
      return;
    }

    setError(true);
    setValue('');
    setTimeout(() => setError(false), 1200);
  };

  return (
    <div className="passcode-screen">
      <div className="passcode-card">
        <div className="passcode-logo">Allet</div>
        <p className="passcode-welcome">Welcome back</p>
        <input
          className={`passcode-input ${error ? 'passcode-error' : ''}`}
          type="password"
          inputMode="numeric"
          maxLength={8}
          placeholder="Введи код"
          value={value}
          autoFocus
          onChange={e => setValue(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && submit()}
        />
        {error && <p className="passcode-hint">Неверный код</p>}
        <button className="passcode-btn" onClick={submit}>Войти</button>
      </div>
    </div>
  );
}

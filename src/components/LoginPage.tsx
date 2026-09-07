import React, { useState } from 'react';
import { signIn, signUp } from '../utils/supabase';

interface LoginPageProps {
  role: 'customer' | 'admin';
  onLoginSuccess: () => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({ role, onLoginSuccess }) => {
  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await login(email, password);
  };

  const login = async (selectedEmail: string, selectedPassword: string, quick = false) => {
    setEmail(selectedEmail);
    setPassword(selectedPassword);
    setError('');
    setLoading(true);

    try {
      if (!selectedEmail || !selectedPassword) {
        setError(quick ? '이 테스트 계정의 빠른 로그인 비밀번호가 설정되지 않았습니다.' : '이메일과 비밀번호를 입력하세요');
        setLoading(false);
        return;
      }

      let result;
      if (isSignUp && !quick) {
        result = await signUp(selectedEmail, selectedPassword);
      } else {
        result = await signIn(selectedEmail, selectedPassword);
      }

      if (result.error) {
        setError(result.error);
      } else if (result.userId) {
        // 사용자 ID가 반환되면 성공
        onLoginSuccess();
      } else {
        setError('로그인 실패: 사용자 정보를 확인할 수 없습니다');
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: '400px', margin: '100px auto', padding: '20px' }}>
      <h2 style={{ textAlign: 'center', marginBottom: '30px' }}>cal.dudu-works.com</h2>

      <div style={{ background: 'white', padding: '30px', borderRadius: '4px', border: '1px solid #ddd' }}>
        <h3 style={{ marginBottom: '20px', textAlign: 'center' }}>
          {isSignUp ? 'Supabase 회원가입' : role === 'admin' ? 'Supabase 관리자 로그인' : 'Supabase 고객 로그인'}
        </h3>

        {error && <div className="alert alert-error" style={{ marginBottom: '15px' }}>{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="login-email">이메일</label>
            <input
              id="login-email"
              autoComplete="username"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="user@example.com"
              disabled={loading}
              style={{ width: '100%', padding: '10px', marginBottom: '15px' }}
            />
          </div>

          <div className="form-group">
            <label htmlFor="login-password">비밀번호</label>
            <input
              id="login-password"
              autoComplete={isSignUp ? "new-password" : "current-password"}
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              disabled={loading}
              style={{ width: '100%', padding: '10px', marginBottom: '20px' }}
            />
          </div>

          <button
            type="submit"
            className="btn btn-primary"
            disabled={loading}
            style={{ width: '100%', padding: '10px', marginBottom: '10px' }}
          >
            {loading ? '처리 중...' : isSignUp ? '회원가입' : '로그인'}
          </button>
        </form>

        <div style={{ textAlign: 'center', marginTop: '15px' }}>
          <button
            className="btn btn-secondary"
            onClick={() => {
              setIsSignUp(!isSignUp);
              setError('');
            }}
            disabled={loading}
            style={{ padding: '8px 16px', fontSize: '14px' }}
          >
            {isSignUp ? '로그인 화면으로' : '회원가입 화면으로'}
          </button>
        </div>

        <div style={{ marginTop: '20px' }}>
          {(role === 'admin'
            ? [{ label: '관리자', email: 'admin@test.com', password: (import.meta as any).env.VITE_TEST_ADMIN_PASSWORD || '' }]
            : [{ label: 'C01', email: 'user1@test.com', password: (import.meta as any).env.VITE_TEST_C01_PASSWORD || '' }, { label: 'C02', email: 'user2@test.com', password: (import.meta as any).env.VITE_TEST_C02_PASSWORD || '' }]
          ).map(account => (
            <button key={account.label} type="button" className="btn btn-secondary"
              disabled={loading} onClick={() => { setIsSignUp(false); void login(account.email, account.password, true); }}>
              {account.label} 빠른 로그인
            </button>
          ))}
          <p>빠른 로그인은 수업용 테스트 계정입니다.</p>
        </div>
      </div>
    </div>
  );
};

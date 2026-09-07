import React, { useState } from 'react';
import { signIn, signUp } from '../utils/supabase';

interface LoginPageProps {
  onLoginSuccess: () => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({ onLoginSuccess }) => {
  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (!email || !password) {
        setError('이메일과 비밀번호를 입력하세요');
        setLoading(false);
        return;
      }

      let result;
      if (isSignUp) {
        result = await signUp(email, password);
      } else {
        result = await signIn(email, password);
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
          {isSignUp ? 'Supabase 회원가입' : 'Supabase 로그인'}
        </h3>

        {error && <div className="alert alert-error" style={{ marginBottom: '15px' }}>{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>이메일</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="user@example.com"
              disabled={loading}
              style={{ width: '100%', padding: '10px', marginBottom: '15px' }}
            />
          </div>

          <div className="form-group">
            <label>비밀번호</label>
            <input
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

        <div style={{ fontSize: '12px', color: '#666', marginTop: '30px', padding: '15px', background: '#f0f8ff', borderRadius: '4px', border: '1px solid #d4e6f1' }}>
          <p style={{ margin: '0 0 10px 0' }}><strong>📌 데모 테스트 계정</strong></p>
          <div style={{ background: 'white', padding: '10px', borderRadius: '3px', marginBottom: '10px', fontFamily: 'monospace' }}>
            <p style={{ margin: '0 0 6px 0' }}>고객1: <code style={{ background: '#f0f0f0', padding: '2px 4px' }}>user1@test.com</code></p>
            <p style={{ margin: '0 0 6px 0' }}>고객2: <code style={{ background: '#f0f0f0', padding: '2px 4px' }}>user2@test.com</code></p>
            <p style={{ margin: '0' }}>관리자: <code style={{ background: '#f0f0f0', padding: '2px 4px' }}>admin@test.com</code></p>
          </div>
          <p style={{ margin: '0 0 8px 0' }}><strong>계정 설정 방법:</strong></p>
          <ol style={{ margin: '0', paddingLeft: '16px', fontSize: '11px' }}>
            <li>위의 테스트 계정 이메일과 임의의 비밀번호를 입력하여 회원가입</li>
            <li>관리자 계정은 Supabase 대시보드에서 app_metadata.role을 'admin'으로 설정</li>
          </ol>
        </div>
      </div>
    </div>
  );
};

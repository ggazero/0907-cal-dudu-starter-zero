import React, { useState, useEffect } from 'react';
import { CustomerPage } from '../components/CustomerPage';
import { AdminPage } from '../components/AdminPage';
import { LoginPage } from '../components/LoginPage';
import { DatabaseManager } from '../utils/database';
import { REFERENCE_TIME } from '../utils/constants';
import { initSupabase, signOut } from '../utils/supabase';

type Mode = 'local' | 'supabase';
type Role = 'customer' | 'admin';

const EntryPage: React.FC = () => (
  <div className="container">
    <div className="header">
      <h1>cal.dudu-works.com</h1>
      <div className="role-selector">
        <a className="btn btn-secondary" href="/service_blueprint_asis.html" target="_blank" rel="noopener noreferrer">📋 AS-IS</a>
        <a className="btn btn-secondary" href="/service_blueprint_tobe.html" target="_blank" rel="noopener noreferrer">🎯 TO-BE</a>
      </div>
    </div>
    <main>
      <h2>서비스 진입 선택</h2>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '20px' }}>
        <section aria-labelledby="local-mode-title" style={{ flex: '1 1 260px', border: '1px solid #ddd', padding: '24px' }}>
          <h3 id="local-mode-title">로컬 모드</h3>
          <p>수업용 로컬 데모</p>
          <a className="btn btn-primary" href="/local">로컬 모드 시작</a>
        </section>
        <section aria-labelledby="supabase-mode-title" style={{ flex: '1 1 260px', border: '1px solid #ddd', padding: '24px' }}>
          <h3 id="supabase-mode-title">Supabase 모드</h3>
          <p>실제 Supabase DB/Auth 사용</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
            <a className="btn btn-primary" href="/customer">고객 로그인</a>
            <a className="btn btn-secondary" href="/admin">관리자 로그인</a>
          </div>
        </section>
      </div>
    </main>
  </div>
);

const BookingApp: React.FC = () => {
  const localEntry = window.location.pathname === '/local';
  const adminEntry = /^\/admin\/?$/.test(window.location.pathname);
  const [mode, setMode] = useState<Mode>(localEntry ? 'local' : 'supabase');
  const [role, setRole] = useState<Role>('customer');
  const [db] = useState(() => new DatabaseManager());
  const [supabaseError, setSupabaseError] = useState<string>('');
  const [isAdminUser, setIsAdminUser] = useState(false);
  const [loading, setLoading] = useState(false);
  const [isSupabaseLoggedIn, setIsSupabaseLoggedIn] = useState(false);

  useEffect(() => {
    if (mode !== 'supabase') return;
    let active = true;
    let unsubscribe: (() => void) | undefined;
    setLoading(true);
    try {
      const client = initSupabase();
      const { data } = client.auth.onAuthStateChange((_event, session) => {
        if (!active) return;
        setIsSupabaseLoggedIn(Boolean(session?.user));
        setIsAdminUser(session?.user.app_metadata?.role === 'admin');
        setLoading(false);
      });
      unsubscribe = () => data.subscription.unsubscribe();
      client.auth.getSession().then(({ data, error }) => {
        if (!active) return;
        if (error) {
          // 세션 오류는 로그인 화면으로 자동 이동 (오류 표시 금지)
          setSupabaseError('');
          setIsSupabaseLoggedIn(false);
          setIsAdminUser(false);
        } else {
          setIsSupabaseLoggedIn(Boolean(data.session?.user));
          setIsAdminUser(data.session?.user.app_metadata?.role === 'admin');
          if (!data.session?.user) {
            setSupabaseError('');
          }
        }
        setLoading(false);
      }).catch(() => {
        if (!active) return;
        // 세션 조회 오류도 로그인 화면으로 이동
        setSupabaseError('');
        setIsSupabaseLoggedIn(false);
        setIsAdminUser(false);
        setLoading(false);
      });
    } catch (error) {
      setSupabaseError(String(error));
      setLoading(false);
    }
    return () => { active = false; unsubscribe?.(); };
  }, [mode]);

  const handleLogout = async () => {
    try {
      await signOut();
      // 오류 없음 또는 세션 없음 - 모두 정상 처리
      setIsSupabaseLoggedIn(false);
      setIsAdminUser(false);
      setSupabaseError('');
    } catch (error) {
      // 예상치 못한 오류만 표시
      setSupabaseError(`로그아웃 오류: ${String(error)}`);
    }
  };

  const handleLoginSuccess = () => {
    setSupabaseError('');
  };

  const handleModeChange = (newMode: Mode) => {
    if (newMode === 'supabase') {
      setSupabaseError('');
      setMode(newMode);
    } else {
      setMode(newMode);
      setSupabaseError('');
      setIsSupabaseLoggedIn(false);
      setIsAdminUser(false);
    }
  };

  const handleRoleChange = (newRole: Role) => {
    setRole(newRole);
  };

  const handleResetData = () => {
    if (window.confirm('모든 데이터를 초기화하시겠습니까? 이 작업은 되돌릴 수 없습니다.')) {
      db.reset();
      window.location.reload();
    }
  };


  return (
    <div className="container">
      <div className="header">
        <div>
          <h1>cal.dudu-works.com</h1>
          <div className="reference-time">
            기준 시각: {REFERENCE_TIME.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })} (고정)
          </div>
        </div>

        <div className="role-selector">
          {localEntry && <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <span style={{ fontWeight: 'bold', fontSize: '14px' }}>모드</span>
            <button
              className={`btn ${mode === 'local' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => handleModeChange('local')}
              disabled={loading}
              style={{ padding: '8px 16px', fontSize: '14px' }}
            >
              {loading && mode === 'supabase' ? '연결 중...' : '로컬'}
            </button>
            <button
              className={`btn ${mode === 'supabase' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => handleModeChange('supabase')}
              disabled={loading}
              style={{ padding: '8px 16px', fontSize: '14px' }}
            >
              {loading && mode !== 'supabase' ? '연결 중...' : 'Supabase'}
            </button>
          </div>}

          <a className="btn btn-secondary" href={adminEntry ? '/customer' : '/admin'}>
            {adminEntry ? '고객 페이지로 이동' : '관리자 페이지로 이동'}
          </a>

          <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginLeft: '20px' }}>
            <span style={{ fontWeight: 'bold', fontSize: '14px' }}>역할</span>
            {mode === 'local' ? (
              <>
                <button
                  className={`btn ${role === 'customer' ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => handleRoleChange('customer')}
                  style={{ padding: '8px 16px', fontSize: '14px' }}
                >
                  고객
                </button>
                <button
                  className={`btn ${role === 'admin' ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => handleRoleChange('admin')}
                  style={{ padding: '8px 16px', fontSize: '14px' }}
                >
                  어드민
                </button>
              </>
            ) : (
              <span style={{ fontSize: '14px', color: '#666' }}>
                {isAdminUser ? '어드민' : '고객'} (Supabase 인증)
              </span>
            )}
          </div>

          {mode === 'local' && (
            <button
              className="btn btn-secondary"
              onClick={handleResetData}
              style={{ padding: '6px 12px', fontSize: '12px', marginLeft: '20px' }}
            >
              데이터 초기화
            </button>
          )}

          <a
            href="/service_blueprint_asis.html"
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-secondary"
            style={{ padding: '6px 12px', fontSize: '12px', marginLeft: '20px', textDecoration: 'none', display: 'inline-block' }}
          >
            📋 AS-IS
          </a>

          <a
            href="/service_blueprint_tobe.html"
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-secondary"
            style={{ padding: '6px 12px', fontSize: '12px', marginLeft: '8px', textDecoration: 'none', display: 'inline-block' }}
          >
            🎯 TO-BE
          </a>
        </div>
      </div>

      {mode === 'local' && (
        <div className="alert alert-info">
          <strong>로컬 모드:</strong> 브라우저 로컬 스토리지에 데이터를 저장합니다. 진짜 인증이 아닌 수업용 데모입니다.
          역할 전환은 이 모드에만 있습니다.
        </div>
      )}

      {mode === 'supabase' && supabaseError && (
        <div className="alert alert-error">
          <strong>Supabase 오류:</strong> {supabaseError}
        </div>
      )}

      {mode === 'supabase' && !supabaseError && isSupabaseLoggedIn && (
        <div className="alert alert-info">
          <strong>Supabase 모드:</strong> 실제 데이터베이스와 인증이 적용됩니다.
          {isAdminUser ? ' (어드민 권한 확인됨)' : ' (고객 권한)'}
          <button
            className="btn btn-secondary"
            onClick={handleLogout}
            style={{ marginLeft: '20px', padding: '6px 12px', fontSize: '12px' }}
          >
            로그아웃
          </button>
        </div>
      )}

      {mode === 'supabase' && loading && <p role="status">로그인 상태 확인 중...</p>}
      {mode === 'supabase' && !loading && !supabaseError && !isSupabaseLoggedIn && (
        <LoginPage role={adminEntry ? 'admin' : 'customer'} onLoginSuccess={handleLoginSuccess} />
      )}
      {mode === 'supabase' && !loading && isSupabaseLoggedIn && adminEntry && !isAdminUser && (
        <div className="alert alert-error" role="alert">관리자 권한이 필요합니다. 로그아웃 후 관리자 계정으로 로그인하세요.</div>
      )}

      {mode === 'local' && role === 'customer' && <CustomerPage db={db} mode={mode} />}
      {mode === 'local' && role === 'admin' && <AdminPage db={db} mode={mode} />}
      {mode === 'supabase' && !loading && !supabaseError && isSupabaseLoggedIn && !adminEntry && <CustomerPage db={db} mode={mode} />}
      {mode === 'supabase' && !loading && !supabaseError && isSupabaseLoggedIn && adminEntry && isAdminUser && <AdminPage db={db} mode={mode} />}

      <hr style={{ margin: '40px 0', borderColor: '#ddd' }} />
      <div style={{ fontSize: '12px', color: '#666', textAlign: 'center', paddingBottom: '20px' }}>
        <p>cal.dudu-works.com v1.0 - 수업용 기본 실습 앱</p>
        <p>기본값: 42슬롯(14일 × 3시간대), 고객 1-3개 희망, 어드민 수동 확정</p>
      </div>
    </div>
  );
};

// 주소 경로로 진입 화면을 결정하므로 직접 접속과 새로고침에도 같은 화면을 표시합니다.
const App: React.FC = () => window.location.pathname === '/' ? <EntryPage /> : <BookingApp />;

export default App;

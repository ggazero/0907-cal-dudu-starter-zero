import React, { useState, useEffect } from 'react';
import { CustomerPage } from '../components/CustomerPage';
import { AdminPage } from '../components/AdminPage';
import { DatabaseManager } from '../utils/database';
import { REFERENCE_TIME } from '../utils/constants';
import { initSupabase, isAdmin } from '../utils/supabase';

type Mode = 'local' | 'supabase';
type Role = 'customer' | 'admin';

const App: React.FC = () => {
  const [mode, setMode] = useState<Mode>('local');
  const [role, setRole] = useState<Role>('customer');
  const [db] = useState(() => new DatabaseManager());
  const [supabaseError, setSupabaseError] = useState<string>('');
  const [isAdminUser, setIsAdminUser] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Supabase 모드로 전환 시 관리자 권한 확인
    if (mode === 'supabase') {
      checkAdminStatus();
    }
  }, [mode]);

  const checkAdminStatus = async () => {
    try {
      setLoading(true);
      initSupabase();
      const admin = await isAdmin();
      setIsAdminUser(admin);
      setSupabaseError('');
    } catch (error) {
      setSupabaseError(`Supabase 연결 오류: ${String(error)}`);
      setMode('local');
    } finally {
      setLoading(false);
    }
  };

  const handleModeChange = (newMode: Mode) => {
    if (newMode === 'supabase') {
      setSupabaseError('');
      checkAdminStatus();
      setMode(newMode);
    } else {
      setMode(newMode);
      setSupabaseError('');
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
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
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
          </div>

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

      {mode === 'supabase' && !supabaseError && (
        <div className="alert alert-info">
          <strong>Supabase 모드:</strong> 실제 데이터베이스와 인증이 적용됩니다.
          {isAdminUser ? ' (어드민 권한 확인됨)' : ' (고객 권한)'}
        </div>
      )}

      {role === 'customer' && <CustomerPage db={db} mode={mode} />}
      {role === 'admin' && mode === 'local' && <AdminPage db={db} mode={mode} />}
      {mode === 'supabase' && isAdminUser && <AdminPage db={db} mode={mode} />}

      <hr style={{ margin: '40px 0', borderColor: '#ddd' }} />
      <div style={{ fontSize: '12px', color: '#666', textAlign: 'center', paddingBottom: '20px' }}>
        <p>cal.dudu-works.com v1.0 - 수업용 기본 실습 앱</p>
        <p>기본값: 42슬롯(14일 × 3시간대), 고객 1-3개 희망, 어드민 수동 확정</p>
      </div>
    </div>
  );
};

export default App;

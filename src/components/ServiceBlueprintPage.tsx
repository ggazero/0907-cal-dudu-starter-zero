import React, { useState } from 'react';

export const ServiceBlueprintPage: React.FC<{ onBack: () => void; initialView?: 'asis' | 'tobe' | 'full' }> = ({ onBack, initialView = 'full' }) => {
  const [view, setView] = useState<'asis' | 'tobe' | 'full'>(initialView);
  const stepData = [
    {
      step: 1,
      title: '서비스 진입',
      asis: {
        고객: '로그인 후 예약 서비스 진입',
        화면: '로그인 / 예약 화면',
        관리자: '관리자 계정으로 별도 진입',
        시스템: 'Supabase Auth 인증',
      },
      tobe: {
        고객: '로그인 전에 서비스 설명과 예약 가능한 일정을 먼저 확인',
        화면: '로그인 / 예약 화면',
        관리자: '관리자 계정으로 별도 진입',
        시스템: 'Supabase Auth 인증',
      },
      changed: true,
    },
    {
      step: 2,
      title: '상담 신청',
      asis: {
        고객: '희망 시간 1~3개 선택 후 제출',
        화면: '예약 가능한 슬롯 선택',
        관리자: '신청 내역 확인',
        시스템: '신청 및 후보 정보 저장',
      },
      tobe: {
        고객: '원하는 날짜와 시간 선택',
        화면: '예약 가능한 슬롯 선택',
        관리자: '신청 내역 확인',
        시스템: '신청 및 후보 정보 저장',
      },
      changed: false,
    },
    {
      step: 3,
      title: '신청 완료·대기',
      asis: {
        고객: '앱에서 신청 상태 확인',
        화면: '접수 / 대기 상태 확인',
        관리자: '신청 후보 검토',
        시스템: '신청 상태 유지',
      },
      tobe: {
        고객: '선택한 날짜, 시간을 최종 확인 후 제출',
        화면: '신청 내용 확인 화면',
        관리자: '신청 후보 검토',
        시스템: '신청 상태 유지',
      },
      changed: false,
    },
    {
      step: 4,
      title: '관리자 검토',
      asis: {
        고객: '관리자 처리를 기다림',
        화면: '별도 변화 없음',
        관리자: '신청 후보 중 하나를 검토하여 확정',
        시스템: '확정 처리 및 슬롯 마감',
      },
      tobe: {
        고객: '신청 마지막 단계에서 로그인/회원가입 후 제출',
        화면: '로그인 후 예약 신청 저장',
        관리자: '신청 후보 중 하나를 검토하여 확정',
        시스템: '확정 처리 및 슬롯 마감 (Supabase Auth 유지)',
      },
      changed: true,
    },
    {
      step: 5,
      title: '결과 확인',
      asis: {
        고객: '확정 또는 재선택 필요 여부 확인',
        화면: '확정 / 재선택 상태',
        관리자: '필요 시 재선택 처리',
        시스템: '신청 상태 변경',
      },
      tobe: {
        고객: '확정 또는 재선택 필요 여부 확인',
        화면: '확정 / 재선택 상태',
        관리자: '필요 시 재선택 처리',
        시스템: '신청 상태 변경',
      },
      changed: false,
    },
    {
      step: 6,
      title: '확정대기·재신청',
      isPain: true,
      asis: {
        고객: '재선택 후 다시 신청하고 확정 여부를 반복 확인',
        화면: '미확정 상태 확인',
        관리자: '재신청 일정을 다시 검토하여 확정',
        시스템: '새 후보 저장 후 관리자 확정 대기',
      },
      tobe: {
        고객: '재선택 후 다시 신청하면 확정/재선택 여부를 알림으로 수신',
        화면: '상태 변경 알림 표시 / 앱에서 현재 신청 상태 확인',
        관리자: '재신청 일정을 다시 검토하여 확정 (기존 방식 유지)',
        시스템: '새 후보 저장 후 상태 변경 시 고객에게 알림 제공',
      },
      changed: true,
      painPoint: '재신청 후 관리자 확정 시점을 알 수 없어 고객이 앱을 반복 확인해야 하고 일정 조율이 어렵다.',
    },
  ];

  return (
    <div style={{ minHeight: '100vh', background: '#fafafa' }}>
      {/* 헤더 */}
      <div style={{ padding: '20px', borderBottom: '1px solid #ddd', background: 'white' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <button
            className="btn btn-secondary"
            onClick={onBack}
            style={{ padding: '8px 16px', fontSize: '14px' }}
          >
            ← 돌아가기
          </button>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              className={`btn ${view === 'asis' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setView('asis')}
              style={{ padding: '8px 16px', fontSize: '12px' }}
            >
              AS-IS만 보기
            </button>
            <button
              className={`btn ${view === 'tobe' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setView('tobe')}
              style={{ padding: '8px 16px', fontSize: '12px' }}
            >
              TO-BE만 보기
            </button>
            <button
              className={`btn ${view === 'full' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setView('full')}
              style={{ padding: '8px 16px', fontSize: '12px' }}
            >
              전체 비교
            </button>
          </div>
        </div>
        <h1>서비스 개선 과정</h1>
        <p style={{ color: '#666', fontSize: '14px', marginTop: '10px' }}>
          Step 6의 Pain Point를 해결하기 위한 개선 전후 비교
        </p>
      </div>

      {/* 메인 컨텐츠 */}
      <div style={{ padding: '40px 20px', maxWidth: '1400px', margin: '0 auto' }}>
        {/* AS-IS */}
        {(view === 'asis' || view === 'full') && (
          <div style={{ marginBottom: '80px' }}>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: '30px', gap: '20px' }}>
              <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 'bold' }}>📋 AS-IS: 현재 예약 프로세스</h2>
              <div style={{ flex: 1, height: '1px', background: '#ddd' }} />
            </div>

            {/* 가로 흐름 */}
            <div style={{ display: 'flex', gap: '12px', overflowX: 'auto', paddingBottom: '20px' }}>
              {stepData.map((data, idx) => (
                <div
                  key={`asis-${idx}`}
                  style={{
                    minWidth: '220px',
                    padding: '16px',
                    borderRadius: '4px',
                    background: data.isPain ? '#fff5f5' : 'white',
                    border: data.isPain ? '2px solid #d9534f' : '1px solid #ddd',
                    flexShrink: 0,
                  }}
                >
                  <div
                    style={{
                      background: data.isPain ? '#d9534f' : '#f0f0f0',
                      color: data.isPain ? 'white' : '#333',
                      padding: '8px 12px',
                      borderRadius: '3px',
                      marginBottom: '12px',
                      fontSize: '12px',
                      fontWeight: 'bold',
                    }}
                  >
                    {data.isPain && '⚠️ '}Step {data.step}. {data.title}
                  </div>

                  <div style={{ fontSize: '12px', lineHeight: '1.5', color: '#333' }}>
                    <p style={{ margin: '0 0 8px 0' }}>
                      <strong>고객:</strong> {data.asis.고객}
                    </p>
                    <p style={{ margin: '0 0 8px 0' }}>
                      <strong>화면:</strong> {data.asis.화면}
                    </p>
                    <p style={{ margin: '0 0 8px 0' }}>
                      <strong>관리자:</strong> {data.asis.관리자}
                    </p>
                    <p style={{ margin: '0' }}>
                      <strong>시스템:</strong> {data.asis.시스템}
                    </p>
                  </div>

                  {data.isPain && (
                    <div
                      style={{
                        marginTop: '12px',
                        padding: '10px',
                        background: '#ffcccc',
                        borderRadius: '3px',
                        borderLeft: '3px solid #d9534f',
                        fontSize: '11px',
                        color: '#8b0000',
                        fontWeight: 'bold',
                      }}
                    >
                      Pain Point: {data.painPoint}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TO-BE */}
        {(view === 'tobe' || view === 'full') && (
        <div style={{ marginBottom: '60px' }}>
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: '30px', gap: '20px' }}>
            <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 'bold' }}>🎯 TO-BE: 개선된 예약 프로세스</h2>
            <div style={{ flex: 1, height: '1px', background: '#ddd' }} />
            </div>

            {/* 가로 흐름 */}
            <div style={{ display: 'flex', gap: '12px', overflowX: 'auto', paddingBottom: '20px' }}>
              {stepData.map((data, idx) => (
                <div
                  key={`tobe-${idx}`}
                  style={{
                    minWidth: '220px',
                    padding: '16px',
                    borderRadius: '4px',
                    background: data.changed ? '#f0f8ff' : 'white',
                    border: data.changed ? '2px solid #0066cc' : '1px solid #ddd',
                    flexShrink: 0,
                    position: 'relative',
                  }}
                >
                  <div
                    style={{
                      background: data.changed ? '#0066cc' : '#f0f0f0',
                      color: data.changed ? 'white' : '#333',
                      padding: '8px 12px',
                      borderRadius: '3px',
                      marginBottom: '12px',
                      fontSize: '12px',
                      fontWeight: 'bold',
                    }}
                  >
                    {data.changed && '✨ '}Step {data.step}. {data.title}
                  </div>

                  <div style={{ fontSize: '12px', lineHeight: '1.5', color: '#333' }}>
                    <p style={{ margin: '0 0 8px 0' }}>
                      <strong>고객:</strong> {data.tobe.고객}
                    </p>
                    <p style={{ margin: '0 0 8px 0' }}>
                      <strong>화면:</strong> {data.tobe.화면}
                    </p>
                    <p style={{ margin: '0 0 8px 0' }}>
                      <strong>관리자:</strong> {data.tobe.관리자}
                    </p>
                    <p style={{ margin: '0' }}>
                      <strong>시스템:</strong> {data.tobe.시스템}
                    </p>
                  </div>

                  {data.changed && (
                    <div
                      style={{
                        marginTop: '12px',
                        padding: '8px',
                        background: '#e6f2ff',
                        borderRadius: '3px',
                        borderLeft: '3px solid #0066cc',
                        fontSize: '10px',
                        color: '#0066cc',
                      }}
                    >
                      변경됨
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 개선 이유 */}
        <div style={{ background: 'white', padding: '24px', borderRadius: '4px', border: '1px solid #ddd' }}>
          <h3 style={{ marginTop: 0 }}>💡 개선 이유</h3>
          <p style={{ fontSize: '14px', lineHeight: '1.8', color: '#333', margin: 0 }}>
            재신청 후 관리자 확정 시점을 알 수 없어 고객이 앱을 반복적으로 확인해야 하는 문제를 줄이기 위해, 기존의 관리자 최종 확정 방식은 유지하면서 확정 또는 재선택 필요 시 고객에게 상태 변경 알림을 제공하도록 개선했습니다.
          </p>
        </div>
      </div>

      {/* 푸터 */}
      <div style={{ padding: '40px 20px', textAlign: 'center', borderTop: '1px solid #ddd' }}>
        <button
          className="btn btn-secondary"
          onClick={onBack}
          style={{ padding: '10px 20px', fontSize: '14px' }}
        >
          ← 돌아가기
        </button>
      </div>
    </div>
  );
};
